param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,

  [Parameter(Mandatory = $false)]
  [string]$DestinationUrl = $env:DATABASE_URL,

  [switch]$Clean
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

if (-not $DestinationUrl) {
  throw "DestinationUrl or DATABASE_URL is required."
}
if (-not (Test-Path $BackupPath)) {
  throw "Backup file does not exist: $BackupPath"
}

$pgRestore = Resolve-PgTool "pg_restore"
$arguments = @(
  "--dbname=$DestinationUrl",
  "--no-owner",
  "--no-privileges",
  "--exit-on-error",
  "--jobs=2"
)
if ($Clean) {
  $arguments += @("--clean", "--if-exists")
  Write-Warning "Clean restore enabled: existing destination objects may be replaced."
}
$arguments += [System.IO.Path]::GetFullPath($BackupPath)

Write-Host "Restoring LOCATIUM database (connection string hidden)"
& $pgRestore @arguments
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore failed with exit code $LASTEXITCODE"
}

Write-Host "Restore complete. Run npm run db:migrate and npm run verify next."
