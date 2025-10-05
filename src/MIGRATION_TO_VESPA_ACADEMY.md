# Migrating Registration Form from GitHub Pages to vespa.academy

## Problem Identified
- Form hosted at: https://4sighteducation.github.io/vespa-upload-bridge/root/self-registration-form.html
- International schools (like Kellet) block GitHub domains
- UK schools haven't had this issue (less restrictive filtering)
- Solution: Host on vespa.academy

## How the Current Form Works

The self-registration form is a static HTML file that:
1. Takes URL parameters (id=linkId, v=version)
2. Makes API calls to: https://vespa-upload-api-52e3d8d66a70.herokuapp.com
3. Handles the registration process via JavaScript

## Migration Steps

### Step 1: Copy the Form Files
Copy these files to your vespa.academy hosting:
```
/vespa-upload-bridge/root/self-registration-form.html
/vespa-upload-bridge/root/staff-registration-form.html
/vespa-upload-bridge/root/auto-login-redirect.html
```

### Step 2: Update the API CORS Settings
In `vespa-upload-api/index.js`, add vespa.academy to allowed origins:

```javascript
const allowedOrigins = [
  'https://vespaacademy.knack.com',
  'https://vespa.academy',           // ADD THIS
  'https://www.vespa.academy',       // ADD THIS
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
  'https://4sighteducation.github.io',
  /^https:\/\/.*\.knack\.com$/
];
```

### Step 3: Deploy to vespa.academy
Host the form at:
- https://vespa.academy/registration/self-registration-form.html
- https://vespa.academy/registration/staff-registration-form.html

### Step 4: Update QR Code Generation
In the Knack app (index10d.js), when generating QR codes, use the new domain:

```javascript
// OLD:
const registrationUrl = `https://4sighteducation.github.io/vespa-upload-bridge/root/self-registration-form.html?id=${linkId}`;

// NEW:
const registrationUrl = `https://vespa.academy/registration/self-registration-form.html?id=${linkId}`;
```

## Why This Works

The form is **self-contained** - it only needs:
1. The HTML/CSS/JavaScript (all in one file)
2. Access to your API endpoint (which is already publicly accessible)
3. The link ID passed as a URL parameter

Everything else happens via API calls, so moving the hosting location doesn't break anything!

## Immediate Temporary Fix for Kellet

While you set up vespa.academy hosting, you can:
1. Send them the direct Knack URL (if one exists)
2. Have them use mobile data/VPN
3. Email them a simple HTML file they can open locally

## Benefits of vespa.academy Hosting

1. **Professional domain** - schools trust educational domains
2. **No firewall issues** - vespa.academy won't be blocked
3. **Better control** - you manage the hosting
4. **Faster updates** - no GitHub Pages build delay
5. **Custom analytics** - track usage on your own domain
