@echo off
REM Docker Desktop Quick Check Script
REM Для QC Dashboard v1.3.3

echo ============================================
echo QC Dashboard - Docker Check
echo ============================================
echo.

REM Check Docker
echo [1] Checking Docker...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker not installed or not in PATH
    echo Install Docker Desktop: https://www.docker.com/products/docker-desktop/
    goto :end
)
echo [OK] Docker installed

REM Check Docker running
echo.
echo [2] Checking Docker Daemon...
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Docker Desktop not running
    echo Start Docker Desktop application
    goto :compose_check
)
echo [OK] Docker Daemon running

REM Check QC containers
echo.
echo [3] Checking QC containers...
docker ps -a --filter "name=qc_" --format "table {{.Names}}\t{{.Status}}" 2>nul
if %errorlevel% neq 0 (
    echo [INFO] No QC containers found
    goto :compose_check
)

:compose_check
echo.
echo [4] Checking docker-compose.yml...
docker compose config >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] docker-compose.yml invalid
    goto :end
)
echo [OK] docker-compose.yml valid

:end
echo.
echo ============================================
echo Commands:
echo   docker compose up -d --build    - Start
echo   docker compose ps               - Status
echo   docker compose logs -f          - Logs
echo   docker compose down             - Stop
echo ============================================
