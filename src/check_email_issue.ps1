# Student CSV Email Issue Checker
# Simple script without emojis for better compatibility

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   STUDENT CSV EMAIL ISSUE CHECKER" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$APP_NAME = "vespa-upload-api"

# Check Heroku login
Write-Host "Checking Heroku login status..." -ForegroundColor Gray
try {
    $authCheck = heroku auth:whoami 2>$null
    if ($authCheck) {
        Write-Host "[OK] Logged in as: $authCheck" -ForegroundColor Green
    } else {
        Write-Host "[!] Not logged in. Please run: heroku login" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[!] Heroku CLI not found or not logged in" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Fetching last 500 logs from $APP_NAME..." -ForegroundColor Yellow
$logs = heroku logs --app $APP_NAME -n 500 2>$null

if (-not $logs) {
    Write-Host "[ERROR] Could not fetch logs" -ForegroundColor Red
    exit 1
}

# Initialize counters
$studentCSV = 0
$staffCSV = 0
$manualStudent = 0
$emailsSent = 0
$emailsFailed = 0
$studentEmails = 0

Write-Host "Analyzing log patterns..." -ForegroundColor Cyan

foreach ($line in $logs) {
    # Count student CSV processing
    if ($line -match "student.*onboard.*process" -and $line -notmatch "manual") {
        $studentCSV++
        if ($line -match "email.*sent|welcome.*sent") {
            $studentEmails++
        }
    }
    
    # Count staff CSV processing  
    if ($line -match "staff.*process" -and $line -notmatch "manual") {
        $staffCSV++
    }
    
    # Count manual entries
    if ($line -match "manualEntry.*true") {
        $manualStudent++
    }
    
    # Count emails
    if ($line -match "email.*sent|welcome.*sent") {
        $emailsSent++
    }
    if ($line -match "email.*fail|email.*error") {
        $emailsFailed++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Gray
Write-Host "ANALYSIS RESULTS:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Gray

Write-Host ""
Write-Host "Upload Processing:" -ForegroundColor Yellow
Write-Host "  Student CSV uploads found: $studentCSV" -ForegroundColor White
Write-Host "  Staff CSV uploads found: $staffCSV" -ForegroundColor White
Write-Host "  Manual student entries found: $manualStudent" -ForegroundColor White

Write-Host ""
Write-Host "Email Status:" -ForegroundColor Yellow
Write-Host "  Total emails sent: $emailsSent" -ForegroundColor $(if ($emailsSent -gt 0) { "Green" } else { "Red" })
Write-Host "  Total email failures: $emailsFailed" -ForegroundColor $(if ($emailsFailed -gt 0) { "Red" } else { "Green" })
Write-Host "  Student CSV emails sent: $studentEmails" -ForegroundColor $(if ($studentEmails -gt 0) { "Green" } else { "Red" })

Write-Host ""
Write-Host "========================================" -ForegroundColor Gray
Write-Host "DIAGNOSIS:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Gray

if ($studentCSV -gt 0 -and $studentEmails -eq 0) {
    Write-Host ""
    Write-Host "[PROBLEM CONFIRMED]" -ForegroundColor Red -BackgroundColor DarkRed
    Write-Host "Student CSV uploads are NOT sending welcome emails!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Evidence:" -ForegroundColor Yellow
    Write-Host "  - Found $studentCSV student CSV upload(s)" -ForegroundColor White
    Write-Host "  - Found 0 welcome emails sent for these uploads" -ForegroundColor White
    
    if ($manualStudent -gt 0) {
        Write-Host "  - Manual entries ARE working ($manualStudent found)" -ForegroundColor Green
    }
    if ($staffCSV -gt 0) {
        Write-Host "  - Staff CSV uploads found: $staffCSV" -ForegroundColor White
    }
} else {
    Write-Host ""
    Write-Host "[NO ISSUE DETECTED]" -ForegroundColor Green
    Write-Host "Recent logs show emails are being sent" -ForegroundColor Green
}

# Look for the root cause
Write-Host ""
Write-Host "========================================" -ForegroundColor Gray
Write-Host "ROOT CAUSE ANALYSIS:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Gray

$manualEntryChecks = $logs | Select-String "manualEntry" | Select-Object -First 5
if ($manualEntryChecks) {
    Write-Host ""
    Write-Host "Found references to manualEntry flag:" -ForegroundColor Yellow
    foreach ($check in $manualEntryChecks) {
        $line = $check.Line
        if ($line -match "manualEntry.*true") {
            Write-Host "  [TRUE] $line" -ForegroundColor Green
        } elseif ($line -match "manualEntry.*false") {
            Write-Host "  [FALSE] $line" -ForegroundColor Red
        } else {
            Write-Host "  [?] $line" -ForegroundColor Gray
        }
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Gray
Write-Host "RECOMMENDED FIX:" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Gray

Write-Host ""
Write-Host "QUICK FIX (Frontend):" -ForegroundColor Yellow
Write-Host "  In index9u.js, find the processUploadData function" -ForegroundColor White
Write-Host "  Change: manualEntry: false" -ForegroundColor Red
Write-Host "  To:     manualEntry: true" -ForegroundColor Green
Write-Host ""
Write-Host "PROPER FIX (Backend):" -ForegroundColor Yellow
Write-Host "  In worker.js, find the email sending logic" -ForegroundColor White
Write-Host "  Remove any condition that checks: if (options.manualEntry)" -ForegroundColor White
Write-Host "  Emails should be sent regardless of this flag" -ForegroundColor White

Write-Host ""
Write-Host "Press Enter to exit..."
Read-Host
