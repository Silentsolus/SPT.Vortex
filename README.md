# Vortex Extension Update - EFT SPT

Fork of whereismysockat's Vortex SPT-AKI extension, which attemps to add SPT-Forge functionality.

Vortex extension allowing you to manage mods in a modern way.
Just add game in vortex, drag & drop your downloaded mod archives and you're ready to go.

To use SPT-Forge API functionality such as checking for updates and hash check, will need a SPT-Forge API key.

---

## Install script (Windows PowerShell) ✅

A convenience PowerShell script is provided at `scripts/install-to-vortex.ps1` to copy this workspace into Vortex's extensions folder and optionally launch Vortex with environment variables set.

Quick usage:

- Copy and launch Vortex (auto-detects Vortex installation):

  ```powershell
  .\scripts\install-to-vortex.ps1
  ```

- Provide Forge API key and SPT version and launch:

  ```powershell
  .\scripts\install-to-vortex.ps1 -ForgeApiKey 'your_key' -SptVersion '4.0.11'
  ```

- Copy only, do not launch Vortex:

  ```powershell
  .\scripts\install-to-vortex.ps1 -NoLaunch
  ```

Notes:

- Default destination: `%APPDATA%\Vortex\plugins\SPT.Vortex`.
- To override Vortex path: pass `-VortexExe 'C:\Path\To\Vortex.exe'`.
- The installer will overwrite any existing plugin folder by removing it before copying. The script will prompt for confirmation unless you pass `-Force` to skip the prompt.

---

## Development

- Run tests: `npm test`
- Clean workspace artifacts: `npm run clean`
- Generate a staging snapshot for fixtures:
  - `node dump-spt-structure.mjs /path/to/staging/folder`
- JSON-only addon detection guidance: see `docs/json-only-addons.md`
- To stub Forge detail in tests, override `module.exports.helpers.forgeGetModDetail` in test setup (see existing tests).

## Known issues ⚠️

- **Mod update function doesn't work at all.** The download & import flow for updates is currently not fully implemented and should be considered non-functional.

## Credits & Attribution 🙏

This project borrows ideas and matching heuristics from several community projects and their authors:

- whereismysockat — original Vortex SPT-AKI extension (UI/packaging patterns)
- refringe / SPT-Check-Mods — matching heuristics, fuzzy scoring and evidence extraction
- sp-tarkov (SPT-Forge) — Forge API and mod metadata

Please see individual projects and their repos for full attribution and licensing details.

## Contributing

Contributions and improvements are welcome. Please open issues or PRs on the repository.

---
