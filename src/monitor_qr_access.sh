#!/bin/bash
# QR Code Access Monitoring Script for Bash
# Emergency script to diagnose simultaneous access issues with student QR codes

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${RED}=================================================="
echo -e "${YELLOW}URGENT: QR CODE ACCESS MONITORING"
echo -e "${RED}=================================================="
echo ""

APP_NAME="vespa-upload-api"

# Check if heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo -e "${RED}❌ Heroku CLI not found. Please install it first."
    echo -e "${YELLOW}   Download from: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

echo -e "${GREEN}✓ Heroku CLI found"
echo ""

echo -e "${CYAN}🔍 CHECKING RECENT QR CODE ACCESS (Last 500 lines)..."
echo -e "=================================================="

# Get recent logs
LOGS=$(heroku logs --app $APP_NAME -n 500)

echo ""
echo -e "${YELLOW}📊 ACCESS PATTERN ANALYSIS:"
echo "----------------------------"

# Count various patterns
REGISTRATION_ATTEMPTS=$(echo "$LOGS" | grep -ciE "self-register|registration.*link|qr.*access")
SUCCESSFUL_REGISTRATIONS=$(echo "$LOGS" | grep -ciE "registration.*success|user.*created|student.*created")
FAILED_REGISTRATIONS=$(echo "$LOGS" | grep -ciE "registration.*fail|registration.*error|access.*denied")
TIMEOUT_ERRORS=$(echo "$LOGS" | grep -ciE "timeout|timed out|connection.*reset|ETIMEDOUT|ECONNRESET")
RATE_LIMITS=$(echo "$LOGS" | grep -ciE "rate.*limit|too.*many.*request|429|throttl")
DB_ERRORS=$(echo "$LOGS" | grep -ciE "database.*error|knack.*error|API.*error|503|500")

echo -e "  📱 Total Registration Attempts: ${CYAN}$REGISTRATION_ATTEMPTS${NC}"
echo -e "  ✅ Successful Registrations: ${GREEN}$SUCCESSFUL_REGISTRATIONS${NC}"
echo -e "  ❌ Failed Registrations: ${RED}$FAILED_REGISTRATIONS${NC}"
echo -e "  ⏱️  Timeout Errors: ${YELLOW}$TIMEOUT_ERRORS${NC}"
echo -e "  🚫 Rate Limit Hits: ${MAGENTA}$RATE_LIMITS${NC}"
echo -e "  🗄️  Database/API Errors: ${RED}$DB_ERRORS${NC}"

echo ""
echo -e "${RED}🚨 RECENT ERROR DETAILS:"
echo "------------------------"
echo "$LOGS" | grep -iE "error|fail|timeout|denied|429|500|503" | tail -10

echo ""
echo -e "${YELLOW}👥 SIMULTANEOUS ACCESS CHECK:"
echo "------------------------------"

echo -e "${CYAN}Analyzing access patterns by minute..."
# Extract timestamps and count per minute
echo "$LOGS" | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}" | sort | uniq -c | sort -rn | head -10 | while read count timestamp; do
    # Create a simple bar chart
    bar=""
    for ((i=0; i<count && i<50; i++)); do
        bar="${bar}*"
    done
    
    if [ $count -gt 20 ]; then
        echo -e "${RED}$timestamp : $count requests $bar${NC}"
    elif [ $count -gt 10 ]; then
        echo -e "${YELLOW}$timestamp : $count requests $bar${NC}"
    else
        echo -e "${GREEN}$timestamp : $count requests $bar${NC}"
    fi
done

echo ""
echo -e "${RED}🔥 BOTTLENECK ANALYSIS:"
echo "------------------------"

KNACK_API_CALLS=$(echo "$LOGS" | grep -ciE "knack.*api|api.knack.com")
EMAIL_PROCESSING=$(echo "$LOGS" | grep -ciE "sendgrid|email.*send|welcome.*email")
SESSION_ISSUES=$(echo "$LOGS" | grep -ciE "session|cookie|auth.*token")

echo -e "  🔗 Knack API Calls: ${CYAN}$KNACK_API_CALLS${NC}"
echo -e "  📧 Email Processing: ${CYAN}$EMAIL_PROCESSING${NC}"
echo -e "  🔐 Session/Auth Issues: ${CYAN}$SESSION_ISSUES${NC}"

echo ""
echo -e "${GREEN}📡 STARTING REAL-TIME MONITORING..."
echo "===================================="
echo -e "${YELLOW}Press Ctrl+C to stop monitoring"
echo ""
echo -e "${CYAN}Watching for: QR access, registrations, errors, timeouts..."
echo ""

# Color-coded live tail
heroku logs --app $APP_NAME --tail | while read line; do
    if echo "$line" | grep -qiE "qr|registration|self-register|timeout|error|fail|429|rate.*limit|simultaneous|concurrent"; then
        if echo "$line" | grep -qiE "error|fail|timeout|denied|429|500|503"; then
            echo -e "${RED}❌ $line${NC}"
        elif echo "$line" | grep -qiE "warning|slow|delay"; then
            echo -e "${YELLOW}⚠️  $line${NC}"
        elif echo "$line" | grep -qiE "success|created|complete"; then
            echo -e "${GREEN}✅ $line${NC}"
        else
            echo -e "${CYAN}📊 $line${NC}"
        fi
    fi
done

