# Focused Script to Find the Email Issue
# This script specifically looks for the manualEntry conditional problem

param(
    [int]$LogLines = 1000,
    [switch]$LiveTail = $false
)

Write-Host "`n🎯 TARGETED EMAIL ISSUE FINDER" -ForegroundColor Yellow
Write-Host "================================" -ForegroundColor Cyan

$APP_NAME = "vespa-upload-api"

# Function to colorize output
function Write-ColoredLog {
    param([string]$Line)
    
    if ($Line -match "error|fail|exception") {
        Write-Host $Line -ForegroundColor Red
    } elseif ($Line -match "email.*sent|welcome.*sent|success") {
        Write-Host $Line -ForegroundColor Green
    } elseif ($Line -match "manualEntry") {
        Write-Host $Line -ForegroundColor Yellow -BackgroundColor DarkGray
    } elseif ($Line -match "student.*onboard") {
        Write-Host $Line -ForegroundColor Cyan
    } else {
        Write-Host $Line
    }
}

Write-Host "`nFetching last $LogLines lines from Heroku..." -ForegroundColor Gray
$logs = heroku logs --app $APP_NAME -n $LogLines 2>$null

if (-not $logs) {
    Write-Host "❌ Could not fetch logs. Check Heroku access." -ForegroundColor Red
    exit 1
}

# STEP 1: Find student onboarding jobs
Write-Host "`n📋 STEP 1: Finding Student Onboarding Jobs" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray

$studentJobs = @()
foreach ($line in $logs) {
    if ($line -match "student.*onboard.*job|Job.*student.*onboard|processing.*student.*csv") {
        $studentJobs += $line
        Write-ColoredLog $line
    }
}

Write-Host "`nFound $($studentJobs.Count) student onboarding job references" -ForegroundColor Yellow

# STEP 2: Check for manualEntry flag usage
Write-Host "`n📋 STEP 2: Checking manualEntry Flag Usage" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray

$manualEntryTrue = 0
$manualEntryFalse = 0
$manualEntryUndefined = 0

foreach ($line in $logs) {
    if ($line -match "manualEntry.*true") {
        $manualEntryTrue++
        Write-Host "✓ manualEntry: true found" -ForegroundColor Green
    } elseif ($line -match "manualEntry.*false") {
        $manualEntryFalse++
        Write-Host "✗ manualEntry: false found" -ForegroundColor Red
    } elseif ($line -match "manualEntry.*undefined|manualEntry.*null") {
        $manualEntryUndefined++
        Write-Host "? manualEntry: undefined/null found" -ForegroundColor Yellow
    }
}

Write-Host "`nmanualEntry flag summary:" -ForegroundColor White
Write-Host "  True: $manualEntryTrue" -ForegroundColor Green
Write-Host "  False: $manualEntryFalse" -ForegroundColor Red
Write-Host "  Undefined: $manualEntryUndefined" -ForegroundColor Yellow

# STEP 3: Track email sending patterns
Write-Host "`n📋 STEP 3: Email Sending Patterns" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray

# Group logs by job/request
$emailPatterns = @{}
$currentJob = "unknown"

foreach ($line in $logs) {
    # Identify job/request
    if ($line -match "Job ([\w-]+)") {
        $currentJob = $Matches[1]
        if (-not $emailPatterns.ContainsKey($currentJob)) {
            $emailPatterns[$currentJob] = @{
                Type = ""
                ManualEntry = ""
                EmailSent = $false
            }
        }
    }
    
    # Track job type
    if ($line -match "student.*onboard") {
        $emailPatterns[$currentJob].Type = "StudentCSV"
    } elseif ($line -match "staff.*process") {
        $emailPatterns[$currentJob].Type = "StaffCSV"
    }
    
    # Track manualEntry flag
    if ($line -match "manualEntry.*true") {
        $emailPatterns[$currentJob].ManualEntry = "true"
    } elseif ($line -match "manualEntry.*false") {
        $emailPatterns[$currentJob].ManualEntry = "false"
    }
    
    # Track email sending
    if ($line -match "email.*sent|welcome.*sent|sending.*email") {
        $emailPatterns[$currentJob].EmailSent = $true
    }
}

# Display patterns
Write-Host "`nJob Analysis:" -ForegroundColor Yellow
foreach ($job in $emailPatterns.Keys | Select-Object -First 10) {
    $data = $emailPatterns[$job]
    if ($data.Type -eq "StudentCSV") {
        $color = if ($data.EmailSent) { "Green" } else { "Red" }
        Write-Host "  Job: $job" -ForegroundColor $color
        Write-Host "    Type: $($data.Type)" -ForegroundColor White
        Write-Host "    ManualEntry: $($data.ManualEntry)" -ForegroundColor $(if ($data.ManualEntry -eq "true") { "Green" } else { "Red" })
        Write-Host "    Email Sent: $($data.EmailSent)" -ForegroundColor $(if ($data.EmailSent) { "Green" } else { "Red" })
    }
}

# STEP 4: Find the smoking gun
Write-Host "`n🔍 STEP 4: Looking for the Smoking Gun" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray

# Look for conditional statements
$conditionals = $logs | Select-String "if.*manualEntry|!.*manualEntry|manualEntry.*&&|manualEntry.*\|\|"
if ($conditionals) {
    Write-Host "⚠️  FOUND CONDITIONAL LOGIC!" -ForegroundColor Red -BackgroundColor Yellow
    $conditionals | Select-Object -First 5 | ForEach-Object {
        Write-Host $_ -ForegroundColor Red
    }
}

# Look for email skip messages
$skipPatterns = $logs | Select-String "skip.*email|email.*skip|not.*send.*email|email.*disabled"
if ($skipPatterns) {
    Write-Host "`n⚠️  FOUND EMAIL SKIP PATTERNS!" -ForegroundColor Red
    $skipPatterns | Select-Object -First 5 | ForEach-Object {
        Write-Host $_ -ForegroundColor Red
    }
}

# FINAL DIAGNOSIS
Write-Host "`n🎯 FINAL DIAGNOSIS:" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray

if ($manualEntryFalse -gt 0 -and $manualEntryTrue -gt 0) {
    Write-Host "✓ System processes both manual and CSV uploads" -ForegroundColor Green
    
    $csvWithEmail = 0
    $csvWithoutEmail = 0
    foreach ($job in $emailPatterns.Keys) {
        $data = $emailPatterns[$job]
        if ($data.Type -eq "StudentCSV" -and $data.ManualEntry -eq "false") {
            if ($data.EmailSent) {
                $csvWithEmail++
            } else {
                $csvWithoutEmail++
            }
        }
    }
    
    if ($csvWithoutEmail -gt 0 -and $csvWithEmail -eq 0) {
        Write-Host "`n❌ PROBLEM CONFIRMED:" -ForegroundColor Red -BackgroundColor Yellow
        Write-Host "   Student CSV uploads (manualEntry=false) are NOT sending emails!" -ForegroundColor Red
        Write-Host "   Manual entries (manualEntry=true) ARE sending emails!" -ForegroundColor Green
        Write-Host "`n💡 ROOT CAUSE: The worker has conditional logic that only sends emails when manualEntry=true" -ForegroundColor Yellow
    }
}

# SOLUTION
Write-Host "`n💊 IMMEDIATE FIX:" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray
Write-Host "In index9u.js, find processUploadData function" -ForegroundColor Yellow
Write-Host "Change this line for student CSV uploads:" -ForegroundColor Yellow
Write-Host "  manualEntry: false" -ForegroundColor Red
Write-Host "To:" -ForegroundColor Yellow
Write-Host "  manualEntry: true" -ForegroundColor Green
Write-Host "`nThis will make CSV uploads behave like manual entries" -ForegroundColor White

Write-Host "`n🔧 PERMANENT FIX:" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Gray
Write-Host "In worker.js, find where emails are sent" -ForegroundColor Yellow
Write-Host "Remove any condition like:" -ForegroundColor Yellow
Write-Host "  if (options.manualEntry) { sendEmail() }" -ForegroundColor Red
Write-Host "Change to always send emails regardless of manualEntry flag" -ForegroundColor Green

if ($LiveTail) {
    Write-Host "`n👀 Starting live tail to monitor..." -ForegroundColor Cyan
    Write-Host "Press Ctrl+C to stop" -ForegroundColor Gray
    heroku logs --app $APP_NAME --tail | ForEach-Object {
        if ($_ -match "student.*onboard|email|manualEntry") {
            Write-ColoredLog $_
        }
    }
}
