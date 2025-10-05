# QR Code Diagnostic - Quick Commands for Immediate Investigation
# Run these commands one by one to diagnose the issue

Write-Host "==================================================" -ForegroundColor Red
Write-Host "QR CODE ACCESS EMERGENCY DIAGNOSTICS" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Red
Write-Host ""
Write-Host "Run these commands to immediately investigate the issue:" -ForegroundColor Cyan
Write-Host ""

$APP_NAME = "vespa-upload-api"

Write-Host "1. CHECK FOR RATE LIMITING (last hour):" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "heroku logs --app $APP_NAME -n 1500 | Select-String -Pattern 'rate|429|throttle|limit|too many' -CaseSensitive:$false" -ForegroundColor Green
Write-Host ""

Write-Host "2. CHECK FOR TIMEOUTS & CONNECTION ISSUES:" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Gray
Write-Host "heroku logs --app $APP_NAME -n 1000 | Select-String -Pattern 'timeout|ETIMEDOUT|ECONNRESET|connection reset|socket hang up' -CaseSensitive:$false" -ForegroundColor Green
Write-Host ""

Write-Host "3. CHECK FOR DATABASE/KNACK API ERRORS:" -ForegroundColor Yellow
Write-Host "----------------------------------------" -ForegroundColor Gray
Write-Host "heroku logs --app $APP_NAME -n 1000 | Select-String -Pattern 'knack|database error|503|500|API error' -CaseSensitive:$false" -ForegroundColor Green
Write-Host ""

Write-Host "4. COUNT REGISTRATION ATTEMPTS PER MINUTE:" -ForegroundColor Yellow
Write-Host "-------------------------------------------" -ForegroundColor Gray
Write-Host "heroku logs --app $APP_NAME -n 2000 | Select-String -Pattern 'registration|self-register|qr' | Select-String -Pattern '\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' | Group-Object { `$_ -match '(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})'; `$matches[1] } | Sort-Object Count -Descending | Select-Object -First 15" -ForegroundColor Green
Write-Host ""

Write-Host "5. CHECK FOR CONCURRENT ACCESS PATTERNS:" -ForegroundColor Yellow
Write-Host "-----------------------------------------" -ForegroundColor Gray
Write-Host "heroku logs --app $APP_NAME -n 1000 | Select-String -Pattern 'simultaneous|concurrent|parallel|multiple.*user|conflict' -CaseSensitive:$false" -ForegroundColor Green
Write-Host ""

Write-Host "6. CHECK SERVER MEMORY & PERFORMANCE:" -ForegroundColor Yellow
Write-Host "--------------------------------------" -ForegroundColor Gray
Write-Host "heroku logs --app $APP_NAME -n 500 | Select-String -Pattern 'memory|heap|R14|R15|H12|H13|performance' -CaseSensitive:$false" -ForegroundColor Green
Write-Host ""

Write-Host "7. LIVE TAIL FILTERED FOR QR ACCESS:" -ForegroundColor Yellow
Write-Host "-------------------------------------" -ForegroundColor Gray
Write-Host "heroku logs --app $APP_NAME --tail | Select-String -Pattern 'qr|registration|error|timeout|429' -CaseSensitive:$false" -ForegroundColor Green
Write-Host ""

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "QUICK ANALYSIS COMMAND (Run this first!):" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Copy and run this command for immediate overview:" -ForegroundColor Green
Write-Host @"
`$logs = heroku logs --app vespa-upload-api -n 2000; Write-Host "LAST 30 MINUTES SUMMARY:" -ForegroundColor Yellow; `$errors = (`$logs | Select-String "error|fail|timeout|429|503").Count; `$registrations = (`$logs | Select-String "registration|self-register").Count; `$success = (`$logs | Select-String "success|created").Count; Write-Host "Total Errors: `$errors" -ForegroundColor Red; Write-Host "Registration Attempts: `$registrations" -ForegroundColor Cyan; Write-Host "Successful: `$success" -ForegroundColor Green; Write-Host ""; Write-Host "ERROR BREAKDOWN:" -ForegroundColor Yellow; `$logs | Select-String "error|timeout|429|503" | Select-Object -Last 10
"@ -ForegroundColor White

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

