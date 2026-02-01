// Convert array of {url, response, raw, ...} into { [url]: [response, ...] }
const fs = require('fs');
const path = require('path');
const input = path.join(__dirname, '..', 'artifacts', 'forge-responses.json');
const backup = path.join(__dirname, '..', 'artifacts', 'forge-responses-raw.json');

if (!fs.existsSync(input)) {
  console.error('Input not found:', input);
  process.exit(1);
}

const arr = JSON.parse(fs.readFileSync(input, 'utf8'));
const out = {};
for (const e of arr) {
  const key = e.url || 'unknown';
  if (!out[key]) out[key] = [];
  out[key].push(e.response !== null ? e.response : { raw: e.raw, truncated: e.truncated, error: e.error });
}

// backup original
fs.writeFileSync(backup, JSON.stringify(arr, null, 2), 'utf8');
fs.writeFileSync(input, JSON.stringify(out, null, 2), 'utf8');
console.log('Converted', arr.length, 'entries into', Object.keys(out).length, 'URLs');
console.log('Backup created at', backup);