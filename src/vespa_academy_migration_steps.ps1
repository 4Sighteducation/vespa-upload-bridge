# Quick Migration Steps to vespa.academy
# Run these commands to implement the fix

Write-Host "==================================================" -ForegroundColor Green
Write-Host "VESPA.ACADEMY MIGRATION - QUICK IMPLEMENTATION" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""

Write-Host "📋 STEP 1: Files to Upload to vespa.academy" -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Gray
Write-Host "Upload these files to your vespa.academy hosting:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  1. .\root\self-registration-form.html" -ForegroundColor White
Write-Host "  2. .\root\staff-registration-form.html" -ForegroundColor White
Write-Host "  3. .\root\auto-login-redirect.html" -ForegroundColor White
Write-Host ""
Write-Host "Suggested URL structure:" -ForegroundColor Green
Write-Host "  https://vespa.academy/registration/self-registration-form.html" -ForegroundColor White
Write-Host "  https://vespa.academy/registration/staff-registration-form.html" -ForegroundColor White
Write-Host ""

Write-Host "📋 STEP 2: Update API CORS Settings" -ForegroundColor Yellow
Write-Host "====================================" -ForegroundColor Gray
Write-Host "Edit: vespa-upload-api\index.js" -ForegroundColor Cyan
Write-Host ""
Write-Host "Find the allowedOrigins array and add:" -ForegroundColor Green
Write-Host @"
  'https://vespa.academy',
  'https://www.vespa.academy',
"@ -ForegroundColor White
Write-Host ""

Write-Host "📋 STEP 3: Deploy API Changes" -ForegroundColor Yellow
Write-Host "==============================" -ForegroundColor Gray
Write-Host "Run these commands:" -ForegroundColor Cyan
Write-Host ""
Write-Host "cd C:\Users\tonyd\OneDrive - 4Sight Education Ltd\Apps\vespa-upload-api" -ForegroundColor White
Write-Host "git add ." -ForegroundColor White
Write-Host "git commit -m 'Add vespa.academy to CORS allowed origins for Kellet School fix'" -ForegroundColor White
Write-Host "git push" -ForegroundColor White
Write-Host ""
Write-Host "(This will auto-deploy to Heroku)" -ForegroundColor Green
Write-Host ""

Write-Host "📋 STEP 4: Test the New Setup" -ForegroundColor Yellow
Write-Host "==============================" -ForegroundColor Gray
Write-Host "Test URL (replace LINK_ID with actual):" -ForegroundColor Cyan
Write-Host "https://vespa.academy/registration/self-registration-form.html?id=LINK_ID" -ForegroundColor White
Write-Host ""

Write-Host "📋 STEP 5: Update QR Code Generation" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Gray
Write-Host "For future QR codes, update the URL generation in:" -ForegroundColor Cyan
Write-Host "vespa-upload-bridge\src\index10d.js" -ForegroundColor White
Write-Host ""
Write-Host "Change from:" -ForegroundColor Yellow
Write-Host "https://4sighteducation.github.io/vespa-upload-bridge/root/" -ForegroundColor Red
Write-Host "To:" -ForegroundColor Yellow
Write-Host "https://vespa.academy/registration/" -ForegroundColor Green
Write-Host ""

Write-Host "📋 STEP 6: Generate New QR for Kellet" -ForegroundColor Yellow
Write-Host "======================================" -ForegroundColor Gray
Write-Host "Once vespa.academy is ready:" -ForegroundColor Cyan
Write-Host "1. Generate new QR code for Kellet using vespa.academy domain" -ForegroundColor White
Write-Host "2. Send to Chris with confirmation that it will work on school network" -ForegroundColor White
Write-Host ""

Write-Host "==================================================" -ForegroundColor Green
Write-Host "IMMEDIATE COMMAND TO RUN:" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "# Check current CORS settings in API:" -ForegroundColor Cyan
$checkCorsCommand = @"
cd 'C:\Users\tonyd\OneDrive - 4Sight Education Ltd\Apps\vespa-upload-api\vespa-upload-api'
Select-String -Path '.\index.js' -Pattern 'allowedOrigins|4sighteducation' -Context 2,2
"@
Write-Host $checkCorsCommand -ForegroundColor White
Write-Host ""
Write-Host "Press Enter to run this command..." -ForegroundColor Gray
$null = Read-Host
Invoke-Expression $checkCorsCommand









