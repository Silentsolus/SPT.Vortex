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
