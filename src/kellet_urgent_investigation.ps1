# URGENT: Kellet School QR Code Issue Investigation
# School: Kellet School
# Customer ID: 68ad56ab27597d0311a5d4e7
# Issue: Half of students being frozen out during QR code access

Write-Host "==================================================" -ForegroundColor Red
Write-Host "KELLET SCHOOL QR CODE EMERGENCY INVESTIGATION" -ForegroundColor Yellow
Write-Host "Customer ID: 68ad56ab27597d0311a5d4e7" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Red
Write-Host ""

$APP_NAME = "vespa-upload-api"
$CUSTOMER_ID = "68ad56ab27597d0311a5d4e7"
$SCHOOL_NAME = "Kellet"

# Check if heroku CLI is installed
try {
    $herokuVersion = heroku --version
    Write-Host "✓ Heroku CLI found: $herokuVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Heroku CLI not found. Please install it first." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔍 IMMEDIATE DIAGNOSIS FOR KELLET SCHOOL..." -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Gray

# Get last 2000 lines to ensure we capture all recent activity
Write-Host "Fetching recent logs..." -ForegroundColor Cyan
$logs = heroku logs --app $APP_NAME -n 2000

# Filter for Kellet-specific activity
Write-Host ""
Write-Host "📊 KELLET SCHOOL ACCESS PATTERNS (Last 30 minutes):" -ForegroundColor Yellow
Write-Host "----------------------------------------------------" -ForegroundColor Gray

$kelletLogs = $logs | Select-String -Pattern "68ad56ab27597d0311a5d4e7|Kellet" -CaseSensitive:$false
$registrationAttempts = ($kelletLogs | Select-String -Pattern "registration|self-register|qr").Count
$successfulRegs = ($kelletLogs | Select-String -Pattern "success|created|complete").Count
$failedRegs = ($kelletLogs | Select-String -Pattern "error|fail|timeout|denied").Count

Write-Host "  📱 Total Kellet Registration Attempts: $registrationAttempts" -ForegroundColor Cyan
Write-Host "  ✅ Successful Registrations: $successfulRegs" -ForegroundColor Green
Write-Host "  ❌ Failed Registrations: $failedRegs" -ForegroundColor Red

if ($failedRegs -gt 0) {
    Write-Host ""
    Write-Host "⚠️  HIGH FAILURE RATE DETECTED!" -ForegroundColor Red
    $failureRate = [math]::Round(($failedRegs / [math]::Max($registrationAttempts, 1)) * 100, 1)
    Write-Host "  Failure Rate: $failureRate%" -ForegroundColor Red
}

Write-Host ""
Write-Host "🚨 KELLET-SPECIFIC ERRORS (Last 10):" -ForegroundColor Red
Write-Host "-------------------------------------" -ForegroundColor Gray
$kelletLogs | Select-String -Pattern "error|fail|timeout|429|500|503" | Select-Object -Last 10

Write-Host ""
Write-Host "⏱️ CONCURRENT ACCESS ANALYSIS:" -ForegroundColor Yellow
Write-Host "-------------------------------" -ForegroundColor Gray

# Extract timestamps for Kellet and count per minute
$kelletTimestamps = $kelletLogs | ForEach-Object {
    if ($_ -match "(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})") {
        $matches[1]
    }
} | Group-Object | Sort-Object Count -Descending | Select-Object -First 10

Write-Host "Requests per minute for Kellet School:" -ForegroundColor Cyan
foreach ($timestamp in $kelletTimestamps) {
    $minute = $timestamp.Name
    $count = $timestamp.Count
    $bar = "*" * [Math]::Min($count, 50)
    
    if ($count -gt 15) {
        Write-Host "$minute : $count requests $bar" -ForegroundColor Red
        Write-Host "  ⚠️  POTENTIAL BOTTLENECK - Too many simultaneous requests!" -ForegroundColor Yellow
    } elseif ($count -gt 10) {
        Write-Host "$minute : $count requests $bar" -ForegroundColor Yellow
    } else {
        Write-Host "$minute : $count requests $bar" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "🔥 SPECIFIC BOTTLENECK CHECK:" -ForegroundColor Red
Write-Host "------------------------------" -ForegroundColor Gray

# Check for specific issues
$knackApiErrors = ($kelletLogs | Select-String -Pattern "knack.*error|API.*error|503").Count
$timeouts = ($kelletLogs | Select-String -Pattern "timeout|ETIMEDOUT|ECONNRESET").Count
$rateLimits = ($kelletLogs | Select-String -Pattern "rate.*limit|429|too.*many").Count
$sessionIssues = ($kelletLogs | Select-String -Pattern "session|cookie|auth").Count

Write-Host "  🔗 Knack API Errors: $knackApiErrors" -ForegroundColor $(if ($knackApiErrors -gt 0) {"Red"} else {"Green"})
Write-Host "  ⏱️ Timeout Errors: $timeouts" -ForegroundColor $(if ($timeouts -gt 0) {"Red"} else {"Green"})
Write-Host "  🚫 Rate Limit Hits: $rateLimits" -ForegroundColor $(if ($rateLimits -gt 0) {"Red"} else {"Green"})
Write-Host "  🔐 Session/Auth Issues: $sessionIssues" -ForegroundColor $(if ($sessionIssues -gt 0) {"Yellow"} else {"Green"})

# Check for memory issues
$memoryIssues = ($logs | Select-String -Pattern "R14|R15|memory|heap").Count
if ($memoryIssues -gt 0) {
    Write-Host ""
    Write-Host "⚠️  MEMORY PRESSURE DETECTED!" -ForegroundColor Red
    Write-Host "  Memory-related errors: $memoryIssues" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📋 RECOMMENDED IMMEDIATE ACTIONS:" -ForegroundColor Green
Write-Host "==================================" -ForegroundColor Gray

if ($rateLimits -gt 0) {
    Write-Host "1. ⚠️  RATE LIMITING DETECTED - Consider:" -ForegroundColor Yellow
    Write-Host "   - Implementing request queuing" -ForegroundColor White
    Write-Host "   - Adding caching for staff data lookups" -ForegroundColor White
    Write-Host "   - Spacing out QR code scans (e.g., groups of 10 students)" -ForegroundColor White
}

if ($timeouts -gt 0) {
    Write-Host "2. ⏱️  TIMEOUTS DETECTED - Consider:" -ForegroundColor Yellow
    Write-Host "   - Checking Knack API status" -ForegroundColor White
    Write-Host "   - Increasing timeout settings" -ForegroundColor White
    Write-Host "   - Implementing retry logic" -ForegroundColor White
}

if ($failedRegs -gt ($successfulRegs * 0.3)) {
    Write-Host "3. ❌ HIGH FAILURE RATE - Immediate actions:" -ForegroundColor Red
    Write-Host "   - Check if QR link is still valid (not expired)" -ForegroundColor White
    Write-Host "   - Verify school's Knack account is active" -ForegroundColor White
    Write-Host "   - Consider generating a new QR code" -ForegroundColor White
}

Write-Host ""
Write-Host "🔄 QUICK FIX COMMAND (Run this now):" -ForegroundColor Green
Write-Host "-------------------------------------" -ForegroundColor Gray
Write-Host "heroku restart --app $APP_NAME" -ForegroundColor Yellow
Write-Host "(This will clear any stuck connections/sessions)" -ForegroundColor Cyan

Write-Host ""
Write-Host "📡 STARTING LIVE MONITORING FOR KELLET..." -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

# Live monitoring specifically for Kellet
heroku logs --app $APP_NAME --tail | ForEach-Object {
    $line = $_
    
    # Only show Kellet-related logs
    if ($line -match "68ad56ab27597d0311a5d4e7|Kellet") {
        if ($line -match "error|fail|timeout|denied|429|500|503") {
            Write-Host "❌ KELLET ERROR: $line" -ForegroundColor Red
        } elseif ($line -match "warning|slow|delay") {
            Write-Host "⚠️  KELLET WARNING: $line" -ForegroundColor Yellow
        } elseif ($line -match "success|created|complete") {
            Write-Host "✅ KELLET SUCCESS: $line" -ForegroundColor Green
        } else {
            Write-Host "📊 KELLET: $line" -ForegroundColor Cyan
        }
    }
    # Also show any rate limiting or timeout errors that might affect Kellet
    elseif ($line -match "rate.*limit|429|timeout|R14|R15") {
        Write-Host "⚠️  SYSTEM: $line" -ForegroundColor Magenta
    }
}

