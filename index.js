const GAME_NAME = 'Escape From Tarkov: SPT';
const GAME_ID = 'eftsptaki';
const DLL_FILE_EXT = '.dll'

const path = require('path');
const https = require('https');
const { fs, log } = require('vortex-api');

const FORGE_BASE = 'https://forge.sp-tarkov.com';

// ----------------------
// Small HTTPS JSON helper (no dependencies)
// ----------------------
function httpsJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        method: 'GET',
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            return reject(
              new Error(`Non-JSON response (${res.statusCode}): ${data.slice(0, 300)}`)
            );
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(`HTTP ${res.statusCode}: ${parsed?.message || data.slice(0, 300)}`)
            );
          }
          resolve(parsed);
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function parseForgeModIdFromUrl(maybeUrl) {
  if (!maybeUrl) return null;
  try {
    const u = new URL(maybeUrl);
    // Forge mod pages look like: https://forge.sp-tarkov.com/mod/791/slug...
    const m = u.pathname.match(/\/mod\/(\d+)(\/|$)/i);
    return m ? m[1] : null;
  } catch (_) {
    return null;
  }
}

function getInstalledModsForForge(api) {
  const state = api.getState?.();
  const all = state?.persistent?.mods?.[GAME_ID] || {};

  // all is an object keyed by modId; values are IMod-ish objects
  const mods = Object.values(all);

  // Build identifier:version pairs. Identifier can be forge mod_id or GUID.
  // We'll try:
  //  - attributes.sptForgeModId
  //  - parse from attributes.source (Forge URL)
  //  - attributes.sptForgeGuid
  // Version we try:
  //  - mod.version
  //  - attributes.version
  return mods
    .map((m) => {
      const attrs = m.attributes || {};
      const version = m.version || attrs.version;
      const forgeModId = attrs.sptForgeModId || parseForgeModIdFromUrl(attrs.source);
      const forgeGuid = attrs.sptForgeGuid;

      const identifier = forgeModId || forgeGuid;
      if (!identifier || !version) return null;

      return {
        vortexModId: m.id,
        name: m.name || attrs.name || m.id,
        identifier,
        version,
        source: attrs.source,
      };
    })
    .filter(Boolean);
}

async function checkForgeUpdatesFlow(context) {
  // Ask user for API token + target SPT version
  const dialogRes = await context.api.showDialog(
    'question',
    'SPT Forge: Check mod updates',
    {
      text:
        'Enter your Forge API token and your target SPT version.\n' +
        'Token: Forge profile → API Tokens.\n\n' +
        'Tip: For best results, set each mod’s “Source” to its Forge mod page URL (e.g. https://forge.sp-tarkov.com/mod/791/...).',
      input: [
        {
          id: 'token',
          label: 'Forge API Token (Bearer …)',
          value: '',
        },
        {
          id: 'sptVersion',
          label: 'Target SPT Version (e.g. 4.0.11)',
          value: '',
        },
      ],
      checkboxes: [
        {
          id: 'autoDownload',
          text: 'Download “safe updates” after checking',
          value: false,
        },
      ],
      options: {
        order: ['text', 'input', 'checkboxes'],
      },
    },
    [
      { label: 'Cancel' },
      { label: 'Check' },
    ]
  );

  if (!dialogRes || dialogRes.action !== 'Check') return;

  const token = (dialogRes.input?.token || '').trim();
  const sptVersion = (dialogRes.input?.sptVersion || '').trim();
  const autoDownload = !!dialogRes.checkboxes?.autoDownload;

  if (!token || !sptVersion) {
    context.api.showDialog('error', 'Missing info', {
      text: 'You must provide both a Forge API token and an SPT version.',
    }, [{ label: 'OK' }]);
    return;
  }

  const installed = getInstalledModsForForge(context.api);
  if (installed.length === 0) {
    context.api.showDialog('info', 'No eligible mods found', {
      text:
        `I couldn't find any installed mods with BOTH:\n` +
        `- a version, and\n` +
        `- a Forge identifier (mod_id or GUID).\n\n` +
        `Workaround: set the mod’s Source to its Forge page URL (contains /mod/<id>/) and ensure Version is filled.`,
    }, [{ label: 'OK' }]);
    return;
  }

  const modsParam = installed.map((m) => `${m.identifier}:${m.version}`).join(',');
  const url =
    `${FORGE_BASE}/api/v0/mods/updates` +
    `?mods=${encodeURIComponent(modsParam)}` +
    `&spt_version=${encodeURIComponent(sptVersion)}`;

  let payload;
  try {
    payload = await httpsJson(url, {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
  } catch (e) {
    log('error', 'Forge update check failed', e);
    context.api.showDialog('error', 'Forge request failed', {
      text: String(e?.message || e),
    }, [{ label: 'OK' }]);
    return;
  }

  const data = payload?.data || {};
  const updates = data.updates || [];
  const blocked = data.blocked_updates || [];
  const uptodate = data.up_to_date || [];
  const incompatible = data.incompatible_with_spt || [];

  // Build a readable summary
  const lines = [];
  lines.push(`[b]Target SPT:[/b] ${data.spt_version || sptVersion}`);
  lines.push('');
  lines.push(`[b]Updates available:[/b] ${updates.length}`);
  updates.slice(0, 50).forEach((u) => {
    lines.push(
      `• ${u.current_version?.name || u.current_version?.guid || u.current_version?.mod_id}` +
      `: ${u.current_version?.version} → ${u.recommended_version?.version}` +
      (u.recommended_version?.fika_compatibility ? ` (Fika: ${u.recommended_version.fika_compatibility})` : '')
    );
  });
  if (updates.length > 50) lines.push(`…and ${updates.length - 50} more`);

  lines.push('');
  lines.push(`[b]Blocked updates:[/b] ${blocked.length}`);
  blocked.slice(0, 20).forEach((b) => {
    lines.push(
      `• ${b.current_version?.name || b.current_version?.guid || b.current_version?.mod_id}` +
      `: ${b.current_version?.version} (latest ${b.latest_version?.version})` +
      ` — ${b.block_reason}`
    );
  });
  if (blocked.length > 20) lines.push(`…and ${blocked.length - 20} more`);

  lines.push('');
  lines.push(`[b]Up-to-date:[/b] ${uptodate.length}`);
  lines.push(`[b]Incompatible with SPT:[/b] ${incompatible.length}`);

  const res2 = await context.api.showDialog(
    'info',
    'SPT Forge update results',
    { bbcode: lines.join('\n') },
    autoDownload ? [{ label: 'OK' }] : [{ label: 'OK' }, { label: 'Download safe updates' }]
  );

  const shouldDownload = autoDownload || (res2?.action === 'Download safe updates');

  if (shouldDownload && updates.length > 0) {
    // Download each recommended_version.link
    // (Forge notes links may be externally hosted; Vortex will just download the URL.)
    for (const u of updates) {
      const link = u.recommended_version?.link;
      if (!link) continue;

      const name = u.current_version?.name || u.current_version?.slug || `forge-mod-${u.current_version?.mod_id || 'update'}`;
      const fileName = `${name}-${u.recommended_version?.version || 'latest'}.zip`;

      context.api.events.emit('start-download-url', link, fileName);
    }

    context.api.events.emit(
      'show-balloon',
      'SPT Forge',
      `Started ${updates.length} download(s) for available updates.`
    );
  }
}

// ----------------------
// Original extension logic + added action button
// ----------------------
function main(context) {
  context.requireExtension('modtype-bepinex');

  context.registerGame({
    id: GAME_ID,
    name: GAME_NAME,
    mergeMods: true,
    supportedTools: [],
    queryModPath: () => '',
    logo: 'gameart.jpg',
    executable: () => (process.platform === 'win32' ? 'SPT.Server.cmd' : 'SPT.Server.sh'),
    requiredFiles: ['EscapeFromTarkov.exe'],
    setup: prepareForModding,
    environment: {},
    details: {},
  });

  // Adds a top-right button in Vortex UI
  context.registerAction(
    'global-icons',
    100,
    'refresh',
    {},
    'SPT Forge: Check Updates',
    () => checkForgeUpdatesFlow(context)
  );
}

async function prepareForModding(discovery) {
  const sptDir = discovery.path;

  const win_target = path.join(sptDir, 'SPT.Server.cmd');
  await fs.copyAsync(path.join(__dirname, 'wrappers', 'spt-server.cmd'), win_target, {
    overwrite: true,
  });

  const linux_target = path.join(sptDir, 'SPT.Server.sh');
  await fs.copyAsync(path.join(__dirname, 'wrappers', 'spt-server.sh'), linux_target, {
    overwrite: true,
  });
  await fs.chmodAsync(linux_target, 0o755);

  return await fs.ensureDirWritableAsync(path.join(discovery.path, 'BepInEx'));
}

module.exports = {
  default: main,
};
