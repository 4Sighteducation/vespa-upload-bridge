#!/bin/bash

# Student CSV Email Investigation Script
# Run this to quickly check Heroku logs for email issues

echo "=================================================="
echo "STUDENT CSV WELCOME EMAIL INVESTIGATION"
echo "=================================================="
echo ""

# Check if heroku CLI is installed
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI not found. Please install it first."
    echo "   Download from: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

APP_NAME="vespa-upload-api"

echo "1️⃣  Checking last 100 lines for email-related errors..."
echo "=================================================="
heroku logs --app $APP_NAME -n 100 | grep -i "email\|mail\|sendgrid\|smtp" | tail -20
echo ""

echo "2️⃣  Checking for student upload processing..."
echo "=================================================="
heroku logs --app $APP_NAME -n 200 | grep -i "student.*process\|onboard" | tail -20
echo ""

echo "3️⃣  Comparing successful vs failed operations..."
echo "=================================================="
heroku logs --app $APP_NAME -n 200 | grep -E "(success.*email|fail.*email|error.*email|welcome)" | tail -20
echo ""

echo "4️⃣  Checking for any recent errors..."
echo "=================================================="
heroku logs --app $APP_NAME -n 100 | grep -i "error\|exception\|fail" | tail -20
echo ""

echo "5️⃣  Live tail of logs (press Ctrl+C to stop)..."
echo "=================================================="
echo "Watching for: student uploads and email sending..."
echo ""
heroku logs --app $APP_NAME --tail | grep -i "student\|email\|welcome"
