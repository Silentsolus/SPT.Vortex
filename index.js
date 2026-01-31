/* SPT Forge Vortex Extension (index.js)
 *
 * Notes (testing build):
 * - Forge API key + SPT version are hardcoded defaults below (can still be overridden by env vars).
 * - Enrich scans the Vortex staging folder, extracts Forge GUID/version from BepInEx plugin DLLs
 *   (BepInPlugin attribute) or falls back to heuristics for server-only mods.
 * - Update checks Forge /mods/updates using GUID:version pairs.
 */

const path = require('path');
const https = require('https');

const { actions, fs, log, types, util } = require('vortex-api');

// -----------------------------
// Hardcoded defaults (testing)
// -----------------------------
const HARD_CODED_FORGE_API_KEY = process.env.FORGE_API_KEY || '2GmqDh3JjHMejll8WeHMBnbi0O4JIOgVFQnl7PnW0dbb7e57';
const HARD_CODED_SPT_VERSION = process.env.SPT_VERSION || '4.0.11';

// -----------------------------
// Game constants
// -----------------------------
const GAME_ID = 'eftsptaki';
const GAME_NAME = 'Escape From Tarkov: SPT';

// -----------------------------
// Settings (optional; hardcoded defaults used if empty)
// -----------------------------
const SETTINGS_PATH = ['settings', 'sptvortex'];
const ACTION_SET_KEY = 'sptvortex-set-forge-key';
const ACTION_SET_SPT = 'sptvortex-set-spt-version';
const ACTION_ENRICH = 'sptvortex-enrich-mods';
const ACTION_UPDATES = 'sptvortex-check-updates';

function getSettings(state) {
  const s = util.getSafe(state, SETTINGS_PATH, {});
  return (s && typeof s === 'object') ? s : {};
}

function settingsReducer(state = {}, action) {
  if (action?.type === 'SPTVORTEX_SET_SETTING') {
    const { key, value } = action.payload || {};
    if (typeof key !== 'string') return state;
    return { ...state, [key]: value };
  }
  return state;
}

function getForgeConfig(api) {
  const state = api.store.getState();
  const s = getSettings(state);

  const apiKey = String((s.forgeApiKey && s.forgeApiKey.trim()) || HARD_CODED_FORGE_API_KEY || '').trim();
  const sptVersion = String((s.sptVersion && s.sptVersion.trim()) || HARD_CODED_SPT_VERSION || '').trim();

  return { apiKey, sptVersion };
}


// Vortex API compatibility: notifications
// Different Vortex versions expose different notification helpers.
function showNotification(api, message, type = 'info', timeout = 4000) {
  try {
    if (api && typeof api.sendNotification === 'function') {
      // Minimal notification payload (extra fields are ignored by Vortex)
      api.sendNotification({
        type,
        message,
        title: 'SPT Forge',
        displayMS: timeout,
        timeout,
      });
      return;
    }

    // Some versions expose showNotification(message, type, timeout)
    if (api && typeof api.showNotification === 'function') {
      showNotification(api, message, type, timeout);
      return;
    }

    // Error fallback
    if (type === 'error' && api && typeof api.showErrorNotification === 'function') {
      api.showErrorNotification('SPT Forge', new Error(message), { allowReport: false });
      return;
    }

    // Very old/limited APIs
    if (api && typeof api.showDialog === 'function') {
      api.showDialog(type === 'error' ? 'error' : 'info', 'SPT Forge', { text: message }, [
        { label: 'Close' },
      ]);
      return;
    }
  } catch (err) {
    // Never let notification issues crash the extension
    console.error('[SPT Forge] Notification failed:', err);
  }

  // Last resort
  console.log(`[SPT Forge] [${type}] ${message}`);
}

// -----------------------------
// Helpers: Forge API (HTTPS JSON)
// -----------------------------
function httpsJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({ status: res.statusCode || 0, ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300, json, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function forgeHeaders(apiKey) {
  const headers = { 'Accept': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  return headers;
}

function buildForgeModsUrl(params) {
  const qs = new URLSearchParams();
  if (params?.per_page) qs.set('per_page', String(params.per_page));
  if (params?.page) qs.set('page', String(params.page));

  if (params?.filter && typeof params.filter === 'object') {
    Object.entries(params.filter).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      qs.append(`filter[${k}]`, String(v));
    });
  }
  return `https://forge.sp-tarkov.com/api/v0/mods?${qs.toString()}`;
}

async function forgeGetModByGuid(apiKey, guid) {
  const url = buildForgeModsUrl({ per_page: 1, filter: { guid } });
  const r = await httpsJson(url, forgeHeaders(apiKey));
  if (!r.ok || !r.json || r.json.success !== true) return null;
  const data = Array.isArray(r.json.data) ? r.json.data : [];
  return data.length ? data[0] : null;
}

async function forgeGetModBySlug(apiKey, slug) {
  const url = buildForgeModsUrl({ per_page: 1, filter: { slug } });
  const r = await httpsJson(url, forgeHeaders(apiKey));
  if (!r.ok || !r.json || r.json.success !== true) return null;
  const data = Array.isArray(r.json.data) ? r.json.data : [];
  return data.length ? data[0] : null;
}

async function forgeGetModByName(apiKey, name) {
  const url = buildForgeModsUrl({ per_page: 1, filter: { name } });
  const r = await httpsJson(url, forgeHeaders(apiKey));
  if (!r.ok || !r.json || r.json.success !== true) return null;
  const data = Array.isArray(r.json.data) ? r.json.data : [];
  return data.length ? data[0] : null;
}

// Fuzzy search helper: try name-based queries and simple scoring
// Fuzzy search: request more results per query to allow broader matching
async function forgeFuzzySearch(apiKey, query, max = 100) {
  if (!query) return [];
  const url = buildForgeModsUrl({ per_page: max, filter: { name: query } });
  const r = await httpsJson(url, forgeHeaders(apiKey));
  if (!r.ok || !r.json || r.json.success !== true) return [];
  return Array.isArray(r.json.data) ? r.json.data : [];
} 

function normalizeNameForCompare(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Simple Levenshtein edit distance (iterative, memory-optimized)
function levenshteinDistance(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  let prev = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    let curr = [i];
    for (let j = 1; j <= bl; j++) {
      const insert = curr[j - 1] + 1;
      const remove = prev[j] + 1;
      const replace = prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      curr[j] = Math.min(insert, remove, replace);
    }
    prev = curr;
  }
  return prev[bl];
}

function levenshteinScore(a, b) {
  a = normalizeNameForCompare(a);
  b = normalizeNameForCompare(b);
  if (!a || !b) return 0;
  const d = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return Math.max(0, 1 - (d / maxLen));
}

function nameScore(a, b) {
  const base = (function () {
    a = normalizeNameForCompare(a);
    b = normalizeNameForCompare(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.9;
    let maxLen = 0;
    for (let i = 0; i < a.length; i++) {
      for (let j = 1; j <= a.length - i; j++) {
        const sub = a.substr(i, j);
        if (b.includes(sub) && sub.length > maxLen) maxLen = sub.length;
      }
    }
    return Math.min(0.85, maxLen / Math.max(a.length, b.length));
  })();

  const lev = levenshteinScore(a, b);
  // Combine heuristics: prefer exact/substring matches but let Levenshtein rescue close typos
  return Math.max(base, 0.6 * lev + 0.4 * base);
}

// Fuzzy matching threshold (tweakable)
const FUZZY_THRESHOLD = 0.5;

// Minimum fuzzy percent score (0-100) to accept a candidate
const MIN_FUZZY_SCORE = 60;

// Treat some GUIDs as non-authoritative (SPT core, Unity, very short names)
function isGenericGuid(guid) {
  if (!guid) return false;
  const g = String(guid).toLowerCase();
  if (g.length < 8) return true;
  const patterns = [/^com\.spt(\.|$)/, /^com\.spt_core(\.|$)/, /^com\.sptcore(\.|$)/, /^unity\./, /^com\.unity(\.|$)/];
  if (patterns.some((re) => re.test(g))) return true;
  if (g.startsWith('com.') && g.includes('core')) return true;
  return false;
}

function slugify(s) {
  return String(s || '').toLowerCase().replace(/([a-z])([A-Z])/g, '$1-$2').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Name normalization utilities (based on SPT-Check-Mods ModNameNormalizer)
function normalizeName(s, removeComponentSuffixes = false) {
  if (!s) return '';
  let out = String(s).toLowerCase();
  // remove - _ . and spaces
  out = out.replace(/[-_. ]+/g, '');
  if (removeComponentSuffixes) {
    const suffixes = ['server', 'client'];
    for (const suf of suffixes) {
      if (out.endsWith(suf)) {
        out = out.slice(0, -suf.length);
        break;
      }
    }
  }
  return out;
}

function removeComponentSuffix(name) {
  if (!name) return name;
  const suffixes = ['Server', 'Client'];
  for (const s of suffixes) {
    if (name.length > s.length && name.endsWith(s)) return name.slice(0, -s.length);
  }
  return name;
}

function extractNameFromGuid(guid) {
  if (!guid) return '';
  const parts = String(guid).split(/[.\-_]/).filter(Boolean);
  if (!parts.length) return guid;
  return parts[parts.length - 1];
}

// Fuzzy percent scoring (0-100) combining Levenshtein and substring heuristics
function fuzzyScorePercent(a, b) {
  a = normalizeName(a);
  b = normalizeName(b);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 90;
  const lev = levenshteinScore(a, b);
  const levPercent = Math.round(lev * 100);

  // substring heuristic: longest common substring fraction
  let maxLen = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 1; j <= a.length - i; j++) {
      const sub = a.substr(i, j);
      if (b.includes(sub) && sub.length > maxLen) maxLen = sub.length;
    }
  }
  const substrPercent = Math.round((maxLen / Math.max(a.length, b.length)) * 100);

  return Math.max(levPercent, substrPercent);
}

// Build ordered search terms following SPT-Check-Mods strategy
function buildSearchTerms(mod, meta, stageName) {
  const terms = [];
  const seen = new Set();

  const localName = (mod?.attributes?.name || stripTrailingVersion(stripArchiveExt(stageName)) || '').trim();
  function add(t) { if (t && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); terms.push(t); } }

  add(localName);
  const withoutSuffix = removeComponentSuffix(localName);
  if (withoutSuffix && withoutSuffix !== localName) add(withoutSuffix);

  // Extract from GUIDs
  if (meta?.guid) add(extractNameFromGuid(meta.guid));
  if (meta?.guesses && meta.guesses.length) {
    for (const g of meta.guesses) add(extractNameFromGuid(g));
  }

  // DLL display names
  const dllNames = (meta?.evidence || []).filter(e => e.type === 'dll' && e.displayName).map(e => e.displayName);
  dllNames.forEach(add);

  // Slugified forms
  add(slugify(localName));
  add(slugify(withoutSuffix));

  // Author + name if available
  const author = (mod?.attributes?.author || mod?.attributes?.owner || '').trim();
  if (author && !/unknown/i.test(author)) add(`${author} ${localName}`);

  return terms;
}

async function forgeGetUpdates(apiKey, sptVersion, modsList) {
  // modsList: array of { guid, version }
  const modsParam = modsList
    .filter((m) => m && m.guid && m.version)
    .map((m) => `${m.guid}:${m.version}`)
    .join(',');

  const url = `https://forge.sp-tarkov.com/api/v0/mods/updates?mods=${encodeURIComponent(modsParam)}&spt_version=${encodeURIComponent(sptVersion)}`;
  const r = await httpsJson(url, forgeHeaders(apiKey));
  return r;
}

// -----------------------------
// Helpers: Forge detail / download / import (stubs)
// TODO: implement robust validation, backoff, and checksum verification based on Forge API responses
async function forgeGetModDetail(apiKey, idOrSlug) {
  // Try slug or id-based detail endpoint (best-effort). Consult Forge API docs.
  if (!idOrSlug) return null;
  const url = `https://forge.sp-tarkov.com/api/v0/mods/${encodeURIComponent(String(idOrSlug))}`;
  const r = await httpsJson(url, forgeHeaders(apiKey));
  if (!r.ok || !r.json || r.json.success !== true) return null;
  return r.json.data || null;
}

function downloadAsset(url, destPath) {
  // Streams an asset to disk. Caller should validate size/checksum where available.
  return new Promise((resolve, reject) => {
    if (!url || !destPath) return reject(new Error('Invalid args'));
    const file = fs.createWriteStream(destPath);
    try {
      const req = https.request(url, { method: 'GET' }, (res) => {
        if ((res.statusCode || 0) >= 400) return reject(new Error(`Download failed: ${res.statusCode}`));
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(true)));
      });
      req.on('error', (err) => reject(err));
      req.end();
    } catch (e) { reject(e); }
  });
}

async function importDownloadedArchive(api, filePath, options) {
  // Placeholder: implement using Vortex import API when available.
  // Options may include { replace: 'prompt'|'overwrite'|'add' }
  // For now return a not-implemented marker.
  throw new Error('importDownloadedArchive: not implemented');
}

// -----------------------------
// Helpers: Vortex staging path + mod list
// -----------------------------
function getStagingPath(api, gameId) {
  const state = api.store.getState();
  const installPath = util.getSafe(state, ['settings', 'mods', 'installPath', gameId], null)
    || util.getSafe(state, ['settings', 'mods', 'installPath', 'default'], null)
    || util.getSafe(state, ['settings', 'mods', 'stagingPath', gameId], null)
    || util.getSafe(state, ['settings', 'mods', 'stagingPath', 'default'], null);

  if (typeof installPath === 'string' && installPath.length) return installPath;

  // Windows fallback: %APPDATA%\Vortex\<gameId>\mods
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'Vortex', gameId, 'mods');
  }

  return null;
}

function getModsForGame(api, gameId) {
  const state = api.store.getState();
  const mods = util.getSafe(state, ['persistent', 'mods', gameId], {});
  return mods && typeof mods === 'object' ? Object.values(mods) : [];
}

function stripArchiveExt(name) {
  return String(name || '').replace(/\.(zip|7z|rar)$/i, '');
}

function stripTrailingVersion(name) {
  // Examples: Tyfon-UIFixes-5.3.0 -> Tyfon-UIFixes
  return String(name || '').replace(/([._-])\d+(?:\.\d+)*$/i, '').replace(/[-_.]+$/g, '');
}

async function listDirsOnce(root) {
  try {
    const entries = await fs.readdirAsync(root);
    const out = [];
    for (const e of entries) {
      const p = path.join(root, e);
      try {
        const st = await fs.statAsync(p);
        if (st.isDirectory()) out.push(e);
      } catch (_) {}
    }
    return out;
  } catch (_) {
    return [];
  }
}

function resolveStageFolderName(mod, stagingDirNames) {
  const attr = (mod && mod.attributes) ? mod.attributes : {};
  const candidates = [];

  if (typeof mod.installationPath === 'string') candidates.push(mod.installationPath);
  if (typeof attr.installationPath === 'string') candidates.push(attr.installationPath);

  if (typeof attr.fileName === 'string') candidates.push(stripArchiveExt(attr.fileName));
  if (typeof attr.archiveName === 'string') candidates.push(stripArchiveExt(attr.archiveName));
  if (typeof mod.archiveFileName === 'string') candidates.push(stripArchiveExt(mod.archiveFileName));

  if (typeof attr.name === 'string') candidates.push(attr.name);
  if (typeof mod.id === 'string') candidates.push(mod.id);

  const expanded = [];
  candidates.forEach((c) => {
    if (!c) return;
    expanded.push(c);
    expanded.push(stripTrailingVersion(c));
  });

  for (const c of expanded) {
    const exact = stagingDirNames.find((d) => d === c);
    if (exact) return exact;
    const ci = stagingDirNames.find((d) => d.toLowerCase() === String(c).toLowerCase());
    if (ci) return ci;
  }

  for (const c of expanded) {
    const cLow = String(c).toLowerCase();
    const hit = stagingDirNames.find((d) => d.toLowerCase().includes(cLow) || cLow.includes(d.toLowerCase()));
    if (hit) return hit;
  }

  return null;
}

// -----------------------------
// Helpers: scan staged mod folder for Forge GUID/version
// -----------------------------
async function walkFiles(dir, opts) {
  const {
    maxFiles = 200,
    maxDepth = 6,
    filter = () => true,
  } = opts || {};

  const out = [];

  async function rec(cur, depth) {
    if (out.length >= maxFiles) return;
    if (depth > maxDepth) return;

    let entries = [];
    try { entries = await fs.readdirAsync(cur); } catch (_) { return; }

    for (const e of entries) {
      if (out.length >= maxFiles) return;
      const p = path.join(cur, e);

      let st;
      try { st = await fs.statAsync(p); } catch (_) { continue; }

      if (st.isDirectory()) {
        await rec(p, depth + 1);
      } else if (st.isFile()) {
        if (filter(p, st)) out.push(p);
      }
    }
  }

  await rec(dir, 0);
  return out;
}

function pickBestGuid(candidates) {
  const uniq = Array.from(new Set(candidates.filter(Boolean).map((s) => String(s).trim())));
  const preferred = uniq.filter((g) => /^com\.[a-z0-9_.-]+\.[a-z0-9_.-]+$/i.test(g));
  const pool = preferred.length ? preferred : uniq;
  pool.sort((a, b) => a.length - b.length);
  return pool[0] || null;
}

function pickBestDllEvidence(items) {
  const stats = new Map();
  for (const item of items) {
    if (!item?.guid) continue;
    const guid = item.guid;
    const cur = stats.get(guid) || {
      guid,
      count: 0,
      bepinCount: 0,
      versionCount: 0,
      version: null,
      displayName: null,
    };

    cur.count += 1;
    if (item.matchType === 'bepin') cur.bepinCount += 1;
    if (item.version) {
      cur.versionCount += 1;
      if (!cur.version || item.matchType === 'bepin') cur.version = item.version;
    }
    if (item.displayName && !cur.displayName) cur.displayName = item.displayName;

    stats.set(guid, cur);
  }

  const sorted = Array.from(stats.values()).sort((a, b) => {
    if (b.bepinCount !== a.bepinCount) return b.bepinCount - a.bepinCount;
    if (b.versionCount !== a.versionCount) return b.versionCount - a.versionCount;
    if (b.count !== a.count) return b.count - a.count;
    return a.guid.length - b.guid.length;
  });

  return sorted[0] || null;
}

async function extractFromDll(dllPath) {
  try {
    const buf = await fs.readFileAsync(dllPath);
    const text = buf.toString('latin1');

    const pluginRe = /BepInPlugin\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']\s*\)/g;
    const matches = [];
    let m;
    while ((m = pluginRe.exec(text)) !== null) {
      matches.push({ guid: normalizeGuid(m[1]), name: m[2], version: m[3] });
      if (matches.length >= 10) break;
    }

    if (matches.length) {
      const bestGuid = pickBestGuid(matches.map((x) => x.guid));
      const best = matches.find((x) => x.guid === bestGuid) || matches[0];
      return {
        guid: best.guid || null,
        version: best.version || null,
        displayName: best.name || null,
        matchType: 'bepin',
      };
    }

    // Try assembly attributes and fallback patterns
    const asmNameRe = /\[assembly:\s*(?:AssemblyTitle|AssemblyProduct|AssemblyDescription)\s*\(\s*["']([^"']+)["']\s*\)\s*\]/ig;
    let asmName = null;
    while ((m = asmNameRe.exec(text)) !== null) {
      asmName = m[1];
      break;
    }

    const guidRe = /\bcom\.[a-z0-9_.-]{3,}\b/ig;
    const guids = [];
    while ((m = guidRe.exec(text)) !== null) {
      guids.push(normalizeGuid(m[0]));
      if (guids.length >= 50) break;
    }
    const bestGuid = pickBestGuid(guids);

    let version = null;
    if (bestGuid) {
      const idx = text.toLowerCase().indexOf(bestGuid.toLowerCase());
      if (idx >= 0) {
        const window = text.slice(Math.max(0, idx - 200), Math.min(text.length, idx + 200));
        const verRe = /\b\d+\.\d+\.\d+(?:\.\d+)?\b/;
        const vm = verRe.exec(window);
        if (vm) version = vm[0];
      }
    }

    // Try AssemblyVersion if null
    if (!version) {
      const verAsmRe = /AssemblyVersion\s*\(\s*["']([^"']+)["']\s*\)/i;
      const vAsm = verAsmRe.exec(text);
      if (vAsm) version = vAsm[1];
    }

    return { guid: bestGuid, version, displayName: asmName || null, matchType: 'pattern' };
  } catch (_) {
    return { guid: null, version: null, displayName: null, matchType: null };
  }
}

function guessGuidsFromFolderName(folderName) {
  const base = stripTrailingVersion(stripArchiveExt(folderName));
  const guesses = [];

  const m = /^([A-Za-z0-9_]+)[-_ ](.+)$/.exec(base);
  if (m) {
    const author = m[1].toLowerCase();
    const modPartRaw = m[2];

    const modPartCompact = modPartRaw.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    const modPartSlug = modPartRaw
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();

    if (author && modPartCompact) guesses.push(`com.${author}.${modPartCompact}`);
    if (author && modPartSlug) guesses.push(`com.${author}.${modPartSlug.replace(/-/g, '')}`);
  }

  if (/^com\./i.test(base) && base.split('.').length >= 3) guesses.push(base);

  return Array.from(new Set(guesses));
}

async function extractForgeMetaFromStagedFolder(modRootAbs, stageFolderName) {
  const out = {
    guid: null,
    version: null,
    displayName: null,
    evidence: [],
    guesses: [],
  };

  const dllEvidence = [];
  const dlls = await walkFiles(modRootAbs, {
    maxFiles: 120,
    maxDepth: 10,
    filter: (p) => p.toLowerCase().endsWith('.dll'),
  });

  for (const dll of dlls) {
    const info = await extractFromDll(dll);
    if (info.guid) {
      const evidence = {
        type: 'dll',
        file: dll,
        guid: info.guid,
        version: info.version,
        displayName: info.displayName,
        matchType: info.matchType,
      };
      out.evidence.push(evidence);
      dllEvidence.push(evidence);
    }
  }

  const bestDll = pickBestDllEvidence(dllEvidence);
  if (bestDll?.guid) {
    out.guid = bestDll.guid;
    out.version = bestDll.version || out.version;
    out.displayName = bestDll.displayName || out.displayName;
  }

  const serverMods = path.join(modRootAbs, 'user', 'mods');
  try {
    const st = await fs.statAsync(serverMods);
    if (st.isDirectory()) {
      const pkgs = await walkFiles(serverMods, {
        maxFiles: 10,
        maxDepth: 4,
        filter: (p) => path.basename(p).toLowerCase() === 'package.json',
      });

      for (const pkg of pkgs) {
        try {
          const raw = await fs.readFileAsync(pkg, 'utf8');
          const j = JSON.parse(raw);
          const v = j.version ? String(j.version) : null;
          out.evidence.push({ type: 'package.json', file: pkg, version: v });
          if (!out.version && v) out.version = v;
          if (!out.displayName && j.name) out.displayName = String(j.name);
        } catch (_) {}
      }
    }
  } catch (_) {}

  out.guesses = guessGuidsFromFolderName(stageFolderName);
  if (!out.guid && out.guesses.length) out.guid = out.guesses[0];

  return out;
}

// -----------------------------
// Mapping import + helpers (SPT-Check-Mods)
// -----------------------------
const MAPPING_FILE_NAME = 'spt_check_mapping.json';

function normalizeMappingKey(s) {
  if (!s) return '';
  // Try GUID lowercased, else normalized name
  const t = String(s).trim();
  if (/^com\./i.test(t)) return t.toLowerCase();
  return normalizeName(t, true);
}

async function getMappingFilePath() {
  return path.join(__dirname, MAPPING_FILE_NAME);
}

async function loadMapping() {
  try {
    const p = await getMappingFilePath();
    const raw = await fs.readFileAsync(p, 'utf8');
    const obj = JSON.parse(raw);
    // Expecting an array of entries { key, keyType, target, targetType, raw }
    if (Array.isArray(obj)) return obj;

    // Older simple object map { key: value }
    if (obj && typeof obj === 'object') {
      const arr = [];
      Object.entries(obj).forEach(([k, v]) => {
        const key = normalizeMappingKey(k);
        const val = String(v || '').trim();
        let targetType = 'slug';
        if (/^com\./i.test(val)) targetType = 'guid';
        arr.push({ key: key || k.toLowerCase(), keyRaw: k, target: val, targetType, raw: v });
      });
      return arr;
    }

    return [];
  } catch (e) {
    return [];
  }
}

async function saveMapping(entries) {
  try {
    const p = await getMappingFilePath();
    const out = Array.isArray(entries) ? entries : [];
    await fs.writeFileAsync(p, JSON.stringify(out, null, 2), 'utf8');
    return true;
  } catch (e) {
    throw e;
  }
}

function parseMappingContent(text) {
  const out = [];
  if (!text) return out;
  // Try JSON first
  try {
    const j = JSON.parse(text);
    if (Array.isArray(j)) {
      j.forEach((it) => {
        if (!it) return;
        if (typeof it === 'string') {
          const key = normalizeMappingKey(it);
          out.push({ key, keyRaw: it, target: it, targetType: /^com\./i.test(it) ? 'guid' : 'slug', raw: it });
        } else if (typeof it === 'object') {
          const k = it.guid || it.key || it.name || it.id || it.slug || '';
          const v = it.target || it.slug || it.guid || it.name || it.id || '';
          const key = normalizeMappingKey(k || v || JSON.stringify(it));
          const target = String(v || k || '').trim();
          const targetType = /^com\./i.test(target) ? 'guid' : 'slug';
          out.push({ key, keyRaw: k, target, targetType, raw: it });
        }
      });
      return out;
    }
  } catch (_) {}

  // Try object-like lines (k: v) or (k -> v)
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const ln of lines) {
    if (ln.startsWith('#') || ln.startsWith('//')) continue;
    const m = /^(.*?)\s*[:=\-]+>?\s*(.+)$/.exec(ln);
    if (m) {
      const k = m[1].trim();
      const v = m[2].trim();
      const key = normalizeMappingKey(k);
      const target = v;
      const targetType = /^com\./i.test(v) ? 'guid' : 'slug';
      out.push({ key, keyRaw: k, target, targetType, raw: ln });
      continue;
    }

    // If single token that looks like a mapping 'guid' or 'slug'
    const single = ln;
    if (/^com\./i.test(single)) {
      const key = normalizeMappingKey(single);
      out.push({ key, keyRaw: single, target: single, targetType: 'guid', raw: ln });
    } else {
      const key = normalizeMappingKey(single);
      out.push({ key, keyRaw: single, target: single, targetType: 'slug', raw: ln });
    }
  }

  return out;
}

function findMappingForMeta(entries, meta, stageName) {
  if (!Array.isArray(entries)) return null;
  const keys = [];
  if (meta?.guid) keys.push(normalizeMappingKey(meta.guid));
  if (meta?.displayName) keys.push(normalizeMappingKey(meta.displayName));
  if (stageName) keys.push(normalizeMappingKey(stageName));
  const dllNames = (meta?.evidence || []).filter(e => e.type === 'dll' && e.displayName).map(e => e.displayName);
  dllNames.forEach(d => keys.push(normalizeMappingKey(d)));

  for (const k of keys) {
    if (!k) continue;
    const hit = entries.find((e) => String(e.key).toLowerCase() === String(k).toLowerCase());
    if (hit) return hit;
  }

  return null;
}

// -----------------------------
// Prepare for modding (optional wrappers)
// -----------------------------
async function prepareForModding(api, discovery) {
  const sptDir = discovery.path;
  if (!sptDir || typeof sptDir !== 'string') return Promise.resolve();

  // SPT mod archives already contain the correct directory structure (user/mods and/or BepInEx/plugins)
  // and are designed to be extracted into the SPT root folder. We deploy to the game root (queryModPath: '.')
  // so here we just ensure the common folders exist and are writable.
  try { await fs.ensureDirWritableAsync(path.join(sptDir, 'user', 'mods')); } catch (_) {}
  try { await fs.ensureDirWritableAsync(path.join(sptDir, 'BepInEx', 'plugins')); } catch (_) {}

  return Promise.resolve();
}

// -----------------------------
// Enrich + Update actions
// -----------------------------
async function enrichMods(api) {
  const { apiKey } = getForgeConfig(api);
  if (!apiKey || apiKey === 'PASTE_FORGE_API_KEY_HERE') {
    showNotification(api, 'SPT Forge: missing API key (hardcoded)', 'warning', 6000);
    log('warn', '[sptvortex] missing Forge API key; set HARD_CODED_FORGE_API_KEY or FORGE_API_KEY env var');
    return;
  }

  const staging = getStagingPath(api, GAME_ID);
  if (!staging) {
    showNotification(api, 'SPT Forge: could not determine Vortex staging folder', 'error', 6000);
    return;
  }

  const mods = getModsForGame(api, GAME_ID);
  const stagingDirs = await listDirsOnce(staging);

  log('info', `[sptvortex] enrich: staging=${staging}, mods=${mods.length}, dirs=${stagingDirs.length}`);

  const cacheByGuid = new Map();

  let enriched = 0;
  let skipped = 0;

  for (const mod of mods) {
    const stageName = resolveStageFolderName(mod, stagingDirs);
    if (!stageName) {
      skipped++;
      log('info', `[sptvortex] enrich: skip (no stage match) mod=${mod?.id || '(unknown)'} name=${mod?.attributes?.name || ''}`);
      continue;
    }

    const rootAbs = path.join(staging, stageName);
    const meta = await extractForgeMetaFromStagedFolder(rootAbs, stageName);

    if (!meta.guid) {
      skipped++;
      log('info', `[sptvortex] enrich: skip (no guid) stage=${stageName}`);
      continue;
    }

    // Demote generic GUIDs (like com.spt.core) so we rely on better matching
    let candidateGuid = meta.guid;

    // Highest precedence: imported mapping (SPT-Check-Mods style)
    try {
      const mapping = await loadMapping();
      const mapHit = findMappingForMeta(mapping, meta, stageName);
      if (mapHit) {
        log('info', `[sptvortex] enrich: mapping hit for stage=${stageName} -> ${mapHit.target} (type=${mapHit.targetType})`);
        try {
          if (mapHit.targetType === 'guid') {
            const m = await forgeGetModByGuid(apiKey, mapHit.target);
            if (m) { forgeMod = m; meta.guid = m.guid; log('info', `[sptvortex] enrich: matched via mapping stage=${stageName} -> ${m.guid} (${m.name})`); }
          } else if (mapHit.targetType === 'slug') {
            const m = await forgeGetModBySlug(apiKey, mapHit.target);
            if (m) { forgeMod = m; meta.guid = m.guid; log('info', `[sptvortex] enrich: matched via mapping stage=${stageName} -> ${m.guid} (${m.name})`); }
          }
        } catch (e) {
          log('warn', `[sptvortex] enrich: mapping lookup failed: ${String(e)}`);
        }
      }
    } catch (e) {
      log('warn', `[sptvortex] enrich: mapping load failed: ${String(e)}`);
    }

    if (!forgeMod && isGenericGuid(candidateGuid)) {
      log('debug', `[sptvortex] enrich: demoting generic guid for stage=${stageName} guid=${candidateGuid}`);
      candidateGuid = null;
    }

    let forgeMod = null;
    // 1. Try GUID lookups
    if (candidateGuid) {
      forgeMod = cacheByGuid.get(candidateGuid) || null;
      if (!forgeMod) forgeMod = await forgeGetModByGuid(apiKey, candidateGuid);
      if (forgeMod) log('debug', `[sptvortex] enrich: matched by GUID stage=${stageName} guid=${candidateGuid}`);
    }

    if (!forgeMod && meta.guesses && meta.guesses.length) {
      for (const g of meta.guesses) {
        if (isGenericGuid(g)) {
          log('debug', `[sptvortex] enrich: skipping generic guess=${g} for stage=${stageName}`);
          continue;
        }
        forgeMod = await forgeGetModByGuid(apiKey, g);
        if (forgeMod) {
          meta.guid = g;
          log('debug', `[sptvortex] enrich: matched by guess GUID stage=${stageName} guid=${g}`);
          break;
        }
      }
    }

    // 2. Build ordered search terms and try exact/slug matches first
    if (!forgeMod) {
      const terms = buildSearchTerms(mod, meta, stageName);
      log('debug', `[sptvortex] enrich: search terms for stage=${stageName} -> ${JSON.stringify(terms.slice(0,12))}`);

      let best = null;
      let bestScore = 0;

      for (const term of terms) {
        if (!term) continue;
        try {
          const results = await forgeFuzzySearch(apiKey, term);
          if (!Array.isArray(results) || !results.length) continue;

          // Check exact normalized matches first
          for (const r2 of results) {
            const rName = r2.name || '';
            const rSlug = r2.slug || '';
            const rGuidName = extractNameFromGuid(r2.guid || '');
            if (normalizeName(rName, true) && normalizeName(rName, true) === normalizeName(term, true)) {
              best = r2; bestScore = 100; break;
            }
            if (rSlug && normalizeName(rSlug, true) === normalizeName(term, true)) {
              best = r2; bestScore = 98; break;
            }
            if (rGuidName && normalizeName(rGuidName, true) === normalizeName(term, true)) {
              best = r2; bestScore = 95; break;
            }
          }

          if (bestScore >= 95) break;

          // Compute fuzzy percent scores
          for (const r2 of results) {
            const candidateNames = [r2.name || '', r2.slug || '', extractNameFromGuid(r2.guid || '')];
            for (const cname of candidateNames) {
              const score = fuzzyScorePercent(term, cname);
              if (score > bestScore) { bestScore = score; best = r2; }
            }
          }

          if (bestScore >= MIN_FUZZY_SCORE) break;
        } catch (e) {
          log('debug', `[sptvortex] enrich: search failed for term='${term}': ${String(e)}`);
        }
      }

      if (best && bestScore >= MIN_FUZZY_SCORE) {
        forgeMod = best;
        meta.guid = meta.guid || best.guid;
        log('info', `[sptvortex] enrich: matched stage=${stageName} -> ${best.guid} (${best.name}) score=${bestScore}`);
      } else if (best) {
        log('debug', `[sptvortex] enrich: top candidate for stage=${stageName} was ${best.guid} (${best.name}) with score=${bestScore} < ${MIN_FUZZY_SCORE}`);
      }
    }

    // Fuzzy search using display names / stage name / dll evidence
    if (!forgeMod) {
      const candidates = [];
      if (meta.displayName) candidates.push(meta.displayName);
      candidates.push(stageName);
      const dllNames = (meta.evidence || []).filter((e) => e.type === 'dll' && e.displayName).map((e) => e.displayName);
      candidates.push(...dllNames);
      let best = null;
      let bestScore = 0;
      for (const c of candidates) {
        if (!c) continue;
        try {
          const results = await forgeFuzzySearch(apiKey, c);
          for (const r2 of results) {
            const nameCandidates = [r2.name, r2.slug, r2.guid].filter(Boolean);
            for (const n of nameCandidates) {
              const s = nameScore(c, n);
              if (s > bestScore) { bestScore = s; best = r2; }
            }
          }
          if (bestScore >= 0.6) break;
        } catch (_) {}
      }
      if (best && bestScore > 0) {
        forgeMod = best;
        meta.guid = meta.guid || best.guid;
        log('info', `[sptvortex] enrich: fuzzy matched stage=${stageName} -> ${best.guid} (${best.name}) score=${bestScore.toFixed(2)}`);
      }
    }

    if (!forgeMod) {
      skipped++;
      log('info', `[sptvortex] enrich: skip (no forge match) stage=${stageName}, guid=${meta.guid}`);
      continue;
    }

    cacheByGuid.set(forgeMod.guid, forgeMod);

    const attrUpdates = {
      forgeGuid: forgeMod.guid,
      forgeId: String(forgeMod.id),
      forgeSlug: forgeMod.slug,
      forgeName: forgeMod.name,
      forgeOwner: forgeMod.owner?.name || '',
      forgeDetailUrl: forgeMod.detail_url || '',
      forgeThumbnail: forgeMod.thumbnail || '',
      version: meta.version || mod?.attributes?.version || '',
      source: `sptforge:${forgeMod.guid}`,
    };

    if (forgeMod.thumbnail) attrUpdates.pictureUrl = forgeMod.thumbnail;
    if (forgeMod.teaser) attrUpdates.description = forgeMod.teaser;

    Object.entries(attrUpdates).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      api.store.dispatch(actions.setModAttribute(GAME_ID, mod.id, k, v));
    });

    enriched++;
  }

  showNotification(api, 'SPT Forge: Enrich complete', 'success', 4000, {
    message: `Enriched: ${enriched}, Skipped: ${skipped}\nStaging: ${staging}`,
  });

  log('info', `[sptvortex] enrich done: enriched=${enriched}, skipped=${skipped}`);
}

async function checkUpdates(api) {
  const { apiKey, sptVersion } = getForgeConfig(api);
  if (!apiKey || apiKey === 'PASTE_FORGE_API_KEY_HERE') {
    showNotification(api, 'SPT Forge: missing API key (hardcoded)', 'warning', 6000);
    return;
  }

  const mods = getModsForGame(api, GAME_ID);
  const list = [];
  for (const mod of mods) {
    const guid = mod?.attributes?.forgeGuid || (typeof mod?.attributes?.source === 'string' ? String(mod.attributes.source).replace(/^sptforge:/, '') : null);
    const version = mod?.attributes?.version || null;
    if (guid && version) list.push({ guid, version, mod });
  }

  if (!list.length) {
    showNotification(api, 'SPT Forge: no mods enriched yet (run Enrich first)', 'warning', 6000);
    return;
  }

  const r = await forgeGetUpdates(apiKey, sptVersion, list);
  if (!r.ok || !r.json || r.json.success !== true) {
    showNotification(api, 'SPT Forge: update check failed (see log)', 'error', 7000);
    log('warn', '[sptvortex] updates failed', { status: r.status, body: (r.body || '').slice(0, 500) });
    return;
  }

  const data = r.json.data || {};
  const updates = Array.isArray(data.updates) ? data.updates : [];
  const blocked = Array.isArray(data.blocked_updates) ? data.blocked_updates : [];
  const incompatible = Array.isArray(data.incompatible_with_spt) ? data.incompatible_with_spt : [];

  const lines = [];
  if (updates.length) {
    lines.push('Updates available:');
    updates.slice(0, 15).forEach((u) => {
      const name = u?.name || u?.mod?.name || u?.guid || 'unknown';
      const cur = u?.current_version || u?.installed_version || '';
      const latest = u?.latest_version || u?.version || '';
      lines.push(`- ${name}: ${cur} -> ${latest}`);
    });
    if (updates.length > 15) lines.push(`...and ${updates.length - 15} more`);
  } else {
    lines.push('No updates found.');
  }

  if (blocked.length) lines.push(`Blocked updates: ${blocked.length}`);
  if (incompatible.length) lines.push(`Incompatible with SPT ${sptVersion}: ${incompatible.length}`);

  api.showDialog('info', 'SPT Forge updates', { text: lines.join('\n') }, [{ label: 'Close' }]);
}

// -----------------------------
// Main
// -----------------------------
function main(context) {
  context.registerReducer(SETTINGS_PATH, settingsReducer);

  context.registerGame({
    id: GAME_ID,
    name: GAME_NAME,
    mergeMods: true,
    supportedTools: [],
    queryPath: () => ``,
    queryModPath: () => '.',
    logo: 'gameart.jpg',
    executable: () => (process.platform === 'win32' ? 'SPT.Launcher.exe' : 'EscapeFromTarkov.exe'),
    requiredFiles: ['EscapeFromTarkov.exe'],
    setup: (discovery) => prepareForModding(context.api, discovery),
    environment: {},
    details: {},
  });

  context.registerAction('settings', ACTION_SET_KEY, 150, 'Set SPT Forge API key', async () => {
    const res = await context.api.showDialog('question', 'SPT Forge API key', {
      text: 'Enter Forge API key (will be saved in Vortex settings).',
      input: [{ id: 'k', label: 'Forge API key', type: 'text' }],
    }, [{ label: 'Cancel' }, { label: 'Save' }]);

    if (res?.action !== 'Save') return;
    const key = String(res.input?.k || '').trim();
    context.api.store.dispatch({ type: 'SPTVORTEX_SET_SETTING', payload: { key: 'forgeApiKey', value: key } });
    showNotification(api,  'SPT Forge: API key saved', 'success', 3000);
  });

  context.registerAction('settings', ACTION_SET_SPT, 151, 'Set SPT version', async () => {
    const res = await context.api.showDialog('question', 'SPT version', {
      text: 'Enter your SPT version (e.g. 4.0.11).',
      input: [{ id: 'v', label: 'SPT version', type: 'text' }],
    }, [{ label: 'Cancel' }, { label: 'Save' }]);

    if (res?.action !== 'Save') return;
    const v = String(res.input?.v || '').trim();
    context.api.store.dispatch({ type: 'SPTVORTEX_SET_SETTING', payload: { key: 'sptVersion', value: v } });
    showNotification(api,  'SPT Forge: SPT version saved', 'success', 3000);
  });

  // Forge actions (Mods list toolbar)
  // The 'mod-icons' group is known to render as buttons in the Mods page (see Vortex wiki examples).
  context.registerAction('mod-icons', 200, 'refresh', {}, 'Forge: Enrich', () => enrichMods(context.api));
  context.registerAction('mod-icons', 210, 'download', {}, 'Forge: Check Updates', () => checkUpdates(context.api));

  // Optional: duplicate these in the dashboard Tools tile as well
  context.registerAction('game-tools', 200, 'refresh', {}, 'Forge: Enrich', () => enrichMods(context.api));
  context.registerAction('game-tools', 210, 'download', {}, 'Forge: Check Updates', () => checkUpdates(context.api));

  // Diagnostic action: run a focused report for a staging folder
  async function produceDiagnostic(api, stageName) {
    const staging = getStagingPath(api, GAME_ID);
    if (!staging) {
      return 'Could not determine staging folder';
    }
    const dirs = await listDirsOnce(staging);
    if (!stageName) return `Staging folders: ${dirs.join(', ')}`;
    if (!dirs.includes(stageName)) return `Stage '${stageName}' not found in staging folder`;

    const rootAbs = path.join(staging, stageName);
    const meta = await extractForgeMetaFromStagedFolder(rootAbs, stageName);

    const parts = [];
    parts.push(`Stage: ${stageName}`);
    parts.push(`GUID: ${meta.guid || ''}`);
    parts.push(`DisplayName: ${meta.displayName || ''}`);
    parts.push(`Version: ${meta.version || ''}`);
    parts.push(`Guesses: ${JSON.stringify(meta.guesses || [])}`);
    parts.push(`Evidence:`);
    (meta.evidence || []).forEach((e) => parts.push(` - ${e.type} ${e.file || ''} guid=${e.guid || ''} display=${e.displayName || ''} version=${e.version || ''} match=${e.matchType || ''}`));

    // Build candidates and run fuzzy searches
    const candidates = [];
    if (meta.displayName) candidates.push(meta.displayName);
    candidates.push(stageName);
    const dllNames = (meta.evidence || []).filter((e) => e.type === 'dll' && e.displayName).map((e) => e.displayName);
    candidates.push(...dllNames);
    candidates.push(slugify(stageName));
    if (meta.displayName) candidates.push(slugify(meta.displayName));

    parts.push(`Candidates: ${JSON.stringify(candidates)}`);

    // Mapping check
    try {
      const mapping = await loadMapping();
      const mapHit = findMappingForMeta(mapping, meta, stageName);
      if (mapHit) {
        parts.push(`Mapping hit: target=${mapHit.target} type=${mapHit.targetType} raw=${mapHit.raw || ''}`);
      } else {
        parts.push('Mapping hit: (none)');
      }
    } catch (e) {
      parts.push(`Mapping load error: ${String(e)}`);
    }

    const apiKey = getForgeConfig(api).apiKey;
    for (const c of candidates) {
      if (!c) continue;
      try {
        const results = await forgeFuzzySearch(apiKey, c);
        const scored = results.map((r2) => {
          const nameCandidates = [r2.name || '', r2.slug || '', r2.guid || ''];
          let localScore = 0;
          for (const n of nameCandidates) { localScore = Math.max(localScore, fuzzyScorePercent(c, n)); }
          return { name: r2.name, guid: r2.guid, score: localScore };
        }).sort((a, b) => b.score - a.score).slice(0, 6);
        if (scored.length) {
          parts.push(`Results for '${c}': ${scored.map(x => `${x.name}(${x.guid}):${x.score}`).join(', ')}`);
        } else {
          parts.push(`Results for '${c}': (none)`);
        }
      } catch (e) {
        parts.push(`Results for '${c}': search error: ${String(e)}`);
      }
    }

    const report = parts.join('\n');
    log('info', `[sptvortex] diagnostic for ${stageName}:\n${report}`);
    return report;
  }

  context.registerAction('game-tools', 220, 'info', {}, 'Forge: Diagnose mod', async () => {
    const staging = getStagingPath(context.api, GAME_ID);
    const dirs = staging ? await listDirsOnce(staging) : [];
    const res = await context.api.showDialog('question', 'SPT Forge: Diagnose mod', {
      text: `Enter staging folder name to diagnose. Available: ${dirs.slice(0,40).join(', ')}`,
      input: [{ id: 's', label: 'Stage folder name', type: 'text' }],
    }, [{ label: 'Cancel' }, { label: 'Run' }]);
    if (res?.action !== 'Run') return;
    const stage = String(res.input?.s || '').trim();
    const report = await produceDiagnostic(context.api, stage);
    context.api.showDialog('info', 'SPT Forge: Diagnostic report', { text: report }, [{ label: 'Close' }]);
  });

  // Import mapping action (paste content from SPT-Check-Mods export or logs)
  context.registerAction('game-tools', 230, 'download', {}, 'Forge: Import SPT mapping', async () => {
    const res = await context.api.showDialog('question', 'Import SPT-Check-Mods mapping', {
      text: 'Paste mapping content (JSON array/object or lines like "key -> value"). The importer will try to detect guid or slug values.',
      input: [{ id: 'm', label: 'Mapping (paste here)', type: 'text' }],
    }, [{ label: 'Cancel' }, { label: 'Import' }]);
    if (res?.action !== 'Import') return;
    const text = String(res.input?.m || '').trim();
    if (!text) { showNotification(context.api, 'No mapping text provided', 'warning'); return; }
    try {
      const parsed = parseMappingContent(text);
      await saveMapping(parsed);
      showNotification(context.api, `Imported mapping entries: ${parsed.length}`, 'success');
    } catch (e) {
      showNotification(context.api, `Import failed: ${String(e)}`, 'error');
    }
  });

  // Show mapping action
  context.registerAction('game-tools', 240, 'list', {}, 'Forge: Show mapping', async () => {
    try {
      const mapping = await loadMapping();
      if (!mapping || !mapping.length) { context.api.showDialog('info', 'SPT mapping', { text: 'No mapping present' }, [{ label: 'Close' }]); return; }
      const preview = mapping.slice(0, 50).map(e => `${e.key || ''} => ${e.target}`).join('\n');
      context.api.showDialog('info', 'SPT mapping', { text: `Entries: ${mapping.length}\n\n${preview}` }, [{ label: 'Close' }]);
    } catch (e) {
      context.api.showDialog('error', 'SPT mapping', { text: `Load failed: ${String(e)}` }, [{ label: 'Close' }]);
    }
  });

  // TODO: Download & import updates (skeleton action)
  context.registerAction('game-tools', 250, 'download', {}, 'Forge: Download & Import Updates', async () => {
    const res = await context.api.showDialog('question', 'Download & Import Updates', {
      text: 'This will attempt to download available updates from SPT-Forge and import them into Vortex. Proceed?'
    }, [{ label: 'Cancel' }, { label: 'Proceed' }]);
    if (res?.action !== 'Proceed') return;
    showNotification(context.api, 'Download & Import: not implemented yet', 'warning');
    // TODO: iterate updates from forgeGetUpdates, call forgeGetModDetail, downloadAsset and importDownloadedArchive
  });

  return true;
}

module.exports = main;
module.exports.default = main;

// Export helpers for unit testing and external use
module.exports.helpers = {
  parseMappingContent,
  guessGuidsFromFolderName,
  extractFromDll,
  fuzzyScorePercent,
  buildSearchTerms,
  extractForgeMetaFromStagedFolder,
  forgeGetModByGuid,
  forgeFuzzySearch,
  forgeGetUpdates,
  forgeGetModDetail,
  downloadAsset,
  importDownloadedArchive,
};
