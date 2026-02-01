const path = require('path');
const p = path.join(__dirname, '..', 'artifacts', 'forge-responses.json');
const f = require(p);
for (const k of Object.keys(f)) {
  for (const r of f[k]) {
    if (!r) continue;
    const isTrunc = r.truncated || (r.raw && String(r.raw).includes('... (truncated)'));
    if (isTrunc) {
      console.log('URL:', k);
      console.log('rawLen:', r.raw ? r.raw.length : 'n/a');
      console.log('truncated flag:', !!r.truncated);
      console.log('first200:', r.raw ? r.raw.slice(0,200).replace(/\n/g,'') : '');
      console.log('---');
    }
  }
}
