# QR Code Access Monitoring Script for Windows PowerShell
# Emergency script to diagnose simultaneous access issues with student QR codes
# Run this to monitor real-time traffic and identify bottlenecks

Write-Host "==================================================" -ForegroundColor Red
Write-Host "URGENT: QR CODE ACCESS MONITORING" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Red
Write-Host ""

$APP_NAME = "vespa-upload-api"
$SCHOOL_NAME = Read-Host "Enter the school name (or press Enter to monitor all)"

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
Write-Host "🔍 CHECKING RECENT QR CODE ACCESS (Last 500 lines)..." -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Gray

# Get recent logs
$recentLogs = heroku logs --app $APP_NAME -n 500

# Check for registration patterns
Write-Host ""
Write-Host "📊 ACCESS PATTERN ANALYSIS:" -ForegroundColor Yellow
Write-Host "----------------------------" -ForegroundColor Gray

$registrationAttempts = ($recentLogs | Select-String -Pattern "self-register|registration.*link|qr.*access" -CaseSensitive:$false).Count
$successfulRegistrations = ($recentLogs | Select-String -Pattern "registration.*success|user.*created|student.*created" -CaseSensitive:$false).Count
$failedRegistrations = ($recentLogs | Select-String -Pattern "registration.*fail|registration.*error|access.*denied" -CaseSensitive:$false).Count
$timeoutErrors = ($recentLogs | Select-String -Pattern "timeout|timed out|connection.*reset|ETIMEDOUT|ECONNRESET" -CaseSensitive:$false).Count
$rateLimit = ($recentLogs | Select-String -Pattern "rate.*limit|too.*many.*request|429|throttl" -CaseSensitive:$false).Count
$dbErrors = ($recentLogs | Select-String -Pattern "database.*error|knack.*error|API.*error|503|500" -CaseSensitive:$false).Count

Write-Host "  📱 Total Registration Attempts: $registrationAttempts" -ForegroundColor Cyan
Write-Host "  ✅ Successful Registrations: $successfulRegistrations" -ForegroundColor Green
Write-Host "  ❌ Failed Registrations: $failedRegistrations" -ForegroundColor Red
Write-Host "  ⏱️ Timeout Errors: $timeoutErrors" -ForegroundColor Yellow
Write-Host "  🚫 Rate Limit Hits: $rateLimit" -ForegroundColor Magenta
Write-Host "  🗄️ Database/API Errors: $dbErrors" -ForegroundColor Red

Write-Host ""
Write-Host "🚨 RECENT ERROR DETAILS:" -ForegroundColor Red
Write-Host "------------------------" -ForegroundColor Gray
$recentLogs | Select-String -Pattern "error|fail|timeout|denied|429|500|503" -CaseSensitive:$false | Select-Object -Last 10

Write-Host ""
Write-Host "👥 SIMULTANEOUS ACCESS CHECK:" -ForegroundColor Yellow
Write-Host "------------------------------" -ForegroundColor Gray

# Extract timestamps and count requests per minute
Write-Host "Analyzing access patterns in the last hour..." -ForegroundColor Cyan
$recentLogs | Select-String -Pattern "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}" | ForEach-Object {
    if ($_ -match "(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})") {
        $matches[1]
    }
} | Group-Object | Sort-Object Count -Descending | Select-Object -First 10 | ForEach-Object {
    $minute = $_.Name
    $count = $_.Count
    $bar = "*" * [Math]::Min($count, 50)
    Write-Host "$minute : $count requests $bar" -ForegroundColor $(if ($count -gt 20) {"Red"} elseif ($count -gt 10) {"Yellow"} else {"Green"})
}

Write-Host ""
Write-Host "🔥 BOTTLENECK ANALYSIS:" -ForegroundColor Red
Write-Host "------------------------" -ForegroundColor Gray

# Check for specific bottleneck patterns
$knackApiCalls = ($recentLogs | Select-String -Pattern "knack.*api|api.knack.com" -CaseSensitive:$false).Count
$emailProcessing = ($recentLogs | Select-String -Pattern "sendgrid|email.*send|welcome.*email" -CaseSensitive:$false).Count
$sessionIssues = ($recentLogs | Select-String -Pattern "session|cookie|auth.*token" -CaseSensitive:$false).Count

Write-Host "  🔗 Knack API Calls: $knackApiCalls" -ForegroundColor Cyan
Write-Host "  📧 Email Processing: $emailProcessing" -ForegroundColor Cyan
Write-Host "  🔐 Session/Auth Issues: $sessionIssues" -ForegroundColor Cyan

# Specific school filtering if provided
if ($SCHOOL_NAME) {
    Write-Host ""
    Write-Host "🏫 SCHOOL-SPECIFIC LOGS FOR: $SCHOOL_NAME" -ForegroundColor Yellow
    Write-Host "===========================================" -ForegroundColor Gray
    $recentLogs | Select-String -Pattern $SCHOOL_NAME -CaseSensitive:$false | Select-Object -Last 20
}

Write-Host ""
Write-Host "📡 STARTING REAL-TIME MONITORING..." -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop monitoring" -ForegroundColor Yellow
Write-Host ""
Write-Host "Watching for: QR access, registrations, errors, timeouts..." -ForegroundColor Cyan
Write-Host ""

# Color-coded live tail
heroku logs --app $APP_NAME --tail | ForEach-Object {
    $line = $_
    
    # Filter for relevant patterns
    if ($line -match "qr|registration|self-register|timeout|error|fail|429|rate.*limit|simultaneous|concurrent") {
        
        # Apply color coding based on severity
        if ($line -match "error|fail|timeout|denied|429|500|503") {
            Write-Host "❌ $line" -ForegroundColor Red
        } elseif ($line -match "warning|slow|delay") {
            Write-Host "⚠️ $line" -ForegroundColor Yellow
        } elseif ($line -match "success|created|complete") {
            Write-Host "✅ $line" -ForegroundColor Green
        } else {
            Write-Host "📊 $line" -ForegroundColor Cyan
        }
        
        # Highlight school-specific logs if filtering
        if ($SCHOOL_NAME -and $line -match $SCHOOL_NAME) {
            Write-Host "  >>> SCHOOL MATCH <<<" -ForegroundColor Magenta
        }
    }
}

