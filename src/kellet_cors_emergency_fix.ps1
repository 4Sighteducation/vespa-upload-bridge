# URGENT: Kellet School CORS/Network Issue Fix
# Issue: "Unable to initialize registration form" - works on VPN only
# This indicates CORS blocking or IP-based restrictions

Write-Host "==================================================" -ForegroundColor Red
Write-Host "KELLET SCHOOL - CORS/NETWORK EMERGENCY FIX" -ForegroundColor Yellow
Write-Host "Issue: Registration form blocked without VPN" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Red
Write-Host ""

$APP_NAME = "vespa-upload-api"
$CUSTOMER_ID = "68ad56ab27597d0311a5d4e7"

Write-Host "DIAGNOSIS: Students WITHOUT VPN are being blocked!" -ForegroundColor Red
Write-Host "This indicates:" -ForegroundColor Yellow
Write-Host "1. CORS (Cross-Origin) blocking from Kellet's network" -ForegroundColor White
Write-Host "2. The registration form is hosted on a domain not whitelisted" -ForegroundColor White
Write-Host "3. School firewall/proxy blocking the API calls" -ForegroundColor White
Write-Host ""

Write-Host "🔍 STEP 1: Checking recent CORS errors..." -ForegroundColor Yellow
Write-Host "===========================================" -ForegroundColor Gray
heroku logs --app $APP_NAME -n 500 | Select-String -Pattern "CORS|cors|Origin|origin|blocked" -CaseSensitive:$false | Select-Object -Last 10

Write-Host ""
Write-Host "🔍 STEP 2: Checking registration form initialization errors..." -ForegroundColor Yellow
Write-Host "===============================================================" -ForegroundColor Gray
heroku logs --app $APP_NAME -n 500 | Select-String -Pattern "initialize|initialise|registration.*form|unable" -CaseSensitive:$false | Select-Object -Last 10

Write-Host ""
Write-Host "🔍 STEP 3: Identifying blocked origins..." -ForegroundColor Yellow
Write-Host "==========================================" -ForegroundColor Gray
heroku logs --app $APP_NAME -n 300 | Select-String -Pattern "Origin:.*|origin.*blocked|Not allowed by CORS" | Select-Object -Last 10

Write-Host ""
Write-Host "📍 STEP 4: Getting Kellet's IP range (from recent logs)..." -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Gray
$kelletLogs = heroku logs --app $APP_NAME -n 1000 | Select-String -Pattern "68ad56ab27597d0311a5d4e7|Kellet"
$ipPattern = "\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b"
$kelletIPs = $kelletLogs | ForEach-Object {
    if ($_ -match $ipPattern) {
        $matches[0]
    }
} | Sort-Object -Unique
Write-Host "Recent IPs associated with Kellet:" -ForegroundColor Cyan
$kelletIPs | ForEach-Object { Write-Host "  $_" -ForegroundColor White }

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "IMMEDIATE FIX #1: Update CORS Configuration" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "The API needs to allow Kellet's domain. Current allowed origins:" -ForegroundColor Cyan
Write-Host "- https://vespaacademy.knack.com" -ForegroundColor White
Write-Host "- https://4sighteducation.github.io" -ForegroundColor White
Write-Host "- All *.knack.com subdomains" -ForegroundColor White
Write-Host ""
Write-Host "QUESTION: Where is Kellet hosting their QR form?" -ForegroundColor Red
Write-Host "If it's a custom domain, we need to add it to CORS!" -ForegroundColor Yellow
Write-Host ""

Write-Host "==================================================" -ForegroundColor Green
Write-Host "IMMEDIATE FIX #2: Emergency Bypass Link" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Generate a direct link that bypasses the form initialization:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Option A: Use the GitHub Pages hosted form (already whitelisted):" -ForegroundColor Green
Write-Host "https://4sighteducation.github.io/self-registration.html?link=THEIR_LINK_ID" -ForegroundColor White
Write-Host ""
Write-Host "Option B: Direct Knack form (if available):" -ForegroundColor Green
Write-Host "https://vespaacademy.knack.com/vespa-online#self-register/THEIR_LINK_ID" -ForegroundColor White
Write-Host ""

Write-Host "==================================================" -ForegroundColor Green
Write-Host "IMMEDIATE FIX #3: Temporary Workaround" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "1. Tell ALL students to use one of these solutions:" -ForegroundColor Yellow
Write-Host "   a) Use mobile data instead of school WiFi" -ForegroundColor White
Write-Host "   b) Use a VPN (as already discovered)" -ForegroundColor White
Write-Host "   c) Access from home network" -ForegroundColor White
Write-Host ""
Write-Host "2. OR provide them this direct API test:" -ForegroundColor Yellow
Write-Host "   Have them visit: https://vespa-upload-api-52e3d8d66a70.herokuapp.com/api/status" -ForegroundColor White
Write-Host "   If they see 'blocked' or can't access, it's network blocking" -ForegroundColor White
Write-Host ""

Write-Host "==================================================" -ForegroundColor Red
Write-Host "CHECKING FOR KELLET'S QR LINK DETAILS..." -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Red
Write-Host ""
Write-Host "Searching for their active registration link..." -ForegroundColor Cyan
heroku logs --app $APP_NAME -n 1000 | Select-String -Pattern "68ad56ab27597d0311a5d4e7.*link|generate.*link.*68ad56ab27597d0311a5d4e7|linkId" | Select-Object -Last 5

Write-Host ""
Write-Host "==================================================" -ForegroundColor Magenta
Write-Host "PERMANENT FIX NEEDED:" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "1. UPDATE index.js in vespa-upload-api to add Kellet's domain to CORS" -ForegroundColor White
Write-Host "2. OR implement wildcard CORS for registration endpoints" -ForegroundColor White
Write-Host "3. OR host the registration form on an already-whitelisted domain" -ForegroundColor White
Write-Host ""
Write-Host "Press any key to start live monitoring..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

Write-Host ""
Write-Host "📡 LIVE MONITORING for CORS/Network errors..." -ForegroundColor Green
Write-Host "===============================================" -ForegroundColor Gray
heroku logs --app $APP_NAME --tail | ForEach-Object {
    $line = $_
    if ($line -match "CORS|cors|Origin|blocked|Kellet|68ad56ab27597d0311a5d4e7|initialize|unable") {
        if ($line -match "error|blocked|denied|failed") {
            Write-Host "❌ $line" -ForegroundColor Red
        } else {
            Write-Host "📊 $line" -ForegroundColor Yellow
        }
    }
}










