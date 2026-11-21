// Browser-side checks before any bytes are sent. The server repeats them (validateUpload).
export const MAX_BYTES = 25 * 1024 * 1024;

export function uploadErrors({ title, course, file, source }) {
  const e = {};
  if (!String(title || '').trim()) e.title = 'Give it a title';
  if (!course) e.course = 'Pick a course';
  else if (course.startsWith('OTHER:') && !course.slice(6).trim()) e.course = 'Type the course name';
  if (!file) e.file = 'Choose a file';
  else if (file.size > MAX_BYTES) e.file = 'Max 25 MB per file';
  if (source) {
    if (!/\.(tex|zip)$/i.test(source.name)) e.source = 'Source must be a .tex or .zip file';
    else if (source.size > MAX_BYTES) e.source = 'Max 25 MB per file';
  }
  return e;
}

export function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}
