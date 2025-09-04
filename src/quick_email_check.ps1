cd # Quick Student CSV Email Issue Checker
# This script quickly identifies the problem by checking specific patterns

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "   STUDENT CSV EMAIL ISSUE CHECKER" -ForegroundColor Yellow
Write-Host "========================================`n" -ForegroundColor Cyan

$APP_NAME = "vespa-upload-api"

# Check if logged in to Heroku
Write-Host "Checking Heroku login status..." -ForegroundColor Gray
try {
    $authCheck = heroku auth:whoami 2>$null
    Write-Host "✓ Logged in as: $authCheck" -ForegroundColor Green
} catch {
    Write-Host "❌ Not logged in to Heroku. Running: heroku login" -ForegroundColor Red
    heroku login
}

Write-Host "`n📋 QUICK CHECK: Last 500 logs analysis" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray

# Get last 500 logs
$logs = heroku logs --app $APP_NAME -n 500 2>$null

if (-not $logs) {
    Write-Host "❌ Could not fetch logs. Please check your Heroku access." -ForegroundColor Red
    exit 1
}

# Analysis counters
$studentCSVCount = 0
$staffCSVCount = 0
$manualStudentCount = 0
$manualStaffCount = 0
$emailSentCount = 0
$emailFailCount = 0
$studentEmailSent = 0
$staffEmailSent = 0

Write-Host "`nAnalyzing patterns..." -ForegroundColor Yellow

foreach ($line in $logs) {
    # Check for student CSV processing
    if ($line -match "student.*onboard.*process" -and $line -match "csv") {
        $studentCSVCount++
        if ($line -match "email.*sent|welcome.*sent") {
            $studentEmailSent++
        }
    }
    
    # Check for staff CSV processing
    if ($line -match "staff.*process" -and $line -match "csv") {
        $staffCSVCount++
        if ($line -match "email.*sent|welcome.*sent") {
            $staffEmailSent++
        }
    }
    
    # Check for manual entry
    if ($line -match "manualEntry.*true|manual.*entry.*true") {
        if ($line -match "student") {
            $manualStudentCount++
        }
        if ($line -match "staff") {
            $manualStaffCount++
        }
    }
    
    # Check email status
    if ($line -match "email.*sent|welcome.*email.*sent|notification.*sent") {
        $emailSentCount++
    }
    if ($line -match "email.*fail|email.*error|sendgrid.*error") {
        $emailFailCount++
    }
}

Write-Host "`n📊 RESULTS SUMMARY:" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Gray

Write-Host "`n📥 UPLOAD PROCESSING:" -ForegroundColor Yellow
Write-Host "  Student CSV uploads: $studentCSVCount" -ForegroundColor White
Write-Host "  Staff CSV uploads: $staffCSVCount" -ForegroundColor White
Write-Host "  Manual Student entries: $manualStudentCount" -ForegroundColor White
Write-Host "  Manual Staff entries: $manualStaffCount" -ForegroundColor White

Write-Host "`n📧 EMAIL STATUS:" -ForegroundColor Yellow
Write-Host "  Total emails sent: $emailSentCount" -ForegroundColor $(if ($emailSentCount -gt 0) { "Green" } else { "Red" })
Write-Host "  Total email failures: $emailFailCount" -ForegroundColor $(if ($emailFailCount -gt 0) { "Red" } else { "Green" })
Write-Host "  Student CSV emails sent: $studentEmailSent" -ForegroundColor $(if ($studentEmailSent -gt 0) { "Green" } else { "Red" })
Write-Host "  Staff CSV emails sent: $staffEmailSent" -ForegroundColor $(if ($staffEmailSent -gt 0) { "Green" } else { "White" })

# Diagnosis
Write-Host "`n🔍 DIAGNOSIS:" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Gray

if ($studentCSVCount -gt 0 -and $studentEmailSent -eq 0) {
    Write-Host "❌ PROBLEM CONFIRMED: Student CSV uploads are NOT sending emails!" -ForegroundColor Red
    Write-Host "   - Student CSV uploads detected: $studentCSVCount" -ForegroundColor Red
    Write-Host "   - Student CSV emails sent: 0" -ForegroundColor Red
    
    if ($manualStudentCount -gt 0 -or $staffCSVCount -gt 0) {
        Write-Host "`n✓ Other methods ARE working:" -ForegroundColor Green
        if ($manualStudentCount -gt 0) {
            Write-Host "   - Manual student entries: $manualStudentCount" -ForegroundColor Green
        }
        if ($staffCSVCount -gt 0) {
            Write-Host "   - Staff CSV uploads: $staffCSVCount" -ForegroundColor Green
        }
    }
} else {
    Write-Host "✓ No obvious email issues detected in recent logs" -ForegroundColor Green
}

Write-Host "`n🔎 SEARCHING FOR CLUES..." -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Gray

# Look for specific patterns
Write-Host "`nChecking for 'manualEntry' flag differences..." -ForegroundColor Yellow
$manualEntryLines = $logs | Select-String "manualEntry" -Context 1,1
if ($manualEntryLines) {
    Write-Host "Found manualEntry references:" -ForegroundColor Yellow
    $manualEntryLines | Select-Object -First 3 | ForEach-Object { 
        Write-Host $_.Line -ForegroundColor Gray 
    }
}

Write-Host "`nChecking for conditional email logic..." -ForegroundColor Yellow
$conditionalLines = $logs | Select-String "if.*manualEntry|manualEntry.*\?" -Context 1,1
if ($conditionalLines) {
    Write-Host "⚠️  FOUND CONDITIONAL LOGIC based on manualEntry!" -ForegroundColor Red
    $conditionalLines | Select-Object -First 3 | ForEach-Object { 
        Write-Host $_.Line -ForegroundColor Red 
    }
}

Write-Host "`nRECOMMENDED ACTIONS:" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Gray
Write-Host "1. Check worker.js for conditional email sending based on manualEntry flag" -ForegroundColor Yellow
Write-Host "2. Look for: if (options.manualEntry) { sendEmail() }" -ForegroundColor Yellow
Write-Host "3. Temporary fix: Set manualEntry: true for CSV uploads in frontend" -ForegroundColor Yellow
Write-Host "4. Permanent fix: Remove conditional in worker.js" -ForegroundColor Yellow

Write-Host "`nPress Enter to see recent student-related logs..."
Read-Host

Write-Host "`n📜 RECENT STUDENT PROCESSING LOGS:" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Gray
$logs | Select-String "student.*onboard|student.*process" | Select-Object -Last 10 | ForEach-Object {
    if ($_ -match "error|fail") {
        Write-Host $_ -ForegroundColor Red
    } elseif ($_ -match "success|complete|sent") {
        Write-Host $_ -ForegroundColor Green
    } else {
        Write-Host $_ -ForegroundColor White
    }
}
mmans it is quicker
