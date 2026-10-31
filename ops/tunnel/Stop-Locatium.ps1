[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot 'runtime'
$statePath = Join-Path $runtime 'processes.json'

if (-not (Test-Path $statePath)) {
    Write-Host 'LOCATIUM showcase is not running from the tunnel launcher.'
    return
}

$state = Get-Content $statePath -Raw | ConvertFrom-Json
$processes = @($state.processes)

for ($index = $processes.Count - 1; $index -ge 0; $index--) {
    $entry = $processes[$index]
    $process = Get-Process -Id $entry.pid -ErrorAction SilentlyContinue
    if (-not $process) { continue }

    $sameProcess = $true
    if ($entry.startedAt) {
        $expected = [datetime]::Parse($entry.startedAt).ToUniversalTime()
        $actual = $process.StartTime.ToUniversalTime()
        $sameProcess = [math]::Abs(($actual - $expected).TotalSeconds) -lt 2
    }
    if ($sameProcess) {
        Write-Host "Stopping $($entry.name)..."
        Stop-Process -Id $entry.pid -ErrorAction SilentlyContinue
    } else {
        Write-Warning "Skipped stale PID $($entry.pid) for $($entry.name)."
    }
}

Remove-Item $statePath -Force
Write-Host 'LOCATIUM API, ML service, and tunnel stopped. PostgreSQL was left running.'
