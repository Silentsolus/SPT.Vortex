<#
Install this extension into Vortex and optionally launch Vortex with environment variables set.

Usage examples:
  .\install-to-vortex.ps1                 # copy current repo to %APPDATA%\Vortex\extensions\spt-vortex and prompt for launch
  .\install-to-vortex.ps1 -ForgeApiKey 'abc' -SptVersion '4.0.11' -NoLaunch
  .\install-to-vortex.ps1 -SourcePath 'C:\dev\SPT.Vortex' -VortexExe 'C:\Program Files\Overwolf\Vortex\Vortex.exe'

Parameters:
  -SourcePath  Path to the extension folder to install (defaults to script folder)
  -ExtensionsDir Destination extension folder (defaults to %APPDATA%\Vortex\plugins\SPT.Vortex)
  -ForgeApiKey  Optional Forge API key to set when launching Vortex
  -SptVersion   Optional SPT version to set when launching Vortex
  -VortexExe    Path to Vortex executable (auto-detected if omitted)
  -NoLaunch     If specified, do not start Vortex after copying
#>

[CmdletBinding()]
param(
  [string]$SourcePath = '',
  [string]$ExtensionsDir = "$env:APPDATA\Vortex\plugins\SPT.Vortex",
  [string]$ForgeApiKey = $env:FORGE_API_KEY,
  [string]$SptVersion = $env:SPT_VERSION,
  [string]$VortexExe = '',
  [switch]$NoLaunch,
  [switch]$Force
)

function Log { param($m) Write-Host "[install-to-vortex] $m" }

# If no SourcePath was provided, resolve script folder robustly (works when invoked via npm)
if (-not $SourcePath -or $SourcePath -eq '') {
  $scriptDir = $PSScriptRoot
  if (-not $scriptDir -or $scriptDir -eq '') {
    # Fallback: when PSScriptRoot isn't available, use MyInvocation path
    $defPath = $MyInvocation.MyCommand.Path
    if ($defPath) { $scriptDir = Split-Path -Parent $defPath }
  }
  if ($scriptDir) { $SourcePath = $scriptDir; Log "Computed SourcePath: $SourcePath" }
}

# Resolve absolute paths
$SourcePath = [System.IO.Path]::GetFullPath((Resolve-Path -Path $SourcePath).Path)
$ExtensionsDir = [System.IO.Path]::GetFullPath($ExtensionsDir)

# If the provided source path equals the script folder, or if the provided path
# does not appear to contain repository markers, try to detect the repository root
# by walking up parent directories and looking for common root markers (index.js / package.json)
$scriptDir = [System.IO.Path]::GetFullPath((Resolve-Path -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)).Path)
$needDiscover = $false
if ($SourcePath -eq $scriptDir) { $needDiscover = $true }
# If SourcePath doesn't look like the repo root, attempt discovery
if (-not (Test-Path (Join-Path $SourcePath 'index.js')) -and -not (Test-Path (Join-Path $SourcePath 'package.json'))) { $needDiscover = $true }

if ($needDiscover) {
  Log "Attempting to discover repository root from: $SourcePath"
  $cur = $SourcePath
  $root = [System.IO.Path]::GetPathRoot($cur)
  while ($cur -and ($cur -ne $root)) {
    if ((Test-Path (Join-Path $cur 'index.js')) -or (Test-Path (Join-Path $cur 'package.json'))) {
      if ($cur -ne $SourcePath) { $SourcePath = $cur; Log "Auto-detected repository root at: $SourcePath" }
      break
    }
    $cur = Split-Path -Parent $cur
  }

  # If discovery from SourcePath failed, try discovering from the script directory
  if (-not (Test-Path (Join-Path $SourcePath 'index.js')) -and -not (Test-Path (Join-Path $SourcePath 'package.json'))) {
    Log "Discovery from provided SourcePath failed; attempting discovery from script directory: $scriptDir"
    $cur = $scriptDir
    $root = [System.IO.Path]::GetPathRoot($cur)
    while ($cur -and ($cur -ne $root)) {
      if ((Test-Path (Join-Path $cur 'index.js')) -or (Test-Path (Join-Path $cur 'package.json'))) {
        if ($cur -ne $SourcePath) { $SourcePath = $cur; Log "Auto-detected repository root at: $SourcePath (from script directory)" }
        break
      }
      $cur = Split-Path -Parent $cur
    }
  }

  # If still not found, abort to avoid copying unrelated directories (e.g., C:\Users\Alex)
  if (-not (Test-Path (Join-Path $SourcePath 'index.js')) -and -not (Test-Path (Join-Path $SourcePath 'package.json'))) {
    Log "Could not locate repository root using provided SourcePath or script directory. Aborting to avoid copying unexpected directories."
    exit 1
  }
}

Log "Source: $SourcePath"
Log "Destination: $ExtensionsDir"

# Find Vortex exe if not supplied
if (-not $VortexExe -or $VortexExe -eq '') {
  $candidates = @("$env:ProgramFiles\Overwolf\Vortex\Vortex.exe", "$env:ProgramFiles(x86)\Overwolf\Vortex\Vortex.exe", "$env:ProgramFiles\Vortex\Vortex.exe", "$env:ProgramFiles(x86)\Vortex\Vortex.exe")
  foreach ($c in $candidates) { if (Test-Path $c) { $VortexExe = $c; break } }
}

if (-not $VortexExe -or $VortexExe -eq '') {
  Log "Could not auto-detect Vortex executable. Pass -VortexExe '<path>' to specify it. Will copy files but not launch."
  $NoLaunch = $true
} else { Log "Vortex executable: $VortexExe" }

# Overwrite existing plugin folder if present (no backups)
if (Test-Path $ExtensionsDir) {
  if (-not $Force) {
    # Prompt the user to confirm destructive overwrite
    try {
      $answer = Read-Host "Destination '$ExtensionsDir' already exists. Overwrite? (y/N)"
    } catch {
      Log "Failed to read input; aborting to avoid accidental overwrite."
      exit 1
    }
    if ($answer -ne 'y' -and $answer -ne 'Y') {
      Log "User declined overwrite. Aborting."
      exit 1
    }
  } else {
    Log "Force specified: overwriting without prompt."
  }

  Log "Removing existing plugin folder to overwrite: $ExtensionsDir"
  try { Remove-Item -Recurse -Force -LiteralPath $ExtensionsDir -ErrorAction Stop } catch { Log "Remove-Item failed: $_"; throw $_ }
}

# Ensure parent dir exists
$parent = Split-Path -Parent $ExtensionsDir
if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }

# Copy files into a temporary folder then move to destination to avoid partial/collision issues
Log "Copying files into temp folder..."
$ts = Get-Date -Format 'yyyyMMddTHHmmss'
$tmpDest = Join-Path ([System.IO.Path]::GetTempPath()) "sptvortex-install-$ts"
if (Test-Path $tmpDest) { Remove-Item -Recurse -Force -LiteralPath $tmpDest }
New-Item -ItemType Directory -Path $tmpDest | Out-Null
# Use -Path with a wildcard to support globbing
$copyPattern = Join-Path $SourcePath '*'
try {
  Copy-Item -Recurse -Force -Path $copyPattern -Destination $tmpDest -ErrorAction Stop
  Log "Copied files to temp folder $tmpDest"
} catch {
  Log "Copy to temp folder failed: $_"
  try { Remove-Item -Recurse -Force -LiteralPath $tmpDest } catch {}
  exit 1
}

try {
  Move-Item -Force -LiteralPath $tmpDest -Destination $ExtensionsDir -ErrorAction Stop
  Log "Moved temp install to $ExtensionsDir"
} catch {
  Log "Move-Item failed: $_"
  Log "Falling back to direct copy into destination..."
  try { Copy-Item -Recurse -Force -Path $copyPattern -Destination $ExtensionsDir -ErrorAction Stop; Log "Copied extension to $ExtensionsDir" } catch { Log "Direct copy failed: $_"; exit 1 }
}
if ($NoLaunch) { Log "NoLaunch specified - done."; exit 0 }

# Set environment variables for this process (inherited by started process)
if ($ForgeApiKey) { $env:FORGE_API_KEY = $ForgeApiKey; Log "Set FORGE_API_KEY (masked)" }
if ($SptVersion) { $env:SPT_VERSION = $SptVersion; Log "Set SPT_VERSION=$SptVersion" }

# Start Vortex
try {
  Log "Starting Vortex..."
  Start-Process -FilePath $VortexExe -WorkingDirectory (Split-Path -Parent $VortexExe)
  Log "Vortex launched. Check Vortex Extensions list for 'Escape From Tarkov SPT Vortex Extension' and enable if necessary."
} catch {
  Log "Failed to launch Vortex: $_"
  exit 1
}

exit 0
