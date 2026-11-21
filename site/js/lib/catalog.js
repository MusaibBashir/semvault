// Pure helpers for shaping the public catalog into pages.

export const TYPE_ORDER = ['formula', 'notes', 'pyq', 'lab', 'assignment', 'other'];
export const TYPE_LABELS = {
  formula: 'Formula sheets', notes: 'Notes', pyq: 'Question papers',
  lab: 'Lab', assignment: 'Assignments', other: 'Other',
};

export function semesters(courses) {
  const bySem = new Map();
  for (const c of courses) {
    if (!bySem.has(c.semester)) bySem.set(c.semester, []);
    bySem.get(c.semester).push(c);
  }
  return [...bySem.keys()].sort((a, b) => a - b).map((semester) => ({
    semester,
    courses: bySem.get(semester).sort((a, b) => a.code.localeCompare(b.code)),
  }));
}

const orderKey = (x) => (x.startOrder === '' || x.startOrder == null ? Infinity : Number(x.startOrder));

export function coursePage(items, code) {
  const mine = items.filter((x) => x.course === code);
  const startHere = mine.filter((x) => x.startHere).sort((a, b) => orderKey(a) - orderKey(b));
  const rest = mine.filter((x) => !x.startHere);
  const groups = TYPE_ORDER
    .map((type) => ({ type, items: rest.filter((x) => x.type === type) }))
    .filter((g) => g.items.length > 0);
  return { startHere, groups };
}

export function filterPyqs(items, f) {
  const examRank = { endsem: 0, midsem: 1 };
  return items
    .filter((x) => x.type === 'pyq')
    .filter((x) => !f.course || x.course === f.course)
    .filter((x) => !f.year || String(x.year) === String(f.year))
    .filter((x) => !f.term || x.term === f.term)
    .filter((x) => !f.exam || x.exam === f.exam)
    .sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0)
      || (examRank[a.exam] ?? 2) - (examRank[b.exam] ?? 2));
}

export function search(items, courses, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return [];
  const byCode = new Map(courses.map((c) => [c.code, c]));
  return items.filter((x) => {
    const c = byCode.get(x.course) || {};
    return [x.title, x.description, x.course, c.name, c.short]
      .some((s) => String(s || '').toLowerCase().includes(needle));
  });
}

export function driveUrls(fileId) {
  return {
    view: `https://drive.google.com/file/d/${fileId}/view`,
    download: `https://drive.google.com/uc?export=download&id=${fileId}`,
  };
}
