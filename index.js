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

async function extractFromDll(dllPath) {
  try {
    const buf = await fs.readFileAsync(dllPath);
    const text = buf.toString('latin1');

    const pluginRe = /BepInPlugin\s*\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/g;
    const matches = [];
    let m;
    while ((m = pluginRe.exec(text)) !== null) {
      matches.push({ guid: m[1], name: m[2], version: m[3] });
      if (matches.length >= 10) break;
    }

    if (matches.length) {
      const bestGuid = pickBestGuid(matches.map((x) => x.guid));
      const best = matches.find((x) => x.guid === bestGuid) || matches[0];
      return { guid: best.guid || null, version: best.version || null, displayName: best.name || null };
    }

    const guidRe = /\bcom\.[a-z0-9_.-]{3,}\b/ig;
    const guids = [];
    while ((m = guidRe.exec(text)) !== null) {
      guids.push(m[0]);
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

    return { guid: bestGuid, version, displayName: null };
  } catch (_) {
    return { guid: null, version: null, displayName: null };
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

  const bepinPlugins = path.join(modRootAbs, 'BepInEx', 'plugins');
  try {
    const st = await fs.statAsync(bepinPlugins);
    if (st.isDirectory()) {
      const dlls = await walkFiles(bepinPlugins, {
        maxFiles: 50,
        maxDepth: 6,
        filter: (p) => p.toLowerCase().endsWith('.dll'),
      });

      for (const dll of dlls) {
        const info = await extractFromDll(dll);
        if (info.guid) out.evidence.push({ type: 'dll', file: dll, guid: info.guid, version: info.version });
        if (!out.guid && info.guid) {
          out.guid = info.guid;
          out.version = info.version || out.version;
          out.displayName = info.displayName || out.displayName;
        }
      }
    }
  } catch (_) {}

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

    let forgeMod = cacheByGuid.get(meta.guid) || null;
    if (!forgeMod) {
      forgeMod = await forgeGetModByGuid(apiKey, meta.guid);
    }

    if (!forgeMod && meta.guesses && meta.guesses.length) {
      for (const g of meta.guesses) {
        forgeMod = await forgeGetModByGuid(apiKey, g);
        if (forgeMod) {
          meta.guid = g;
          break;
        }
      }
    }

    if (!forgeMod) {
      const slugGuess = stripTrailingVersion(stripArchiveExt(stageName))
        .replace(/([a-z])([A-Z])/g, '$1-$2')
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
      if (slugGuess) forgeMod = await forgeGetModBySlug(apiKey, slugGuess);
    }

    if (!forgeMod && meta.displayName) {
      forgeMod = await forgeGetModByName(apiKey, meta.displayName);
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

  return true;
}

module.exports = main;
module.exports.default = main;
