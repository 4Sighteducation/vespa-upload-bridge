# Student CSV Email Investigation Script for Windows PowerShell
# Run this to quickly check Heroku logs for email issues

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "STUDENT CSV WELCOME EMAIL INVESTIGATION" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

$APP_NAME = "vespa-upload-api"

# Check if heroku CLI is installed
try {
    $herokuVersion = heroku --version
    Write-Host "✓ Heroku CLI found: $herokuVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Heroku CLI not found. Please install it first." -ForegroundColor Red
    Write-Host "   Download from: https://devcenter.heroku.com/articles/heroku-cli" -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "1️⃣  Checking last 100 lines for email-related activity..." -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Gray
heroku logs --app $APP_NAME -n 100 | Select-String -Pattern "email|mail|sendgrid|smtp|welcome" -CaseSensitive:$false | Select-Object -Last 15
Write-Host ""

Write-Host "2️⃣  Checking for student upload processing..." -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Gray
heroku logs --app $APP_NAME -n 200 | Select-String -Pattern "student.*process|onboard|csv.*student" -CaseSensitive:$false | Select-Object -Last 15
Write-Host ""

Write-Host "3️⃣  Looking for differences between manual and CSV..." -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Gray
heroku logs --app $APP_NAME -n 200 | Select-String -Pattern "manualEntry|manual.*entry|csv.*upload" -CaseSensitive:$false | Select-Object -Last 15
Write-Host ""

Write-Host "4️⃣  Checking for any recent errors..." -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Gray
heroku logs --app $APP_NAME -n 100 | Select-String -Pattern "error|exception|fail" -CaseSensitive:$false | Select-Object -Last 15
Write-Host ""

Write-Host "5️⃣  Quick comparison check..." -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Gray

# Run a quick test to see patterns
Write-Host "Counting occurrences in last 500 lines:" -ForegroundColor Yellow
$logs = heroku logs --app $APP_NAME -n 500

$emailSent = ($logs | Select-String -Pattern "email.*sent|welcome.*sent" -CaseSensitive:$false).Count
$emailFailed = ($logs | Select-String -Pattern "email.*fail|email.*error" -CaseSensitive:$false).Count
$studentProcess = ($logs | Select-String -Pattern "student.*process" -CaseSensitive:$false).Count
$staffProcess = ($logs | Select-String -Pattern "staff.*process" -CaseSensitive:$false).Count

Write-Host "  📧 Emails sent: $emailSent" -ForegroundColor Green
Write-Host "  ❌ Email failures: $emailFailed" -ForegroundColor Red
Write-Host "  👨‍🎓 Student processing: $studentProcess" -ForegroundColor Cyan
Write-Host "  👨‍🏫 Staff processing: $staffProcess" -ForegroundColor Cyan

Write-Host ""
Write-Host "6️⃣  Starting live tail (press Ctrl+C to stop)..." -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Gray
Write-Host "Watching for: student uploads and email sending..." -ForegroundColor Green
Write-Host ""

# Live tail with filtering
heroku logs --app $APP_NAME --tail | ForEach-Object {
    if ($_ -match "student|email|welcome|onboard") {
        if ($_ -match "error|fail|exception") {
            Write-Host $_ -ForegroundColor Red
        } elseif ($_ -match "sent|success|complete") {
            Write-Host $_ -ForegroundColor Green
        } else {
            Write-Host $_
        }
    }
}
