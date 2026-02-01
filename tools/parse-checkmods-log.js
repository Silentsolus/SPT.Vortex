#!/usr/bin/env node
// Simple parser for SPT-Check-Mods logs to extract GUIDs and Forge request URLs
// Usage: node tools/parse-checkmods-log.js /path/to/checkmod.log

const fs = require('fs');
const path = require('path');

const inPath = process.argv[2] || path.join(process.cwd(), 'checkmod.log');
const outDir = path.join(process.cwd(), 'artifacts');
const outPath = path.join(outDir, 'checkmods-extracted.json');

if (!fs.existsSync(inPath)) {
  console.error(`Log file not found: ${inPath}`);
  process.exit(2);
}

const raw = fs.readFileSync(inPath, 'utf8');
const lines = raw.split(/\r?\n/);

const guidRegex = /\b(com\.[a-z0-9_.-]{3,})\b/gi;
const forgeUrlRegex = /https:\/\/forge\.sp-tarkov\.com\/api\/v0\/[\S]*/gi;
const matchLineRegex = /Matched.*?(?:GUID|guid|->)[:\s]+([\w.\-_/]{3,})/i; // heuristic

const guids = new Set();
const forgeRequests = new Set();
const matches = [];

for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (!l) continue;

  let m;
  while ((m = guidRegex.exec(l)) !== null) {
    guids.add(m[1]);
  }

  while ((m = forgeUrlRegex.exec(l)) !== null) {
    forgeRequests.add(m[0]);
  }

  const mm = matchLineRegex.exec(l);
  if (mm && mm[1]) {
    // save context: previous non-empty lines for context and to find the GUID or query used
    let local = null;
    const contextLines = [];
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
      const pl = lines[j].trim();
      if (pl) {
        contextLines.push(pl);
        if (!local) local = pl;
      }
    }

    // Try to extract a GUID from nearby Forge API request lines (e.g., filter[guid]=com.author.mod)
    let matchedGuid = null;
    let matchedQuery = null;
    const contextText = contextLines.join(' ');

    const guidMatch = /filter\[guid\]=([^&\s]+)/i.exec(contextText) || /mods\?filter\[guid\]=([^&\s]+)/i.exec(contextText);
    if (guidMatch && guidMatch[1]) {
      matchedGuid = decodeURIComponent(guidMatch[1]);
    } else {
      const qMatch = /mods\?query=([^&\s]+)/i.exec(contextText);
      if (qMatch && qMatch[1]) {
        matchedQuery = decodeURIComponent(qMatch[1]);
      }
    }

    // Try to capture a JSON response block within the next ~50 lines
    let responseJson = null;
    for (let j = i + 1; j <= Math.min(i + 50, lines.length - 1); j++) {
      const cand = lines[j].trim();
      if (!cand) continue;
      if (cand.startsWith('{') || cand.startsWith('[')) {
        // collect lines until balanced
        let depth = 0;
        let collected = '';
        let started = false;
        for (let k = j; k <= Math.min(j + 500, lines.length - 1); k++) {
          const cl = lines[k];
          collected += cl + '\n';
          for (const ch of cl) {
            if (ch === '{' || ch === '[') { depth++; started = true; }
            if (ch === '}' || ch === ']') depth--;
          }
          if (started && depth === 0) {
            try { responseJson = JSON.parse(collected); } catch (_) { responseJson = null; }
            break;
          }
        }
        break;
      }
    }

    matches.push({ line: i + 1, text: l.trim(), matchedToken: mm[1], localContext: local, matchedGuid, matchedQuery, contextLines, responseJson });
  }
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const out = {
  generatedAt: new Date().toISOString(),
  source: inPath,
  guids: Array.from(guids).sort(),
  forgeRequests: Array.from(forgeRequests).sort(),
  matches,
};

// Also write any captured JSON responses into a separate file (url -> array of responses)
const responsesByUrl = {};
for (const m of matches) {
  if (m && Array.isArray(m.contextLines)) {
    for (const cl of m.contextLines) {
      const rq = (cl.match(/https:\/\/forge\.sp-tarkov\.com\/api\/v0\/[\S]*/i) || [])[0];
      if (rq && m.responseJson) {
        responsesByUrl[rq] = responsesByUrl[rq] || [];
        responsesByUrl[rq].push(m.responseJson);
      }
    }
  }
}

const responsesPath = path.join(outDir, 'forge-responses.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
fs.writeFileSync(responsesPath, JSON.stringify(responsesByUrl, null, 2), 'utf8');
console.log(`Wrote extracted data to ${outPath}`);
console.log(`Wrote extracted JSON responses to ${responsesPath}`);
console.log(`GUIDs: ${out.guids.length}, Forge requests: ${out.forgeRequests.length}, matches: ${out.matches.length}`);
