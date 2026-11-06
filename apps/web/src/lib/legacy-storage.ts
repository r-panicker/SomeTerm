// Settings saved under the app's earlier name move to the current keys once.
// Imported before anything that reads localStorage at module load.
try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('superserial.')) continue;
    const next = `someterm.${key.slice('superserial.'.length)}`;
    if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key)!);
    localStorage.removeItem(key);
  }
} catch { /* storage unavailable */ }
