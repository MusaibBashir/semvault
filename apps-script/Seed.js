// Pure: what importSeed does with one manifest row. Rows are written before files move, so a run
// cut off by the 6-minute limit leaves rows whose files are still in Seed; the next run finishes them.
function seedImportAction(state) {
  if (state.inCatalog) return state.fileInSeed ? 'finish' : 'skip';
  return state.fileInSeed ? 'import' : 'missing';
}
