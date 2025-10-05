# IMMEDIATE FIX for Kellet School QR Code Access Issue
# Run this script NOW to attempt to resolve the concurrent access problem

Write-Host "==================================================" -ForegroundColor Red
Write-Host "KELLET SCHOOL - IMMEDIATE FIX DEPLOYMENT" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Red
Write-Host ""

$APP_NAME = "vespa-upload-api"

Write-Host "Step 1: Restarting the API to clear stuck connections..." -ForegroundColor Yellow
heroku restart --app $APP_NAME

Write-Host ""
Write-Host "Step 2: Scaling up dynos temporarily to handle load..." -ForegroundColor Yellow
Write-Host "Current dyno status:" -ForegroundColor Cyan
heroku ps --app $APP_NAME

Write-Host ""
Write-Host "To scale up (if needed), run:" -ForegroundColor Green
Write-Host "heroku ps:scale web=2 --app $APP_NAME" -ForegroundColor White
Write-Host ""

Write-Host "Step 3: Checking current memory usage..." -ForegroundColor Yellow
heroku logs --app $APP_NAME -n 100 | Select-String -Pattern "memory|Memory" | Select-Object -Last 5

Write-Host ""
Write-Host "Step 4: Quick health check..." -ForegroundColor Yellow
$response = Invoke-WebRequest -Uri "https://vespa-upload-api-52e3d8d66a70.herokuapp.com/api/status" -UseBasicParsing
Write-Host "API Status: $($response.StatusCode)" -ForegroundColor $(if ($response.StatusCode -eq 200) {"Green"} else {"Red"})

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "TEMPORARY WORKAROUND FOR KELLET SCHOOL:" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. IMMEDIATE: Instruct students to scan QR codes in smaller groups:" -ForegroundColor Green
Write-Host "   - Group 1: First 10 students scan and wait 30 seconds" -ForegroundColor White
Write-Host "   - Group 2: Next 10 students scan and wait 30 seconds" -ForegroundColor White
Write-Host "   - Continue in batches of 10 with 30-second gaps" -ForegroundColor White
Write-Host ""
Write-Host "2. ALTERNATIVE: Use manual registration for affected students:" -ForegroundColor Green
Write-Host "   - Access the Knack portal directly" -ForegroundColor White
Write-Host "   - Use bulk CSV upload if many students are affected" -ForegroundColor White
Write-Host ""
Write-Host "3. MONITORING: Keep this running in another window:" -ForegroundColor Green
Write-Host "   .\kellet_urgent_investigation.ps1" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press any key to continue monitoring..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

