# LOCATIUM Step 1 — Docker (Postgres + Redis) + migrate + verify
# Run from repo root:
# .\scripts\setup-dev.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Backend = Join-Path $Root "backend"
$EnvFile = Join-Path $Backend ".env"

Write-Host ""
Write-Host "=== LOCATIUM Step 1: Dev stack setup ===" -ForegroundColor Cyan
Write-Host ""

# --------------------------------------------------
# Docker
# --------------------------------------------------

Set-Location $Root

Write-Host "Starting Postgres + Redis (docker compose)..." -ForegroundColor Yellow

docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker failed. Is Docker Desktop running?" -ForegroundColor Red
    exit 1
}

# --------------------------------------------------
# Wait for PostgreSQL
# --------------------------------------------------

Write-Host "Waiting for PostgreSQL (up to 45s)..." -ForegroundColor Yellow

$ready = $false

for ($i = 0; $i -lt 15; $i++) {

    docker compose exec -T db pg_isready -U locatium -d locatium 2>$null | Out-Null

    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }

    Start-Sleep -Seconds 3
}

if (-not $ready) {
    Write-Host "PostgreSQL not ready yet." -ForegroundColor Red
    Write-Host "Try again in a minute: docker compose logs db" -ForegroundColor Yellow
    exit 1
}

Write-Host "PostgreSQL is ready." -ForegroundColor Green

# --------------------------------------------------
# Enable REDIS_URL in .env
# --------------------------------------------------

if (Test-Path $EnvFile) {

    $content = Get-Content $EnvFile -Raw

    if ($content -match '(?m)^#\s*REDIS_URL=') {

        $content = $content -replace '(?m)^#\s*REDIS_URL=redis://localhost:6379', 'REDIS_URL=redis://localhost:6379'

        Set-Content -Path $EnvFile -Value $content.TrimEnd()

        Add-Content -Path $EnvFile -Value ""

        Write-Host "Enabled REDIS_URL in backend/.env" -ForegroundColor Green
    }

}
else {

    Write-Host "No backend/.env found." -ForegroundColor Yellow
    Write-Host "Copying .env.example to .env..." -ForegroundColor Yellow

    Copy-Item (Join-Path $Backend ".env.example") $EnvFile
}

# --------------------------------------------------
# Database Migration
# --------------------------------------------------

Set-Location $Backend

Write-Host ""
Write-Host "Running database migration..." -ForegroundColor Yellow

npm run db:migrate

if ($LASTEXITCODE -ne 0) {
    Write-Host "Migration failed." -ForegroundColor Red
    exit 1
}

# --------------------------------------------------
# Verify Stack
# --------------------------------------------------

Write-Host ""
Write-Host "Verifying stack..." -ForegroundColor Yellow

npm run dev:verify

exit $LASTEXITCODE