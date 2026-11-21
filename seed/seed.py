"""Seed Sem Vault from a semester folder.

  python seed/seed.py scan  "<semester folder>" --out seed/candidates.csv
      Lists every PDF/DOCX/PPTX worth sharing, with a guessed course, type, title and LaTeX source.
      Open the CSV, set include=n on anything you don't want, fix courses and titles,
      and set start_here=y on the few things a junior should read first.

  python seed/seed.py build seed/candidates.csv --root "<semester folder>" --staging seed/staging
      Copies the included files (and their .tex, or a .zip of .tex + figures) into staging/
      with manifest.csv and courses.csv. Drag everything in staging/ into Drive's
      "Sem Vault/Seed" folder, then run importSeed() in the Apps Script editor.
"""
import argparse
import csv
import hashlib
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CANDIDATE_COLUMNS = ['include', 'path', 'course', 'type', 'title', 'source', 'year', 'term', 'exam',
                     'start_here', 'start_order']
MANIFEST_COLUMNS = ['id', 'file', 'source_file', 'source_name', 'course', 'type', 'title', 'year', 'term', 'exam',
                    'start_here', 'start_order']
FILE_EXTS = {'.pdf', '.docx', '.pptx'}
ITEM_TYPES = {'notes', 'formula', 'pyq', 'lab', 'assignment', 'other'}

# Folder names skipped anywhere in the tree: code, build output, backups, figures, notes-app config.
EXCLUDED_DIRS = {'sim', '__pycache__', '.obsidian', '_inbox', '_semvault', 'bin', 'out', 'exam_prep_code',
                 'tex_common', '.git', 'node_modules', 'fig', 'figs', 'figures', 'images', 'img', 'guide-figures',
                 'preview', '.claude', '.superpowers'}
BUILD_JUNK = re.compile(r'\.(aux|log|out|toc|fls|fdb_latexmk|synctex\.gz|bbl|blg|nav|snm|xdv)$', re.I)


def is_excluded(rel_path):
    parts = Path(rel_path).parts[:-1]
    for p in parts:
        low = p.lower()
        if low in EXCLUDED_DIRS or low.endswith('_src') or low.startswith('backup'):
            return True
    return False


def parse_pyq(name):
    """Same rules as site/js/lib/pyq.js parsePyqFilename."""
    out = {'course': None, 'year': None, 'term': None, 'exam': None}
    base = re.sub(r'\.[A-Za-z0-9]+$', '', str(name or ''))
    for tok in re.split(r'[_\-\s.()&]+', base):
        t = tok.lower()
        if not out['course'] and re.fullmatch(r'[a-z]{2}\d{5}', t):
            out['course'] = tok.upper()
        elif not out['year'] and re.fullmatch(r'20\d{2}', t):
            out['year'] = int(t)
        elif not out['term'] and t in ('autumn', 'spring'):
            out['term'] = t
        elif not out['exam'] and t in ('mid', 'midsem'):
            out['exam'] = 'midsem'
        elif not out['exam'] and t in ('end', 'endsem'):
            out['exam'] = 'endsem'
    return out


def guess_type(rel_path):
    low = rel_path.lower().replace('\\', '/')
    segs = low.split('/')
    folders = segs[:-1]
    p = parse_pyq(segs[-1])
    if any(s in ('pyqs', 'pyq', 'endsem papers', 'endsems', 'midsems') for s in folders) or (p['course'] and p['exam']):
        return 'pyq'
    if 'formula' in low:
        return 'formula'
    if 'assignment' in low:
        return 'assignment'
    if any(re.search(r'(^|\s)lab(\s|$|\d)', s) for s in folders):
        return 'lab'
    return 'notes'


def find_source(pdf):
    pdf = Path(pdf)
    if pdf.suffix.lower() != '.pdf':
        return None
    tex = pdf.with_suffix('.tex')
    return tex if tex.exists() else None


INCLUDE_RE = re.compile(r'\\(?:includegraphics(?:\[[^\]]*\])?|input|include)\{([^}]+)\}')


def needs_bundle(tex_text):
    return bool(INCLUDE_RE.search(tex_text))


def bundle_files(tex):
    """The main .tex plus every file it pulls in (recursively), and local .sty/.cls/.bib."""
    tex = Path(tex)
    base = tex.parent
    found, queue = {tex}, [tex]
    while queue:
        cur = queue.pop()
        text = cur.read_text(encoding='utf-8', errors='ignore')
        for ref in INCLUDE_RE.findall(text):
            for ext in ('', '.tex', '.pdf', '.png', '.jpg', '.jpeg', '.eps', '.svg'):
                cand = (cur.parent / (ref.strip() + ext))
                if cand.is_file():
                    if cand not in found:
                        found.add(cand)
                        if cand.suffix == '.tex':
                            queue.append(cand)
                    break
    for extra in base.iterdir():
        if extra.is_file() and extra.suffix.lower() in ('.sty', '.cls', '.bib'):
            found.add(extra)
    return sorted((f for f in found if not BUILD_JUNK.search(f.name)), key=lambda f: str(f))


def nice_title(path, course_short=None):
    p = parse_pyq(path.name)
    if p['exam'] and course_short:
        sol = ' with solutions' if 'solution' in path.name.lower() else ''
        return f"{course_short} {p['exam']} {p['year'] or ''}".strip() + sol
    t = re.sub(r'[_\-]+', ' ', path.stem)
    return re.sub(r'\s+', ' ', t).strip()


def course_for(rel_path, conf):
    rel = rel_path.replace('\\', '/')
    best = ''
    for prefix in conf.get('folders', {}):
        if (rel == prefix or rel.startswith(prefix + '/')) and len(prefix) > len(best):
            best = prefix
    code = conf['folders'][best] if best else ''
    p = parse_pyq(Path(rel).name)
    return code or (p['course'] or '')


def scan_rows(root, conf):
    root = Path(root)
    shorts = {c['code']: c.get('short') or c['code'] for c in conf.get('courses', [])}
    rows = []
    for f in sorted(root.rglob('*')):
        if not f.is_file() or f.suffix.lower() not in FILE_EXTS:
            continue
        rel = f.relative_to(root).as_posix()
        if is_excluded(rel):
            continue
        course = course_for(rel, conf)
        kind = guess_type(rel)
        src = find_source(f)
        p = parse_pyq(f.name) if kind == 'pyq' else {'year': None, 'term': None, 'exam': None}
        # "Notes (1).pdf" next to "Notes.pdf" is almost always a duplicate download.
        dup = re.search(r'\s\(\d+\)$', f.stem) and f.with_name(re.sub(r'\s\(\d+\)$', '', f.stem) + f.suffix).exists()
        rows.append({
            'include': 'n' if dup else 'y', 'path': rel, 'course': course, 'type': kind,
            'title': nice_title(f, shorts.get(course)), 'source': src.relative_to(root).as_posix() if src else '',
            'year': p['year'] or '', 'term': p['term'] or '', 'exam': p['exam'] or '',
            'start_here': 'y' if kind == 'formula' else '', 'start_order': '',
        })
    return rows


def item_id(rel_path):
    return 'it_' + hashlib.sha1(rel_path.encode('utf-8')).hexdigest()[:8]


def build(candidates, root, staging, conf):
    root, staging = Path(root), Path(staging)
    with open(candidates, encoding='utf-8-sig', newline='') as f:
        rows = [r for r in csv.DictReader(f) if r.get('include', '').strip().lower() == 'y']
    problems = []
    for r in rows:
        if not r['course'].strip():
            problems.append(f"{r['path']}: no course")
        if r['type'].strip() not in ITEM_TYPES:
            problems.append(f"{r['path']}: type must be one of {', '.join(sorted(ITEM_TYPES))}")
        if not (root / r['path']).is_file():
            problems.append(f"{r['path']}: file not found")
    if problems:
        sys.exit('Fix these rows in the CSV first:\n  ' + '\n  '.join(problems))

    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True)
    next_order = {}
    manifest = []
    for r in rows:
        src_path = root / r['path']
        iid = item_id(r['path'])
        fname = iid + src_path.suffix.lower()
        shutil.copy2(src_path, staging / fname)
        source_file = source_name = ''
        if r.get('source', '').strip():
            tex = root / r['source'].strip()
            parts = bundle_files(tex) if needs_bundle(tex.read_text(encoding='utf-8', errors='ignore')) else [tex]
            if len(parts) > 1:
                source_file, source_name = iid + '.src.zip', tex.stem + '.zip'
                with zipfile.ZipFile(staging / source_file, 'w', zipfile.ZIP_DEFLATED) as z:
                    for part in parts:
                        z.write(part, part.relative_to(tex.parent).as_posix())
            else:
                source_file, source_name = iid + '.src' + tex.suffix.lower(), tex.name
                shutil.copy2(tex, staging / source_file)
        course = r['course'].strip().upper()
        start = r.get('start_here', '').strip().lower() == 'y'
        order = r.get('start_order', '').strip()
        if start and not order:
            next_order[course] = next_order.get(course, 0) + 1
            order = str(next_order[course])
        manifest.append({
            'id': iid, 'file': fname, 'source_file': source_file, 'source_name': source_name, 'course': course,
            'type': r['type'].strip(), 'title': r['title'].strip(), 'year': r.get('year', ''), 'term': r.get('term', ''),
            'exam': r.get('exam', ''), 'start_here': 'y' if start else '', 'start_order': order if start else '',
        })

    with open(staging / 'manifest.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=MANIFEST_COLUMNS)
        w.writeheader()
        w.writerows(manifest)
    used = {m['course'] for m in manifest}
    with open(staging / 'courses.csv', 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=['code', 'name', 'short', 'semester'])
        w.writeheader()
        for c in conf.get('courses', []):
            if c['code'] in used:
                w.writerow({k: c.get(k, '') for k in ('code', 'name', 'short', 'semester')})
    return manifest


def load_conf(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('scan')
    s.add_argument('root')
    s.add_argument('--out', default=str(HERE / 'candidates.csv'))
    s.add_argument('--courses', default=str(HERE / 'courses.json'))
    b = sub.add_parser('build')
    b.add_argument('candidates')
    b.add_argument('--root', required=True)
    b.add_argument('--staging', default=str(HERE / 'staging'))
    b.add_argument('--courses', default=str(HERE / 'courses.json'))
    a = ap.parse_args(argv)
    conf = load_conf(a.courses)

    if a.cmd == 'scan':
        rows = scan_rows(a.root, conf)
        with open(a.out, 'w', newline='', encoding='utf-8-sig') as f:  # -sig so Excel shows names correctly
            w = csv.DictWriter(f, fieldnames=CANDIDATE_COLUMNS)
            w.writeheader()
            w.writerows(rows)
        missing = sorted({r['path'].split('/')[0] for r in rows if not r['course']})
        print(f"{len(rows)} files listed in {a.out} ({sum(r['include'] == 'y' for r in rows)} included).")
        if missing:
            print('No course for files under: ' + ', '.join(missing) + '. Fill the course column or add them to courses.json.')
    else:
        m = build(a.candidates, a.root, a.staging, conf)
        print(f"{len(m)} items staged in {a.staging}. Drag its contents into Drive's 'Sem Vault/Seed' folder, then run importSeed().")


if __name__ == '__main__':
    main()
