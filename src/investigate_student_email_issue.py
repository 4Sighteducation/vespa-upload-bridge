#!/usr/bin/env python3
"""
Investigation script for Student CSV Upload Welcome Email Issue
This script helps debug why welcome emails are not being sent for student CSV uploads
while they work for manual entry and staff CSV uploads.
"""

import os
import json
import requests
from datetime import datetime, timedelta
from dotenv import load_dotenv
import sys

# Load environment variables
load_dotenv()

# Configuration
KNACK_APP_ID = os.getenv('KNACK_APP_ID')
KNACK_API_KEY = os.getenv('KNACK_API_KEY')
API_BASE_URL = os.getenv('API_BASE_URL', 'https://vespa-upload-api-20ac5c3cf3e3.herokuapp.com/api/')

# Knack API headers
headers = {
    'X-Knack-Application-Id': KNACK_APP_ID,
    'X-Knack-REST-API-Key': KNACK_API_KEY,
    'Content-Type': 'application/json'
}

def check_recent_student_uploads():
    """Check recent student records to see if they have email sent flags"""
    print("\n" + "="*80)
    print("CHECKING RECENT STUDENT UPLOADS")
    print("="*80)
    
    # Get students created in last 24 hours
    yesterday = datetime.now() - timedelta(days=1)
    
    # Object 3 is Students
    url = f'https://api.knack.com/v1/objects/object_3/records'
    
    # Add filters for recently created records
    filters = {
        'match': 'and',
        'rules': [
            {
                'field': 'field_296',  # Created date field (adjust if needed)
                'operator': 'is after',
                'value': yesterday.strftime('%m/%d/%Y')
            }
        ]
    }
    
    params = {
        'filters': json.dumps(filters),
        'rows_per_page': 100
    }
    
    try:
        response = requests.get(url, headers=headers, params=params)
        data = response.json()
        
        print(f"\nFound {len(data.get('records', []))} students created in last 24 hours")
        
        # Analyze email status
        no_email_sent = []
        email_sent = []
        
        for student in data.get('records', []):
            # Check various email-related fields
            email = student.get('field_14', '')  # Student email
            welcome_sent = student.get('field_297', False)  # Welcome email sent flag (adjust field number)
            created_via = student.get('field_298', '')  # How record was created (CSV, Manual, etc.)
            
            student_info = {
                'name': f"{student.get('field_1', '')} {student.get('field_2', '')}",
                'email': email,
                'created_via': created_via,
                'created_date': student.get('field_296', ''),
                'id': student.get('id', '')
            }
            
            if not welcome_sent or not email:
                no_email_sent.append(student_info)
            else:
                email_sent.append(student_info)
        
        print(f"\n📧 Students WITH welcome emails sent: {len(email_sent)}")
        print(f"❌ Students WITHOUT welcome emails sent: {len(no_email_sent)}")
        
        if no_email_sent:
            print("\nStudents missing welcome emails:")
            for s in no_email_sent[:10]:  # Show first 10
                print(f"  - {s['name']} ({s['email']}) - Created via: {s['created_via']}")
        
        return no_email_sent, email_sent
        
    except Exception as e:
        print(f"Error checking student uploads: {str(e)}")
        return [], []

def compare_api_endpoints():
    """Compare the API endpoints for different upload methods"""
    print("\n" + "="*80)
    print("COMPARING API ENDPOINTS")
    print("="*80)
    
    endpoints = {
        'Student CSV': 'students/onboard/process',
        'Staff CSV': 'staff/process',
        'Student Manual': 'students/onboard/process',  # Same endpoint but with manualEntry flag
        'Staff Manual': 'staff/process'  # Same endpoint but with manualEntry flag
    }
    
    print("\nEndpoints being used:")
    for method, endpoint in endpoints.items():
        print(f"  {method:20} -> {endpoint}")
    
    print("\n⚠️  Note: Student CSV and Manual use the same endpoint")
    print("    The difference might be in the 'options' or 'context' parameters")

def check_api_logs():
    """Generate curl commands to check Heroku logs"""
    print("\n" + "="*80)
    print("HEROKU LOG INVESTIGATION COMMANDS")
    print("="*80)
    
    print("\n1. Check recent API logs for email errors:")
    print("   heroku logs --app vespa-upload-api --tail --source app")
    
    print("\n2. Search for student upload specific errors:")
    print("   heroku logs --app vespa-upload-api --source app | grep -i 'student.*email'")
    
    print("\n3. Check for email service errors:")
    print("   heroku logs --app vespa-upload-api --source app | grep -i 'sendgrid\\|email.*fail\\|smtp'")
    
    print("\n4. Compare successful vs failed email sends:")
    print("   heroku logs --app vespa-upload-api --source app | grep -E '(email.*sent|email.*fail|welcome.*email)'")
    
    print("\n5. Check for specific student processing errors:")
    print("   heroku logs --app vespa-upload-api --source app | grep -i 'onboard.*process'")

def test_email_sending():
    """Test if email sending works directly"""
    print("\n" + "="*80)
    print("TESTING EMAIL SENDING DIRECTLY")
    print("="*80)
    
    # Create test data for a single student
    test_student = {
        'Firstname': 'Test',
        'Lastname': 'Student',
        'Student Email': 'test@example.com',
        'Year Gp': '12',
        'Level': 'Level 3',
        'UPN': 'TEST123'
    }
    
    print("\nTest payload for manual student entry (working scenario):")
    manual_payload = {
        'csvData': [test_student],
        'options': {
            'sendNotifications': True,
            'notificationEmail': 'admin@example.com',
            'percentile': '75',
            'manualEntry': True  # This flag is present in manual entry
        },
        'context': {
            'userId': 'test_user_id',
            'userEmail': 'admin@example.com',
            'customerId': 'test_customer_id'
        }
    }
    
    print(json.dumps(manual_payload, indent=2))
    
    print("\n\nTest payload for CSV student upload (NOT working scenario):")
    csv_payload = {
        'csvData': [test_student],
        'options': {
            'sendNotifications': True,
            'notificationEmail': 'admin@example.com',
            'percentile': '75',
            'manualEntry': False  # This flag is false for CSV
        },
        'context': {
            'userId': 'test_user_id',
            'userEmail': 'admin@example.com',
            'customerId': 'test_customer_id'
        }
    }
    
    print(json.dumps(csv_payload, indent=2))
    
    print("\n⚠️  Key difference: 'manualEntry' flag")
    print("    Manual entry: manualEntry = true")
    print("    CSV upload: manualEntry = false")

def analyze_code_differences():
    """Analyze potential code differences in processing"""
    print("\n" + "="*80)
    print("CODE ANALYSIS SUGGESTIONS")
    print("="*80)
    
    print("\n1. Check the backend API code for conditional logic:")
    print("   - Look for: if (options.manualEntry) { ... }")
    print("   - Search for: sendWelcomeEmail or similar functions")
    print("   - Check if email sending is wrapped in a condition")
    
    print("\n2. Common issues to look for:")
    print("   a) Batch processing might skip emails for performance")
    print("   b) CSV processing might have a different email queue")
    print("   c) Email flag might not be set correctly for CSV uploads")
    print("   d) Async email processing might be failing silently")
    
    print("\n3. Check these backend files:")
    print("   - /routes/students.js or similar")
    print("   - /services/emailService.js")
    print("   - /controllers/studentController.js")
    print("   - /utils/knackSync.js")

def generate_debug_code():
    """Generate debug code to add to the frontend"""
    print("\n" + "="*80)
    print("FRONTEND DEBUG CODE")
    print("="*80)
    
    print("\nAdd this to your processUploadData function in index9u.js:")
    print("-" * 40)
    
    code = '''
// DEBUG: Log the exact payload being sent for student CSV
if (uploadType === 'students') {
    console.log('🔍 DEBUG: Student CSV Upload Payload:', {
        endpoint: endpoint,
        csvDataLength: csvData.length,
        options: options,
        context: uploaderContextForAPI,
        firstRecord: csvData[0]
    });
    
    // Check if sendNotifications is properly set
    console.log('📧 Email notifications enabled?', options.sendNotifications);
    console.log('📧 Notification email:', options.notificationEmail);
}

// After the API call, log the response
$.ajax({
    // ... existing ajax config ...
}).done(function(response) {
    // DEBUG: Log the response
    console.log('🔍 DEBUG: API Response for student CSV:', {
        success: response.success,
        message: response.message,
        emailsSent: response.emailsSent,  // If backend returns this
        errors: response.errors
    });
    
    // Check if response indicates emails were sent
    if (uploadType === 'students' && !response.emailsSent) {
        console.error('⚠️ WARNING: No emails were sent for student upload!');
    }
});
'''
    
    print(code)

def main():
    """Main investigation flow"""
    print("\n" + "🔍 STUDENT CSV WELCOME EMAIL INVESTIGATION TOOL 🔍")
    print("=" * 80)
    
    # Step 1: Check recent uploads
    no_email, with_email = check_recent_student_uploads()
    
    # Step 2: Compare endpoints
    compare_api_endpoints()
    
    # Step 3: Show log commands
    check_api_logs()
    
    # Step 4: Test email scenarios
    test_email_sending()
    
    # Step 5: Code analysis
    analyze_code_differences()
    
    # Step 6: Debug code
    generate_debug_code()
    
    print("\n" + "="*80)
    print("RECOMMENDED IMMEDIATE ACTIONS:")
    print("="*80)
    print("\n1. Run the Heroku log commands above to check for errors")
    print("2. Add the debug code to your frontend to see what's being sent")
    print("3. Check if the backend has conditional logic for manualEntry flag")
    print("4. Verify the email service (SendGrid) is working and not rate-limited")
    print("\n⚠️  MOST LIKELY CAUSE: The backend might have conditional logic that")
    print("    only sends emails when manualEntry=true or for small batch sizes")

if __name__ == "__main__":
    main()
