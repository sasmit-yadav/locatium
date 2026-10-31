[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^https://')]
    [string]$ApiUrl,
    [string]$FrontendUrl = 'https://locatium-eta.vercel.app'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$frontend = Join-Path $root 'frontend'
$apiOrigin = $ApiUrl.TrimEnd('/')

if ($apiOrigin -notmatch '^https://[a-z0-9.-]+(?::\d+)?$') {
    throw "ApiUrl must be an HTTPS origin without a path: $apiOrigin"
}
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    throw 'Vercel CLI is not installed or is not on PATH.'
}

Write-Host "Updating the public API origin used by the Vercel build..."
$apiOrigin | vercel env add VITE_API_URL production --force --cwd $frontend
if ($LASTEXITCODE -ne 0) { throw 'Vercel environment update failed.' }

Write-Host 'Deploying the frontend to production...'
vercel deploy --prod --yes --force --cwd $frontend
if ($LASTEXITCODE -ne 0) { throw 'Vercel production deployment failed.' }

$env:API_URL = $apiOrigin
$env:FRONTEND_URL = $FrontendUrl.TrimEnd('/')
node (Join-Path $root 'backend\scripts\verify-deployment.js')
if ($LASTEXITCODE -ne 0) { throw 'Public deployment verification failed.' }

Write-Host "LOCATIUM is live: $FrontendUrl"
