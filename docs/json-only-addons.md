# JSON-only addons (detection & matching) 🔎

This note documents how the extension should detect and match addons that consist only of JSON files (no DLLs), for example `shibdib-livelikeexperience-1.3.2` which installs under `BepInEx/plugins/SAIN/presets/Live Like Experience/info.json`.

## Goals ✨
- Detect JSON-only mods reliably from staging folders.
- Extract useful evidence (name, author, filenames, folder names, version tokens) from JSON and surrounding path.
- Feed evidence into the existing matching pipeline (mapping -> exact GUID -> guessed GUIDs -> searchWithTerms -> fuzzy -> detail-fetch fallback).

## Detection heuristics 🔧
- Look for common JSON manifest files inside staged mod folders:
  - `BepInEx/plugins/*/presets/*/info.json` (common for SAIN presets)
  - `package.json` (server-side mods)
  - `info.json`, `manifest.json`, or other top-level JSON files that contain `name`, `author`, or `version` fields
- If any of these JSON files exist, treat the staging folder as a candidate JSON-only addon and parse the JSON for evidence.

## Evidence to extract 🧾
- JSON fields: `name`, `author`, `version`, `description`, any slug/id fields
- Folder / path tokens (e.g., `Live Like Experience`, `shibdib-livelikeexperience-1.3.2`)
- Filenames inside the preset folder (used as displayName evidence)
- If version tokens are present, ignore purely numeric/version-only tokens as GUID evidence

## Matching flow (use existing pipeline) 🔁
1. Check `spt_check_mapping.json` first (normalized keys via `normalizeMappingKey()`)
2. Try exact GUID lookup (if JSON contains a GUID-like token)
3. Guess GUIDs from folder/author names (e.g., `shibdib-livelikeexperience` -> `com.shibdib.livelikeexperience`) and try lookup
4. Run `searchWithTerms` using terms built from JSON `name`, `author`, slugified folder names, and filename basenames (prefer exact/substring matches)
5. If a fuzzy result lacks `guid`, call `forgeGetModDetail` (detail-fetch fallback) to obtain canonical IDs and release info

## Attributes to set on match ✅
- `forgeGuid` (preferred canonical com.* GUID if available)
- `forgeId` / `forgeSlug` (Forge id/slug when guid absent)
- `version` (from JSON when available)
- `description`, `pictureUrl` (from Forge detail if found)

## Tests & fixtures 🧪
- Add a fixture for `shibdib-livelikeexperience-1.3.2` in `test/fixtures/`:
  - A staging folder snapshot (or `structure.json`) containing `BepInEx/plugins/SAIN/presets/Live Like Experience/info.json` with `name` and `version` fields
  - Add a unit/integration test asserting that `extractForgeMetaFromStagedFolder` produces evidence terms and that `enrichMods` either maps or fuzzy-matches the addon and writes expected attributes
- Use `node dump-spt-structure.mjs <stage-path>` to produce `structure.json` snapshots when reproducing edge cases

## Implementation tips 💡
- Reuse existing helpers: `normalizeName`, `slugify`, `buildSearchTerms`, and `fuzzyScorePercent`
- Prefer adding parsed JSON fields as additional `displayName`/`evidence` before running `findBestMatch`
- Keep detection conservative (only when the JSON looks like a mod preset) to avoid false positives

---

If you'd like, I can implement the detection + tests for `shibdib-livelikeexperience-1.3.2` next. Reply with "implement" and I’ll add the code and tests.