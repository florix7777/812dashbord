$ErrorActionPreference = "Stop"

Write-Host "=== Health Check $(Get-Date) ===" -ForegroundColor Cyan

Write-Host "1. Backend health:" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:8000/api/health" -ErrorAction Stop
    $health | ConvertTo-Json -Depth 2
} catch {
    Write-Host "FAILED: $_" -ForegroundColor Red
}

Write-Host "`n2. Employees count:" -ForegroundColor Yellow
try {
    $emps = Invoke-RestMethod -Uri "http://localhost:8000/api/employees" -ErrorAction Stop
    Write-Host $emps.Length
} catch {
    Write-Host "FAILED: $_" -ForegroundColor Red
}

Write-Host "`n3. Frontend status:" -ForegroundColor Yellow
try {
    $res = Invoke-WebRequest -Uri "http://localhost/index.html" -Method Head -ErrorAction Stop
    Write-Host "Status Code: $($res.StatusCode) $($res.StatusDescription)"
} catch {
    Write-Host "FAILED: $_" -ForegroundColor Red
}

Write-Host "`n4. Docker containers:" -ForegroundColor Yellow
try {
    docker ps --format "table {{.Names}}`t{{.Status}}"
} catch {
    Write-Host "Docker command failed." -ForegroundColor Red
}
