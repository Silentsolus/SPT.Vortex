const path = require('path');
const p = path.join(__dirname, '..', 'artifacts', 'forge-responses.json');
const f = require(p);
const urls = Object.keys(f);
const totalResponses = urls.reduce((s,k)=>s + (Array.isArray(f[k]) ? f[k].length : 0), 0);
const parsed = urls.reduce((s,k)=>s + (Array.isArray(f[k]) ? f[k].filter(r=>r && Object.keys(r).length>0 && r.raw===undefined).length : 0), 0);
const withRaw = urls.reduce((s,k)=>s + (Array.isArray(f[k]) ? f[k].filter(r=>r && r.raw).length : 0), 0);
const truncated = urls.reduce((s,k)=>s + (Array.isArray(f[k]) ? f[k].filter(r=>r && (r.truncated || (r.raw && String(r.raw).includes('... (truncated)')))).length : 0), 0);
console.log('URLs:', urls.length);
console.log('totalResponses:', totalResponses);
console.log('parsedResponses:', parsed);
console.log('entriesWithRaw:', withRaw);
console.log('likelyTruncated:', truncated);

// Print a few URLs that are truncated
const truncatedUrls = [];
for (const k of urls) {
  const list = (f[k] || []).filter(r=>r && (r.truncated || (r.raw && String(r.raw).includes('... (truncated)'))));
  if (list.length) truncatedUrls.push({ url: k, count: list.length });
}
console.log('Truncated URL samples (first 8):', truncatedUrls.slice(0,8));
