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

# If the provided source path equals the script folder, try to detect repository root by
# walking up parent directories and looking for common root markers (index.js / package.json)
$scriptDir = [System.IO.Path]::GetFullPath((Resolve-Path -Path (Split-Path -Parent $MyInvocation.MyCommand.Path)).Path)
if ($SourcePath -eq $scriptDir) {
  Log "Source was the script folder; attempting to discover repository root..."
  $cur = $scriptDir
  $root = [System.IO.Path]::GetPathRoot($cur)
  while ($cur -and ($cur -ne $root)) {
    if ((Test-Path (Join-Path $cur 'index.js')) -or (Test-Path (Join-Path $cur 'package.json'))) {
      if ($cur -ne $SourcePath) { $SourcePath = $cur; Log "Auto-detected repository root at: $SourcePath" }
      break
    }
    $cur = Split-Path -Parent $cur
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

# Backup existing extension folder if present (unless Force)
if (Test-Path $ExtensionsDir) {
  if (-not $Force) {
    # Use a Windows-safe timestamp for backup folder names
    $ts = Get-Date -Format 'yyyyMMddTHHmmss'
    $bak = "$ExtensionsDir.bak-$ts"
    Log "Backing up existing extension folder to: $bak"
    try {
      Move-Item -Force -LiteralPath $ExtensionsDir -Destination $bak -ErrorAction Stop
    } catch {
      Log "Move-Item failed: $_. Attempting copy-then-remove fallback."
      try {
        Copy-Item -Recurse -Force -LiteralPath $ExtensionsDir -Destination $bak -ErrorAction Stop
        Remove-Item -Recurse -Force -LiteralPath $ExtensionsDir -ErrorAction Stop
      } catch {
        Log "Backup fallback failed: $_"
        throw $_
      }
    }
  } else {
    Log "Force specified: removing existing extension folder"
    Remove-Item -Recurse -Force -LiteralPath $ExtensionsDir
  }
}

# Ensure parent dir exists
$parent = Split-Path -Parent $ExtensionsDir
if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }

# Copy files
Log "Copying files..."
Copy-Item -Recurse -Force -LiteralPath $SourcePath\* -Destination $ExtensionsDir
Log "Copied extension to $ExtensionsDir"

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
