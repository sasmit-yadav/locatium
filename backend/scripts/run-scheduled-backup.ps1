<#
  Daily backup run (called by the scheduled task from register-daily-backup.ps1).
  - reads DATABASE_URL from backend\.env
  - writes a compressed dump to backend\backups\
  - keeps the newest $Keep dumps and deletes older ones
  - optionally copies the new dump to a second location (-CopyTo), e.g. an external drive
  - writes a log to backend\backups\backup.log
#>
param(
  [int]$Keep = 7,
  [string]$CopyTo = ''
)

$ErrorActionPreference = 'Stop'
$backendDir = Resolve-Path (Join-Path $PSScriptRoot '..')
$backupDir = Join-Path $backendDir 'backups'
$logFile = Join-Path $backupDir 'backup.log'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

function Log([string]$msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Add-Content -Path $logFile -Value $line
  Write-Host $line
}

try {
  $envFile = Join-Path $backendDir '.env'
  $dbUrl = (Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1) -replace '^\s*DATABASE_URL\s*=\s*', ''
  $dbUrl = $dbUrl.Trim().Trim('"').Trim("'")
  if (-not $dbUrl) { throw "DATABASE_URL not found in $envFile" }

  $out = Join-Path $backupDir "locatium-$(Get-Date -Format 'yyyyMMdd-HHmmss').dump"
  & (Join-Path $PSScriptRoot 'backup-database.ps1') -SourceUrl $dbUrl -OutputPath $out
  Log "OK  $out  ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)"

  if ($CopyTo) {
    New-Item -ItemType Directory -Force -Path $CopyTo | Out-Null
    Copy-Item $out -Destination $CopyTo -Force
    Log "Copied to $CopyTo"
  }

  $old = Get-ChildItem $backupDir -Filter 'locatium-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep
  foreach ($f in $old) {
    Remove-Item $f.FullName -Force
    Log "Removed old backup $($f.Name)"
  }
} catch {
  Log "FAILED  $($_.Exception.Message)"
  exit 1
}
