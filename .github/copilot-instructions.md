# Copilot instructions for SPT.Vortex ⚙️

Purpose: Provide concise, project-specific guidance so AI coding agents can be immediately productive working on this Vortex extension.

1. Big picture
   - This is a Vortex extension (main entry: `index.js`) that integrates SPT-Forge metadata and update checks into Vortex for the game id `eftsptaki`.
   - Key responsibilities: scan Vortex staging folders, extract mod GUIDs/versions (DLL `/ BepInPlugin` attributes and server `package.json`), map/guess mods against the Forge API and write attributes via `actions.setModAttribute`.
   - Important constants: `GAME_ID = 'eftsptaki'`, `MAPPING_FILE_NAME = 'spt_check_mapping.json'`.

2. Main flows & integration points 🔗
   - Enrich: `enrichMods(api)` scans staging, extracts evidence via `extractForgeMetaFromStagedFolder`, uses Forge endpoints (`/api/v0/mods`) and updates mod attributes with `api.store.dispatch(actions.setModAttribute(...))`.
   - Updates: `checkUpdates(api)` calls `/api/v0/mods/updates` with `guid:version` pairs gathered from attributes like `forgeGuid` and `version`.
   - Forge API calls are via `httpsJson()` to `https://forge.sp-tarkov.com/api/v0/...` and require a Bearer header when a key is present.

3. Where to configure / secrets ⚠️
   - API key: env var `FORGE_API_KEY` or saved via the UI action `Forge: Set SPT Forge API key` (dispatches `SPTVORTEX_SET_SETTING` to `settings.sptvortex.forgeApiKey`).
   - SPT version: env var `SPT_VERSION` or saved via `Forge: Set SPT version`.
   - Note: file contains `HARD_CODED_FORGE_API_KEY` for testing — **do not commit real keys** and prefer env vars.

4. Project conventions & heuristics 🧭
   - Filename and folder heuristics: `resolveStageFolderName` prefers `installationPath`, `fileName`, `archiveName`, `id`, or stage folder names with trailing versions stripped via `stripTrailingVersion`.
   - GUID extraction: `extractFromDll` uses RegEx for `BepInPlugin(...)`, `[assembly: AssemblyTitle]`, and GUID regex `\bcom\.[a-z0-9_.-]{3,}\b`.
   - Name normalization: use `normalizeName(s, removeComponentSuffixes)` and `normalizeMappingKey(s)` (GUIDs lowercased; otherwise normalized name) — mapping keys must follow this.
   - Fuzzy matching: `fuzzyScorePercent`, `levenshteinScore`, `nameScore`, `FUZZY_THRESHOLD`, and `MIN_FUZZY_SCORE` control match tolerances.

Patterns to consider (from SPT-Check-Mods) 🧾
   - Precedence: prefer explicit mapping entries -> exact GUID lookup -> GUID guesses (from folder names) -> exact slug/name match -> fuzzy name matching -> fallback candidates (display name, stage folder, DLL display names).
   - Demote generic GUIDs (`com.spt*`, `unity.*`) before attempting authoritative GUID lookups (see `isGenericGuid`).
   - Build search terms in priority order: local stage name, without component suffix (Server/Client), name extracted from GUID, DLL display names, slugified forms, and `author + localName` (see `buildSearchTerms`).
   - Scoring: combine substring match and Levenshtein distance; use strict thresholds (this repo uses `MIN_FUZZY_SCORE = 60`) and prefer exact/substring matches (score 90–100) over fuzzy falls.
   - Evidence extraction: prioritize `BepInPlugin` info, then `[assembly: ...]` attributes, then `package.json` (server mods) and finally folder-based guesses (e.g., `com.{author}.{mod}`).
   - API usage patterns: use paginated queries (`per_page`) and larger result windows for fuzzy searches; cache results by GUID to avoid repeated Forge calls.
   - Error handling and rate limiting: include gentle backoff or a `RateLimitService` equivalent when doing many queries (SPT-Check-Mods implements a RateLimitService).
   - Download/import considerations: inspect mod detail/release assets for URLs, sizes and checksums; validate downloaded files before import and prompt user for replace/add choices.

Examples
   - Mapping keys must be normalized with `normalizeMappingKey()` before lookup (guid lowercased vs normalized name).
   - Guess GUID from folder `Author-ModName-1.2.3` -> `com.author.modname` (see `guessGuidsFromFolderName`).
   - Use `dump-spt-structure.mjs` to generate fixtures and reproduce matching failures for test cases.


5. Mapping file & import format 📦
   - The extension persists a mapping at `spt_check_mapping.json` in the extension's directory. Import UI (`Forge: Import SPT mapping`) accepts:
     - JSON array/object exports (objects like `{key,target}`), or
     - Plain text lines like `key -> value`, `key: value`, or single tokens (GUIDs are detected by `^com\.`).
   - Keys are normalized by `normalizeMappingKey` before lookup.

6. Useful local debugging & tooling 💡
   - Structure dump: `dump-spt-structure.mjs` (node script) traverses a Vortex staging folder and writes `structure.json` and `tree.txt`. Useful for reproducing staging shapes and testing heuristics.
     - Example: `node dump-spt-structure.mjs` (defaults to `%APPDATA%/Vortex/eftsptaki/mods`) or `node dump-spt-structure.mjs /path/to/staging`.
   - Diagnostic UI: `Forge: Diagnose mod` runs `produceDiagnostic` which logs a report and returns a short text summary useful for investigating match failures.

7. Coding style & safe edits 🔧
   - Prefer using provided helpers (normalize/slugify/extractFromDll/fuzzy helpers) rather than duplicating logic.
   - Use `api.store.getState()` and Vortex helpers from `vortex-api` (`actions`, `fs`, `log`, `types`, `util`) to mutate state and log.
   - Ensure that notification code paths are robust: Vortex exposes different notification helpers across versions (see `showNotification` fallbacks).

8. Files to inspect for concrete examples
   - `index.js` — main logic and action registration (primary reference)
   - `dump-spt-structure.mjs` — reproducing staging folder snapshots
   - `structure.json`, `tree.txt` — sample outputs used to reason about heuristics
   - `info.json`, `README.md` — metadata and high-level project context

Project objective (short) 🎯
   - End-to-end Vortex workflow: when users import mod archives (`.zip`, `.7z`) into Vortex, the extension should detect the staged mod, match it to the SPT-Forge mod, check for updates, and when an updated archive is available, download and import the updated mod into Vortex (replace or add a new version, per user choice).

Current status
   - Implemented: scanning & enrichment (`enrichMods`), GUID/version extraction (`extractForgeMetaFromStagedFolder` / `extractFromDll`), and update checks (`checkUpdates`) using Forge `/api/v0/mods` and `/api/v0/mods/updates` endpoints.
   - Not implemented: automatic download and import of updated mod archives; this is the main feature to add next.

Implementation roadmap (concrete, code pointers) 🔧
   1. Add a helper `forgeGetModDetail(apiKey, idOrSlug)` to fetch mod detail (files/releases) and discover downloadable assets.
   2. Implement `downloadAsset(url, destPath)` that streams via HTTPS, validates size/checksum where available, and writes to a temp file.
   3. Implement `importDownloadedArchive(api, filePath, options)` which imports the downloaded archive into Vortex:
      - Preferred: use Vortex extension/import API (see Vortex docs) to trigger an install or import action programmatically.
      - Fallback: place archive into a monitored folder and call existing install/import flows; then update mod attributes with `actions.setModAttribute`.
   4. Add UI actions: `Forge: Download & Import Updates` (global) and contextual `Download update for selected mod` (per-mod) that use the above helpers and prompt the user for replace/add policy.
   5. Add unit tests for `extractFromDll`, `parseMappingContent` and integration tests using a captured `structure.json` to ensure `enrichMods` yields expected matches.

Testing & debugging steps 💡
   - Use `node dump-spt-structure.mjs [path]` to generate `structure.json`/`tree.txt` for test staging snapshots and add fixture cases to tests.
   - Use `Forge: Diagnose mod` (UI action) to reproduce fuzzy-search results and mapping hits for a given stage folder.
   - For download tests, capture a sample Forge mod detail JSON and mock asset URLs; ensure `downloadAsset` correctly saves files and `importDownloadedArchive` triggers Vortex import.

Notes & gotchas ⚠️
   - Generic GUIDs (e.g., `com.spt_core`, `unity.*`) are demoted by `isGenericGuid`—mapping imports are often necessary to disambiguate.
   - Mapping file `spt_check_mapping.json` lives in the extension dir; importing mappings via the UI improves matching for edge cases.
   - Keep API keys out of repo (env `FORGE_API_KEY` or Vortex setting). The repository currently has a hardcoded test key which should not be used for production.

Files to touch for feature work
   - `index.js` (add `forgeGetModDetail`, `downloadAsset`, `importDownloadedArchive`, and new actions)
   - `dump-spt-structure.mjs` (add test fixture generation helpers)
   - Add a `test/` folder with unit/integration tests and sample `structure.json` fixtures.

Useful references 🔗
   - SPT-Forge repo: https://github.com/sp-tarkov/forge (source & server-side docs)
   - SPT-Forge API docs: https://forge.sp-tarkov.com/docs/index.html# (API reference for endpoints like `/api/v0/mods` and `/api/v0/mods/updates`)
   - Nexus/Vortex docs: https://github.com/Nexus-Mods/Vortex/wiki (developer docs and extension guidance)
   - Vortex API (npm module / repo): https://github.com/Nexus-Mods/vortex-api (inspect types, `actions`, and recommended extension APIs)
   - SPT-Check-Mods: https://github.com/refringe/SPT-Check-Mods (reference implementation for scanning, matching, and update checking against SPT-Forge)
   - Tip: consult the Forge API docs for file/release fields when implementing download/import logic (asset URLs, checksums, and release metadata). Also consult the Vortex wiki for the recommended import flow and available actions (e.g., how [`actions`] are commonly used to set attributes or trigger installs).

Would you like a short implementation stub (e.g., `forgeGetModDetail` + `downloadAsset` + `importDownloadedArchive` stubs) added to `index.js` now so you can iterate on download/import flow? ✅
