param(
  [Parameter(Mandatory = $false)]
  [string]$SourceUrl = $env:DATABASE_URL,

  [Parameter(Mandatory = $false)]
  [string]$OutputPath = (Join-Path $PSScriptRoot "..\backups\locatium-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump")
)

$ErrorActionPreference = "Stop"

function Resolve-PgTool([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  $roots = @(
    "$env:ProgramFiles\PostgreSQL",
    "${env:ProgramFiles(x86)}\PostgreSQL"
  ) | Where-Object { $_ -and (Test-Path $_) }

  foreach ($root in $roots) {
    $candidate = Get-ChildItem $root -Filter "$Name.exe" -Recurse -File -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
  }
  throw "$Name was not found. Install PostgreSQL client tools or add them to PATH."
}

if (-not $SourceUrl) {
  throw "SourceUrl or DATABASE_URL is required."
}

$pgDump = Resolve-PgTool "pg_dump"
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($resolvedOutput)) | Out-Null

Write-Host "Creating compressed PostgreSQL backup at $resolvedOutput"
& $pgDump `
  --dbname=$SourceUrl `
  --format=custom `
  --compress=9 `
  --no-owner `
  --no-privileges `
  --file=$resolvedOutput

if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE"
}

$sizeMb = [math]::Round((Get-Item $resolvedOutput).Length / 1MB, 2)
Write-Host "Backup complete: $sizeMb MB"
