[CmdletBinding()]
param(
    [switch]$SkipDeploy,
    [switch]$NoMonitor
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runtime = Join-Path $PSScriptRoot 'runtime'
$statePath = Join-Path $runtime 'processes.json'
$frontendUrl = 'https://locatium-eta.vercel.app'
$children = @()

New-Item -ItemType Directory -Force -Path $runtime | Out-Null

function Test-TcpPort([int]$Port) {
    $client = [Net.Sockets.TcpClient]::new()
    try {
        $result = $client.BeginConnect('127.0.0.1', $Port, $null, $null)
        return $result.AsyncWaitHandle.WaitOne(800) -and $client.Connected
    } finally {
        $client.Dispose()
    }
}

function Wait-Http([string]$Url, [int]$Seconds = 60) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    $lastError = $null
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $Url
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { return }
        } catch {
            $lastError = $_.Exception.Message
            Start-Sleep -Milliseconds 750
        }
    } while ((Get-Date) -lt $deadline)
    throw "Timed out waiting for $Url. Last error: $lastError"
}

function Wait-PublicDns([string]$Hostname, [int]$Seconds = 90) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            $records = Resolve-DnsName -Name $Hostname -Server 1.1.1.1 -Type A -ErrorAction Stop
            if ($records | Where-Object IPAddress) { return }
        } catch {
            Start-Sleep -Seconds 1
        }
    } while ((Get-Date) -lt $deadline)
    throw "Cloudflare published the tunnel, but public DNS did not become ready for $Hostname."
}

function Start-LoggedProcess(
    [string]$Name,
    [string]$FilePath,
    [string[]]$Arguments,
    [string]$WorkingDirectory
) {
    $stdout = Join-Path $runtime "$Name.out.log"
    $stderr = Join-Path $runtime "$Name.err.log"
    Remove-Item $stdout, $stderr -Force -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $script:children += [pscustomobject]@{
        name = $Name
        pid = $process.Id
        startedAt = $process.StartTime.ToString('o')
        stdout = $stdout
        stderr = $stderr
    }
    return $process
}

function Stop-Children {
    for ($index = $script:children.Count - 1; $index -ge 0; $index--) {
        $child = $script:children[$index]
        Stop-Process -Id $child.pid -ErrorAction SilentlyContinue
    }
}

try {
    if (Test-Path $statePath) {
        throw "A LOCATIUM runtime state already exists. Run Stop-Locatium.ps1 first."
    }
    if (-not (Test-TcpPort 5432)) {
        throw 'PostgreSQL is not listening on 127.0.0.1:5432. Start the local Postgres service first.'
    }
    foreach ($port in 3002, 8002, 20241) {
        if (Test-TcpPort $port) {
            throw "Port $port is already in use. Stop the old LOCATIUM process first."
        }
    }

    $python = (Get-Command python -ErrorAction Stop).Source
    $node = (Get-Command node -ErrorAction Stop).Source
    $cloudflared = (Get-Command cloudflared -ErrorAction Stop).Source

    Write-Host 'Starting ML service on loopback...'
    Start-LoggedProcess 'ml' $python @('-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8002') (Join-Path $root 'ml-service') | Out-Null
    Wait-Http 'http://127.0.0.1:8002/ready' 90

    $env:NODE_ENV = 'production'
    $env:PORT = '3002'
    $env:HOST = '127.0.0.1'
    $env:DATABASE_SSL = 'false'
    $env:CORS_ORIGINS = $frontendUrl
    $env:ALLOW_VERCEL_PREVIEWS = 'false'
    $env:TRUST_PROXY_HOPS = '1'
    $env:ML_SERVICE_URL = 'http://127.0.0.1:8002'
    $env:ML_SERVICE_TIMEOUT_MS = '75000'
    $env:DEMO_MODE = 'true'
    # Links in verify-email / reset-password emails point at the public frontend.
    $env:PUBLIC_APP_URL = $frontendUrl
    $env:DEMO_USER_EMAIL = 'demo@locatium.app'
    $env:REPORT_STORAGE = 'database'

    Write-Host 'Starting API on loopback...'
    Start-LoggedProcess 'api' $node @('src/server.js') (Join-Path $root 'backend') | Out-Null
    Wait-Http 'http://127.0.0.1:3002/api/ready' 120

    Write-Host 'Starting a Cloudflare Quick Tunnel for the API only...'
    Start-LoggedProcess 'cloudflared' $cloudflared @(
        'tunnel', '--url', 'http://127.0.0.1:3002',
        '--metrics', '127.0.0.1:20241',
        '--no-autoupdate', '--loglevel', 'info'
    ) $root | Out-Null

    $deadline = (Get-Date).AddSeconds(60)
    $apiUrl = $null
    do {
        Start-Sleep -Milliseconds 500
        $logText = @(
            Get-Content (Join-Path $runtime 'cloudflared.out.log') -Raw -ErrorAction SilentlyContinue
            Get-Content (Join-Path $runtime 'cloudflared.err.log') -Raw -ErrorAction SilentlyContinue
        ) -join "`n"
        $match = [regex]::Match($logText, 'https://[a-z0-9-]+\.trycloudflare\.com')
        if ($match.Success) { $apiUrl = $match.Value }
    } while (-not $apiUrl -and (Get-Date) -lt $deadline)
    if (-not $apiUrl) { throw 'Cloudflare did not return a Quick Tunnel URL.' }

    $apiHost = ([uri]$apiUrl).DnsSafeHost
    Wait-PublicDns $apiHost 90
    Clear-DnsClientCache -ErrorAction SilentlyContinue
    Wait-Http 'http://127.0.0.1:20241/ready' 30
    Wait-Http "$apiUrl/api/ready" 150
    [pscustomobject]@{
        startedAt = (Get-Date).ToString('o')
        apiUrl = $apiUrl
        frontendUrl = $frontendUrl
        processes = $children
    } | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $statePath

    Write-Host "Secure API tunnel ready: $apiUrl"
    if (-not $SkipDeploy) {
        & (Join-Path $PSScriptRoot 'Publish-VercelApiUrl.ps1') -ApiUrl $apiUrl -FrontendUrl $frontendUrl
    } else {
        Write-Host 'Skipped Vercel deployment. The current frontend API URL was not changed.'
    }

    if ($NoMonitor) {
        Write-Host 'Services are running in the background. Use Stop-Locatium.ps1 to stop them.'
        return
    }

    Write-Host 'LOCATIUM showcase is running. Keep this window open; press Ctrl+C to stop.'
    while ($true) {
        Start-Sleep -Seconds 20
        foreach ($child in $children) {
            if (-not (Get-Process -Id $child.pid -ErrorAction SilentlyContinue)) {
                throw "$($child.name) stopped unexpectedly. Check its runtime log."
            }
        }
        Wait-Http 'http://127.0.0.1:3002/api/ready' 10
        Wait-Http "$apiUrl/api/health" 15
    }
} catch {
    Stop-Children
    Remove-Item $statePath -Force -ErrorAction SilentlyContinue
    throw
} finally {
    if (-not $NoMonitor) {
        Stop-Children
        Remove-Item $statePath -Force -ErrorAction SilentlyContinue
    }
}
