// Parse a log snippet file containing lines with "API Response: <url>: <json>"
// Usage: node scripts/parse_forge_snippets.js <input-file> <output-file>
const fs = require('fs');
const path = require('path');

const input = process.argv[2] || 'D:/forge-response-snippets.txt';
const output = process.argv[3] || path.join(__dirname, '..', 'artifacts', 'forge-responses.json');

if (!fs.existsSync(input)) {
  console.error('Input file not found:', input);
  process.exit(2);
}

const content = fs.readFileSync(input, 'utf8');
const lines = content.split(/\r?\n/);

const entries = [];
for (const line of lines) {
  const idx = line.indexOf('API Response:');
  if (idx === -1) continue;
  const after = line.substring(idx + 'API Response:'.length).trim();
  const braceIdx = after.indexOf('{');
  if (braceIdx === -1) continue;
  const url = after.substring(0, braceIdx).trim();
  const jsonStr = after.substring(braceIdx).trim();
  try {
    const parsed = JSON.parse(jsonStr);
    entries.push({ url, response: parsed, raw: jsonStr });
  } catch (e) {
    // try to fix common issues: trailing commas
    try {
      const fixed = jsonStr.replace(/,(\s*[}\]])/g, '$1');
      const parsed = JSON.parse(fixed);
      entries.push({ url, response: parsed, raw: jsonStr });
    } catch (e2) {
      // store raw (likely truncated) so we don't lose data
      const truncated = jsonStr.length >= 32000 || jsonStr.endsWith('...');
      entries.push({ url, response: null, raw: jsonStr, truncated: truncated, error: e2.message });
    }
  }
}

if (!fs.existsSync(path.dirname(output))) fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(entries, null, 2), 'utf8');
console.log('Wrote', entries.length, 'entries to', output);
