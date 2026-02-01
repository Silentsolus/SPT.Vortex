This is a small local copy (subset) of the SPT-Check-Mods project used to prototype a change.

Change implemented:
- Add Debug-level logging of API response bodies (truncated) in `Services/ForgeApiService.cs`.

How to run tests:
- Requires .NET SDK (6+ assumed). In PowerShell or cmd, from this folder run:
  dotnet test

Notes & next steps:
- This is a local prototype. To contribute upstream:
  1. Fork `refringe/SPT-Check-Mods` on GitHub.
  2. Create a branch and apply the same changes to `Services/ForgeApiService.cs` in the repo.
  3. Add or adapt tests to that repo and run `dotnet test`.
  4. Open a PR and reference this change.

If you want, I can craft a PR patch/diff or the exact patch file to submit to the upstream repo.