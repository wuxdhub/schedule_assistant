$ErrorActionPreference = "Continue"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Schedule Assistant Deploy Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

function Check-Dependencies {
    Write-Host "Checking dependencies..."
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Host "Error: Docker not installed" -ForegroundColor Red
        exit 1
    }
    $null = & docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Docker is not running, please start Docker Desktop" -ForegroundColor Red
        exit 1
    }
    $null = & docker compose version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: docker compose plugin not found, please upgrade Docker Desktop" -ForegroundColor Red
        exit 1
    }
    Write-Host "OK: Docker and Docker Compose ready" -ForegroundColor Green
}

function Check-EnvFile {
    if (Test-Path "server\.env") {
        Copy-Item "server\.env" ".env" -Force
        Write-Host "OK: Copied server/.env to .env" -ForegroundColor Green
    } elseif (-not (Test-Path ".env")) {
        Write-Host "Error: server/.env not found" -ForegroundColor Red
        exit 1
    }
}

function Cleanup {
    Write-Host "Stopping existing containers..."
    $null = & docker compose stop 2>&1
    Write-Host "OK: Cleanup done" -ForegroundColor Green
}

function Deploy {
    Write-Host "Building Docker images..."
    & docker compose build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "Starting services..."
    & docker compose up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Error: Failed to start services" -ForegroundColor Red
        exit 1
    }
    Write-Host "OK: Services started" -ForegroundColor Green
}

function Wait-ForDB {
    Write-Host "Waiting for database..."
    $maxAttempts = 30
    for ($i = 1; $i -le $maxAttempts; $i++) {
        $null = & docker exec schedule_postgres pg_isready -U postgres -d zhinengpaike 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK: Database ready" -ForegroundColor Green
            return
        }
        Write-Host "  Waiting... ($i/$maxAttempts)"
        Start-Sleep -Seconds 2
    }
    Write-Host "Error: Database timeout. Check logs: docker compose logs postgres" -ForegroundColor Red
    exit 1
}

function Run-Migrations {
    Write-Host "Running database migrations..."
    & docker exec schedule_server npx prisma migrate deploy 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "OK: Migration done (migrate deploy)" -ForegroundColor Green
    } else {
        Write-Host "migrate deploy failed, trying db push..." -ForegroundColor Yellow
        & docker exec schedule_server npx prisma db push --accept-data-loss
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK: Migration done (db push)" -ForegroundColor Green
        } else {
            Write-Host "Warning: Migration failed, please check manually" -ForegroundColor Yellow
        }
    }
}

function Wait-ForServer {
    Write-Host "Waiting for backend service..."
    $maxAttempts = 30
    for ($i = 1; $i -le $maxAttempts; $i++) {
        $null = & docker exec schedule_server wget --no-verbose --tries=1 --spider http://localhost:3001/api/health 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK: Backend ready" -ForegroundColor Green
            return
        }
        Write-Host "  Waiting... ($i/$maxAttempts)"
        Start-Sleep -Seconds 2
    }
    Write-Host "Warning: Backend not ready. Check logs: docker compose logs server" -ForegroundColor Yellow
}

function Wait-ForClient {
    Write-Host "Waiting for frontend service..."
    $maxAttempts = 15
    for ($i = 1; $i -le $maxAttempts; $i++) {
        $null = & docker exec schedule_client wget --no-verbose --tries=1 --spider http://localhost:80 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "OK: Frontend ready" -ForegroundColor Green
            return
        }
        Write-Host "  Waiting... ($i/$maxAttempts)"
        Start-Sleep -Seconds 2
    }
    Write-Host "Warning: Frontend not ready. Check logs: docker compose logs client" -ForegroundColor Yellow
}

function Show-Result {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "Deploy complete!" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Access URLs:"
    Write-Host "  Frontend: http://localhost:3000"
    Write-Host "  Backend:  http://localhost:3001"
    Write-Host "  Database: localhost:5432"
    Write-Host ""
    Write-Host "Useful commands:"
    Write-Host "  Logs:    docker compose logs -f"
    Write-Host "  Stop:    docker compose down"
    Write-Host "  Restart: docker compose restart"
    Write-Host "  Status:  docker compose ps"
    Write-Host ""
    Write-Host "DB: host=localhost port=5432 db=zhinengpaike user=postgres pass=123456"
    Write-Host ""
}

Set-Location $PSScriptRoot
Check-Dependencies
Check-EnvFile
Cleanup
Deploy
Wait-ForDB
Run-Migrations
Wait-ForServer
Wait-ForClient
Show-Result
