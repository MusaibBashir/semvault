// Reads course / year / term / exam out of a question paper filename.
// Fills what it can, leaves the rest null, never throws.
export function parsePyqFilename(name) {
  const out = { course: null, year: null, term: null, exam: null };
  const base = String(name || '').replace(/\.[A-Za-z0-9]+$/, '');
  for (const tok of base.split(/[_\-\s.()&]+/)) {
    const t = tok.toLowerCase();
    if (!out.course && /^[a-z]{2}\d{5}$/.test(t)) out.course = tok.toUpperCase();
    else if (!out.year && /^20\d{2}$/.test(t)) out.year = Number(t);
    else if (!out.term && (t === 'autumn' || t === 'spring')) out.term = t;
    else if (!out.exam && (t === 'mid' || t === 'midsem')) out.exam = 'midsem';
    else if (!out.exam && (t === 'end' || t === 'endsem')) out.exam = 'endsem';
  }
  return out;
}
