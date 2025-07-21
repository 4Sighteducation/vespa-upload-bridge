/**
 * VESPA Upload Bridge - Configuration
 * 
 * This file contains global configuration variables, state management,
 * and initialization setup for the VESPA Upload System.
 */

// Global configuration variable - will be set by MultiAppLoader
let VESPA_UPLOAD_CONFIG = null;

// Constants
let API_BASE_URL = 'https://vespa-upload-api-07e11c285370.herokuapp.com/api'; // Default fallback
const DEBUG_MODE = true;
const CHECK_INTERVAL = 500; // Check every 500ms
const MAX_CHECKS = 20; // Give up after 10 seconds (20 checks)
const SUPER_USER_ROLE_ID = 'object_21';

// State management
let currentStep = 1;
let uploadType = null; // 'staff' or 'student'
let validationResults = null;
let processingResults = null;
let selectedSchool = null; // For super user mode
let isProcessing = false;
let activeModal = null; // Track the active modal
let selectedFile = null; // Store the selected file between steps
let userContext = null;
let selectedPercentile = 75; // Default percentile
let selectedPercentileName = '75th (Default & Recommended)'; // For display
let universalPassword = null; // For student universal password feature
let useUniversalPassword = false; // Flag to track if universal password is being used
let qrSchoolsData = []; // Store schools data for QR search functionality

/**
 * Helper function to get/set emulation state persistently
 */
function getEmulationState() {
  try {
    const stored = sessionStorage.getItem('vespa_emulation_state');
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    debugLog("Error reading emulation state", e, 'error');
    return null;
  }
}

function setEmulationState(state) {
  try {
    if (state) {
      sessionStorage.setItem('vespa_emulation_state', JSON.stringify(state));
    } else {
      sessionStorage.removeItem('vespa_emulation_state');
    }
    // Update the global selectedSchool variable
    if (state && state.school) {
      selectedSchool = {
        ...state.school,
        emulatedAdmins: state.admins
      };
    } else {
      selectedSchool = null;
    }
  } catch (e) {
    debugLog("Error saving emulation state", e, 'error');
  }
}

function clearEmulationState() {
  setEmulationState(null);
  selectedSchool = null;
  updateEmulationStatusBar();
}

/**
 * Update the emulation status bar visibility and content
 */
function updateEmulationStatusBar() {
  const statusBar = document.getElementById('emulation-status-bar');
  if (!statusBar) return;
  
  const emulationState = getEmulationState();
  
  if (emulationState && emulationState.school) {
    // Show the status bar with emulation info
    const adminEmailsList = emulationState.admins.map(admin => 
      `<span style="background: #fff; padding: 2px 8px; border-radius: 3px; margin-right: 5px;">${admin.email}</span>`
    ).join('');
    
    statusBar.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <strong>🏢 Emulation Mode Active:</strong> ${emulationState.school.name} | 
          <strong>Admin(s):</strong> 
          <span style="display: inline-flex; flex-wrap: wrap; gap: 5px;">
            ${adminEmailsList}
          </span>
        </div>
        <div style="display: flex; gap: 5px;">
          <button class="vespa-button secondary small-button" onclick="showEmulationSettingsModal()">⚙️ Settings</button>
          <button class="vespa-button secondary small-button" onclick="showChangeEmulationModal()">Change School</button>
          <button class="vespa-button secondary small-button" onclick="clearEmulationMode()">Exit Emulation</button>
        </div>
      </div>
    `;
    statusBar.style.display = 'block';
  } else {
    // Hide the status bar
    statusBar.style.display = 'none';
    statusBar.innerHTML = '';
  }
}

/**
 * Clear emulation mode and return to normal operation
 */
window.clearEmulationMode = function() {
  if (confirm('Are you sure you want to exit emulation mode?')) {
    clearEmulationState();
    showSuccess('Exited emulation mode');
    // Reset to step 1
    currentStep = 1;
    uploadType = null;
    renderStep(currentStep);
  }
}

/**
 * Show modal to change emulated school
 */
window.showChangeEmulationModal = function() {
  // Store current state
  const currentUploadType = uploadType;
  const currentValidationResults = validationResults;
  
  // Go back to school selection step
  currentStep = 2; // School selection step for super users
  renderStep(currentStep);
  
  // Restore state after render
  uploadType = currentUploadType;
  validationResults = currentValidationResults;
  
  // Scroll to top
  window.scrollTo(0, 0);
}

/**
 * Debug logging helper
 * @param {string} title - Log title
 * @param {any} data - Optional data to log
 * @param {string} level - Log level (info, warn, error, success)
 */
function debugLog(title, data, level = 'info') {
  if (!DEBUG_MODE) return;
  
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0]; // HH:MM:SS
  const colors = {
    info: 'color: #007bff; font-weight: bold',
    warn: 'color: #ff9800; font-weight: bold',
    error: 'color: #f44336; font-weight: bold',
    success: 'color: #4caf50; font-weight: bold'
  };
  
  console.log(`%c[VESPA Upload ${timestamp}] ${title}`, colors[level]);
  if (data !== undefined) {
    console.log(data);
  }
}

/**
 * Helper function to log API calls
 * @param {string} url - The API URL
 * @param {string} method - The HTTP method
 * @param {any} data - Request data (if any)
 */
function logApiCall(url, method, data) {
  debugLog(`API Call: ${method} ${url}`, data);
  return { url, method, data };
}

/**
 * Function to get the API URL - tries multiple sources
 * @returns {string} The determined API URL
 */
function determineApiUrl() {
  let apiUrl = 'https://vespa-upload-api-07e11c285370.herokuapp.com/api'; // Default with /api

  if (VESPA_UPLOAD_CONFIG && VESPA_UPLOAD_CONFIG.apiUrl) {
    debugLog("Using API URL from VESPA_UPLOAD_CONFIG", VESPA_UPLOAD_CONFIG.apiUrl);
    apiUrl = VESPA_UPLOAD_CONFIG.apiUrl;
  } else if (window.VESPA_UPLOAD_CONFIG && window.VESPA_UPLOAD_CONFIG.apiUrl) {
    debugLog("Using API URL from window.VESPA_UPLOAD_CONFIG", window.VESPA_UPLOAD_CONFIG.apiUrl);
    apiUrl = window.VESPA_UPLOAD_CONFIG.apiUrl;
  } else {
    debugLog("Using hardcoded default API URL", apiUrl);
  }

  // Ensure the apiUrl ends with /api or /api/
  if (!apiUrl.endsWith('/api') && !apiUrl.endsWith('/api/')) {
    if (apiUrl.endsWith('/')) {
      apiUrl += 'api';
    } else {
      apiUrl += '/api';
    }
    debugLog("Adjusted API URL to include /api suffix", apiUrl);
  }
  
  // Ensure it ends with a single slash if it has /api
  if (apiUrl.endsWith('/api')) {
      apiUrl += '/';
      debugLog("Ensured API URL ends with a slash after /api", apiUrl);
  }

  // Final check: remove any double slashes before /api if they occurred
  apiUrl = apiUrl.replace(/\/\/api\//g, '/api/');
  debugLog("Final API URL after normalization", apiUrl);
  return apiUrl;
}

/**
 * VESPA Upload Bridge - Utilities
 * 
 * This file contains utility functions for error handling, 
 * notifications, and other common operations.
 */

/**
 * Show an error message
 * @param {string} message - The error message
 */
function showError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.className = 'vespa-error';
  errorDiv.innerHTML = `
    <div class="vespa-error-icon">⚠️</div>
    <div class="vespa-error-message">${message}</div>
  `;
  
  const contentDiv = document.querySelector('.vespa-upload-content');
  if (contentDiv) {
    contentDiv.prepend(errorDiv);
    
    // Remove after 5 seconds
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  } else {
    console.error("[VESPA Upload] Could not find .vespa-upload-content to show error:", message);
  }
}

/**
 * Show a success message
 * @param {string} message - The success message
 */
function showSuccess(message) {
  const successDiv = document.createElement('div');
  successDiv.className = 'vespa-success';
  successDiv.innerHTML = `
    <div class="vespa-success-icon">✅</div>
    <div class="vespa-success-message">${message}</div>
  `;
  
  // Style the success message
  successDiv.style.cssText = `
    background: #d4edda;
    border-left: 4px solid #28a745;
    padding: 12px 16px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
  `;
  
  successDiv.querySelector('.vespa-success-icon').style.cssText = `
    margin-right: 12px;
    font-size: 20px;
  `;
  
  const contentDiv = document.querySelector('.vespa-upload-content');
  if (contentDiv) {
    contentDiv.prepend(successDiv);
    
    // Remove after 5 seconds
    setTimeout(() => {
      successDiv.remove();
    }, 5000);
  } else {
    // If we can't find the content div, try to show an alert instead
    alert(message);
  }
}

/**
 * Show a modal with the specified content
 * @param {string} title - The modal title
 * @param {string} content - The modal content HTML
 * @param {Function} onClose - Optional callback when modal is closed
 */
function showModal(title, content, onClose) {
  // Close any existing modals
  closeModal();
  
  // Create the modal elements
  const backdrop = document.createElement('div');
  backdrop.className = 'vespa-modal-backdrop';
  
  const modal = document.createElement('div');
  modal.className = 'vespa-modal';
  
  modal.innerHTML = `
    <div class="vespa-modal-header">
      <h2 class="vespa-modal-title">${title}</h2>
      <button class="vespa-modal-close">&times;</button>
    </div>
    <div class="vespa-modal-body">${content}</div>
  `;
  
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  
  // Add click handler to close button
  modal.querySelector('.vespa-modal-close').addEventListener('click', () => {
    closeModal();
    if (onClose && typeof onClose === 'function') {
      onClose();
    }
  });
  
  // Add click handler to backdrop (to close when clicking outside)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      closeModal();
      if (onClose && typeof onClose === 'function') {
        onClose();
      }
    }
  });
  
  // Add escape key handler
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      closeModal();
      if (onClose && typeof onClose === 'function') {
        onClose();
      }
    }
  };
  document.addEventListener('keydown', escHandler);
  
  // Store reference to the active modal
  activeModal = {
    element: backdrop,
    escHandler: escHandler
  };
  
  // Set focus to the modal for accessibility
  modal.setAttribute('tabindex', '-1');
  setTimeout(() => modal.focus(), 0);
  
  // Return the modal elements for potential further customization
  return { backdrop, modal };
}

/**
 * Close the currently active modal
 */
function closeModal() {
  if (activeModal) {
    document.body.removeChild(activeModal.element);
    document.removeEventListener('keydown', activeModal.escHandler);
    activeModal = null;
  }
}

/**
 * Add CSS styles to the page
 */
function addStyles() {
  // Create a style element
  const existingLink = document.getElementById('vespa-upload-styles');
  if (existingLink) {
    // Styles already added or being managed externally, perhaps by another version
    debugLog("VESPA Upload styles link already exists.", null, 'info');
    return;
  }

  const linkElement = document.createElement('link');
  linkElement.id = 'vespa-upload-styles';
  linkElement.rel = 'stylesheet';
  linkElement.type = 'text/css';
  linkElement.href = 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-upload-bridge@main/src/index6j.css';
  
  document.head.appendChild(linkElement);
  debugLog("Dynamically linked external CSS: " + linkElement.href, null, 'info');
  
  // Add inline styles for spinner if not in external CSS
  const spinnerStyle = document.createElement('style');
  spinnerStyle.id = 'vespa-spinner-styles';
  spinnerStyle.textContent = `
    @keyframes vespa-spinner-anim {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .vespa-spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #007bff;
      border-radius: 50%;
      animation: vespa-spinner-anim 1s linear infinite;
      margin: 0 auto;
    }
  `;
  document.head.appendChild(spinnerStyle);
}

/**
 * Validate the current step
 * @returns {boolean} Whether the step is valid
 */
function validateCurrentStep() {
  if (!VESPA_UPLOAD_CONFIG) {
    showError('Configuration not available. Please refresh the page and try again.');
    return false;
  }
  
  const isSuperUser = VESPA_UPLOAD_CONFIG.userRole === SUPER_USER_ROLE_ID; // <-- Modified
  
  switch (currentStep) {
    case 1: // Select upload type
      const mainUploadTypeSelection = document.querySelector('input[name="upload-type"]:checked');
      if (!mainUploadTypeSelection) {
        showError('Please select an upload type.');
        return false;
      }
      uploadType = mainUploadTypeSelection.value;

      if (uploadType === 'student-subjects') {
        const subTypeSelection = document.querySelector('input[name="student-subject-subtype"]:checked');
        if (!subTypeSelection) {
          showError('Please select a subject data type (KS4 or KS5).');
          return false;
        }
        uploadType = subTypeSelection.value; // Set the more granular type
      }
      
      // Check if upload method needs to be selected for staff/student uploads
      if (uploadType === 'staff' || uploadType === 'student-onboard') {
        const methodSelection = document.querySelector('input[name="upload-method"]:checked');
        if (!methodSelection) {
          showError('Please select an upload method (CSV or Manual Entry).');
          return false;
        }
        // Store the method in a global variable
        window.uploadMethod = methodSelection.value;
        debugLog("Upload method selected:", window.uploadMethod);
      }
      
      debugLog("Upload type selected:", uploadType);
      return true;
      
    case 2: // Select school (super user only) or Upload CSV
      if (isSuperUser) {
        if (!selectedSchool || !selectedSchool.id) {
          showError('Please select a school.');
          return false;
        }
      } else {
        // For regular users, step 2 is Upload CSV
        const fileInput = document.getElementById('csv-file');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
          showError('Please select a CSV file to upload.');
          return false;
        }
      }
      return true;
      
    case 3: // Upload CSV (super user) or Validate Data
      if (isSuperUser) {
        const fileInput = document.getElementById('csv-file');
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
          showError('Please select a CSV file to upload.');
          return false;
        }
      } else {
        // For regular users, step 3 is Validate Data
        // This would typically involve an API call to validate the data
        if (!validationResults) {
          showError('Please validate your data first.');
          return false;
        }
      }
      return true;
      
    default:
      return true;
  }
}

/**
 * Fetch user context information from Knack if available
 * @returns {Object} User context information
 */
async function fetchUserContext() {
  if (!VESPA_UPLOAD_CONFIG) {
    debugLog("No VESPA_UPLOAD_CONFIG available for user context", null, 'warn');
    return null;
  }

  try {
    // Wait a bit for Knack to be fully initialized
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Extract user information from Knack global object
    let context = {
      userId: null,
      userName: null,
      userEmail: null,
      userRole: VESPA_UPLOAD_CONFIG.userRole || null,
      schoolId: null, // This is the School ID Text, e.g., from field_126
      customerId: null // This is the VESPA Customer Record ID, e.g., from field_122
    };

    // Try to get user info from Knack
    if (typeof Knack !== 'undefined') {
      debugLog("Knack object found, attempting to get user info");
      
      // Method 1: Try getUserAttributes
      if (Knack.getUserAttributes && typeof Knack.getUserAttributes === 'function') {
        const userAttrs = Knack.getUserAttributes();
        debugLog("Raw user attributes from Knack.getUserAttributes():", userAttrs);
        
        if (userAttrs) {
          // Try multiple ways to get the user ID
          context.userId = userAttrs.id || userAttrs.user_id || userAttrs.userId;
          context.userName = userAttrs.name || userAttrs.user_name || userAttrs.userName;
          context.userEmail = userAttrs.email || userAttrs.user_email || userAttrs.userEmail;
          
          // Try to get the customer and school ID from custom fields if available
          if (userAttrs.values?.field_122_raw && userAttrs.values.field_122_raw.length > 0) {
              context.customerId = userAttrs.values.field_122_raw[0].id;
          }
          context.schoolId = userAttrs.values?.field_126 || null;
        }
      }
      
      // Method 2: Try Knack.user object
      if (!context.userId && Knack.user) {
        debugLog("Trying Knack.user object:", Knack.user);
        context.userId = Knack.user.id || Knack.user.user_id;
        context.userName = context.userName || Knack.user.name;
        context.userEmail = context.userEmail || Knack.user.email;
      }
      
      // Method 3: Try Knack.session if available
      if (!context.userId && Knack.session && Knack.session.user) {
        debugLog("Trying Knack.session.user:", Knack.session.user);
        context.userId = Knack.session.user.id;
        context.userName = context.userName || Knack.session.user.name;
        context.userEmail = context.userEmail || Knack.session.user.email;
      }
    } else {
      debugLog("Knack object not found", null, 'warn');
    }
    
    // If we still don't have a userId, this is a problem
    if (!context.userId) {
      debugLog("WARNING: Could not get user ID from any Knack source", {
        knackExists: typeof Knack !== 'undefined',
        knackUser: typeof Knack !== 'undefined' ? Knack.user : 'N/A',
        knackSession: typeof Knack !== 'undefined' ? Knack.session : 'N/A'
      }, 'error');
    }

    debugLog("Final user context:", context);
    return context;
  } catch (error) {
    debugLog("Error fetching user context", error, 'error');
    return null;
  }
}


/**
 * VESPA Upload Bridge - UI Core
 * 
 * This file contains core UI functions and initialization code
 * for the VESPA Upload System.
 */

/**
 * Main initialization function that will be called by the loader
 */
function initializeUploadBridge() {
  debugLog("VESPA Upload Bridge initializing...", null, 'info');
  
  // IMPORTANT: Debug user role immediately
  VESPA_UPLOAD_CONFIG = window.VESPA_UPLOAD_CONFIG;
  
  if (VESPA_UPLOAD_CONFIG) {
    debugLog("Configuration received:", VESPA_UPLOAD_CONFIG);
    debugLog(`User role detected: ${VESPA_UPLOAD_CONFIG.userRole}`, null, 'info');
    debugLog(`Is Super User: ${VESPA_UPLOAD_CONFIG.userRole === SUPER_USER_ROLE_ID}`, null, 'info');
  } else {
    debugLog("No configuration available yet!", null, 'warn');
  }
  
  // Set the API URL based on config or fallback
  API_BASE_URL = determineApiUrl();
  // Fetch user context information with retry
  const fetchUserContextWithRetry = async (retries = 3) => {
    for (let i = 0; i < retries; i++) {
      const context = await fetchUserContext();
      if (context && context.userId) {
        return context;
      }
      debugLog(`User context fetch attempt ${i + 1} failed, retrying...`, null, 'warn');
      await new Promise(resolve => setTimeout(resolve, 500 * (i + 1))); // Exponential backoff
    }
    return null;
  };
  
  // Make fetchUserContextWithRetry available globally for modules
  window.fetchUserContext = fetchUserContext;
  window.fetchUserContextWithRetry = fetchUserContextWithRetry;
  
  fetchUserContextWithRetry().then(context => {
    userContext = context;
    debugLog("User context set:", userContext);
    
    // Check for existing emulation state
    const emulationState = getEmulationState();
    if (emulationState && emulationState.school) {
      debugLog("Restoring emulation state from session storage", emulationState);
      selectedSchool = {
        ...emulationState.school,
        emulatedAdmins: emulationState.admins
      };
      updateEmulationStatusBar();
    }
    
    if (!context || !context.userId) {
      debugLog("ERROR: Failed to get user context after retries", null, 'error');
      showError('Unable to load user information. Please refresh the page and try again.');
    }
    
    // Enable/disable self-registration button based on context
    const selfRegBtn = document.getElementById('self-registration-button');
    if (selfRegBtn) {
      const isSuperUser = VESPA_UPLOAD_CONFIG && VESPA_UPLOAD_CONFIG.userRole === SUPER_USER_ROLE_ID;
      debugLog("Checking self-registration button context", { 
        context, 
        hasCustomerId: context?.customerId,
        isSuperUser: isSuperUser
      }, 'info');
      
      // For Super Users, always enable the button (they select school in the modal)
      // For regular users, they need a customerId
      if (!context || (!isSuperUser && !context.customerId)) {
        selfRegBtn.disabled = true;
        selfRegBtn.title = 'User context not available - please refresh the page';
        debugLog("Self-registration button disabled - no context/customerId", null, 'warn');
      } else {
        selfRegBtn.disabled = false;
        selfRegBtn.title = 'Generate a link for students to self-register';
        debugLog("Self-registration button enabled", null, 'info');
      }
    }
  }).catch(error => {
    debugLog("Failed to fetch user context:", error, 'error');
    showError('Unable to load user information. Please refresh the page and try again.');
  });
  debugLog("Using API URL:", API_BASE_URL);
  
  // Test API connectivity immediately and show detailed response
  fetch(API_BASE_URL)
    .then(response => {
      debugLog(`API test connection status: ${response.status} ${response.statusText}`);
      if (response.ok) {
        return response.json();
      }
      throw new Error(`API responded with status: ${response.status}`);
    })
    .then(data => {
      debugLog("API connection successful:", data, 'success');
      // Display API endpoints for debugging
      if (data && data.endpoints) {
        debugLog("Available API endpoints:", data.endpoints);
      }
    })
    .catch(error => {
      debugLog("API connection failed:", error, 'error');
    });
  
  // Add CSS styles
  addStyles();
  
  // Add a visual indicator that the script is loaded
  addDebugIndicator();
  
  // If we already have config, initialize immediately
  if (VESPA_UPLOAD_CONFIG) {
    const uploadContainer = document.querySelector(VESPA_UPLOAD_CONFIG.elementSelector);
    if (uploadContainer) {
      debugLog("Upload container found immediately", { 
        selector: VESPA_UPLOAD_CONFIG.elementSelector
      });
      initializeUploadInterface(uploadContainer);
      return;
    }
  }
  
  // Otherwise start polling for the container
  startPolling();
}

/**
 * Poll for the necessary DOM elements
 */
function startPolling() {
  debugLog("Starting to poll for upload container...");
  let checkCount = 0;
  
  const checkInterval = setInterval(function() {
    // Always try to get the latest config in case it was set after initialization
    if (!VESPA_UPLOAD_CONFIG) {
      VESPA_UPLOAD_CONFIG = window.VESPA_UPLOAD_CONFIG;
      if (VESPA_UPLOAD_CONFIG) {
        debugLog("Configuration found during polling", VESPA_UPLOAD_CONFIG);
      } else {
        debugLog("No configuration available yet");
      }
    }
    
    // Check if we have config and if the container exists
    if (VESPA_UPLOAD_CONFIG) {
      const uploadContainer = document.querySelector(VESPA_UPLOAD_CONFIG.elementSelector);
      if (uploadContainer) {
        // Element found, clear the interval
        clearInterval(checkInterval);
        debugLog("Upload container found", { 
          selector: VESPA_UPLOAD_CONFIG.elementSelector
        });
        
        // Initialize the upload interface
        initializeUploadInterface(uploadContainer);
        return;
      }
    }
    
    // Increment counter and check if we've reached max attempts
    checkCount++;
    if (checkCount >= MAX_CHECKS) {
      clearInterval(checkInterval);
      console.error("[VESPA Upload] No configuration received after maximum attempts");
    }
  }, CHECK_INTERVAL);
}

/**
 * Initialize the upload interface
 * @param {HTMLElement} container - The container element
 */
function initializeUploadInterface(container) {
  // Safety check for config
  if (!VESPA_UPLOAD_CONFIG) {
    console.error("[VESPA Upload] Cannot initialize interface without configuration");
    return;
  }
  
  // Determine if the user is a super user (needs school selection)
  const isSuperUser = VESPA_UPLOAD_CONFIG.userRole === SUPER_USER_ROLE_ID;
  
  // Create the wizard container
  const wizardHTML = `
    <div id="vespa-upload-wizard" class="vespa-upload-wizard">
      <div id="emulation-status-bar" style="display: none; background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin-bottom: 10px; border-radius: 4px;"></div>
      <div class="vespa-upload-header">
        <h1>VESPA Data Upload</h1>
        <p>Upload staff and student data to your VESPA account</p>
        <div class="vespa-header-actions">
          <button id="select-percentile-button" class="vespa-button secondary small-button">Target: ${selectedPercentileName}</button>
          <button id="universal-password-button" class="vespa-button secondary small-button" style="display: none;">Set Universal Password</button>
          ${isSuperUser ? `
            <button id="self-registration-button" class="vespa-button secondary small-button">📱 Generate Student QR Code</button>
            <button id="header-emulation-button" class="vespa-button secondary small-button">🏢 Emulation Settings</button>
          ` : ''}
        </div>
      </div>
      
      <div class="vespa-upload-steps">
        <div class="vespa-step active" data-step="1">
          <div class="vespa-step-number">1</div>
          <div class="vespa-step-title">Select Upload Type</div>
        </div>
        ${isSuperUser ? `
        <div class="vespa-step" data-step="2">
          <div class="vespa-step-number">2</div>
          <div class="vespa-step-title">Select School</div>
        </div>
        ` : ''}
        <div class="vespa-step" data-step="${isSuperUser ? 3 : 2}">
          <div class="vespa-step-number">${isSuperUser ? 3 : 2}</div>
          <div class="vespa-step-title">Upload CSV</div>
        </div>
        <div class="vespa-step" data-step="${isSuperUser ? 4 : 3}">
          <div class="vespa-step-number">${isSuperUser ? 4 : 3}</div>
          <div class="vespa-step-title">Validate Data</div>
        </div>
        <div class="vespa-step" data-step="${isSuperUser ? 5 : 4}">
          <div class="vespa-step-number">${isSuperUser ? 5 : 4}</div>
          <div class="vespa-step-title">Process Upload</div>
        </div>
        <div class="vespa-step" data-step="${isSuperUser ? 6 : 5}">
          <div class="vespa-step-number">${isSuperUser ? 6 : 5}</div>
          <div class="vespa-step-title">Results</div>
        </div>
      </div>
      
      <div class="vespa-upload-content">
        <!-- Content will be dynamically generated based on current step -->
      </div>
      
      <div class="vespa-upload-actions">
        <button id="vespa-prev-button" class="vespa-button secondary" style="display: none;">Previous</button>
        <button id="vespa-next-button" class="vespa-button primary">Next</button>
      </div>
    </div>
  `;
  
  // Add the wizard HTML to the container
  container.innerHTML = wizardHTML;
  
  // Set up event listeners
  document.getElementById('vespa-prev-button').addEventListener('click', prevStep);
  document.getElementById('vespa-next-button').addEventListener('click', nextStep);
  document.getElementById('select-percentile-button').addEventListener('click', showPercentileModal);
  document.getElementById('universal-password-button').addEventListener('click', showUniversalPasswordModal);
  
  // Add super user only buttons
  if (isSuperUser) {
    debugLog("Super user detected, looking for self-registration button", null, 'info');
    
    // Debug: Check if buttons exist in DOM
    const allButtons = document.querySelectorAll('.vespa-button');
    debugLog(`Found ${allButtons.length} buttons with class 'vespa-button'`, null, 'info');
    
    const selfRegBtn = document.getElementById('self-registration-button');
    if (selfRegBtn) {
      debugLog("Self-registration button found in DOM", {
        id: selfRegBtn.id,
        className: selfRegBtn.className,
        textContent: selfRegBtn.textContent,
        disabled: selfRegBtn.disabled,
        style: selfRegBtn.style.cssText
      }, 'info');
      
      // Add a visual indicator that the button is ready
      selfRegBtn.style.border = '2px solid #007bff';
      
      debugLog("Attaching click handler to self-registration button", null, 'info');
      selfRegBtn.addEventListener('click', function(e) {
        debugLog("Self-registration button clicked", null, 'info');
        e.preventDefault();
        e.stopPropagation();
        
        try {
          if (typeof showSelfRegistrationModal === 'function') {
            showSelfRegistrationModal();
          } else if (typeof window.showSelfRegistrationModal === 'function') {
            window.showSelfRegistrationModal();
          } else {
            debugLog("showSelfRegistrationModal function not found!", null, 'error');
            showError('Unable to open registration modal. Please refresh the page and try again.');
          }
        } catch (error) {
          debugLog("Error calling showSelfRegistrationModal:", error, 'error');
          showError('An error occurred. Please try again.');
        }
      });
    } else {
      debugLog("Self-registration button not found in DOM", null, 'error');
    }
    
    const emulationBtn = document.getElementById('header-emulation-button');
    if (emulationBtn) {
      debugLog("Attaching click handler to emulation button", null, 'info');
      emulationBtn.addEventListener('click', function(e) {
        debugLog("Emulation button clicked", null, 'info');
        e.preventDefault();
        showEmulationSettingsModal();
      });
    }
  }
  
  // Render the first step
  renderStep(currentStep);
  
  // Check and restore emulation state after the interface is created
  const emulationState = getEmulationState();
  if (emulationState && emulationState.school) {
    debugLog("Restoring emulation status bar from saved state", emulationState);
    updateEmulationStatusBar();
  }
  
  // Auto-load renewal module for super users - DISABLED due to conflicts
  // The renewal module is causing errors when auto-loading
  // Users can still access it via the menu option
  /*
  if (isSuperUser) {
    debugLog("Auto-loading renewal module for super user", null, 'info');
    // Load the renewal module asynchronously without blocking
    loadRenewalModule().catch(error => {
      debugLog('Failed to auto-load renewal module:', error, 'error');
      // Don't show error to user, just log it
    });
  }
  */
}

/**
 * Add an enhanced debug indicator to the page
 */
function addDebugIndicator() {
  const indicator = document.createElement('div');
  indicator.id = 'vespa-upload-debug-indicator';
  indicator.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    background-color: #007bff;
    color: white;
    padding: 5px 10px;
    border-radius: 5px;
    font-size: 12px;
    font-family: monospace;
    z-index: 9999;
    opacity: 0.8;
    cursor: pointer;
    display: flex;
    align-items: center;
  `;
  
  // Add a dot status indicator
  const statusDot = document.createElement('span');
  statusDot.style.cssText = `
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: #4caf50;
    margin-right: 6px;
    display: inline-block;
  `;
  indicator.appendChild(statusDot);
  
  // Add text
  const text = document.createElement('span');
  text.textContent = 'Upload Bridge Loaded';
  indicator.appendChild(text);
  
  // Enhanced click behavior - now shows a detailed debug panel
  indicator.addEventListener('click', function() {
    // Check if debug panel already exists
    let debugPanel = document.getElementById('vespa-debug-panel');
    
    if (debugPanel) {
      // If panel exists, toggle visibility
      debugPanel.style.display = debugPanel.style.display === 'none' ? 'block' : 'none';
    } else {
      // Create debug panel
      debugPanel = document.createElement('div');
      debugPanel.id = 'vespa-debug-panel';
      debugPanel.style.cssText = `
        position: fixed;
        bottom: 50px;
        right: 10px;
        background-color: #fff;
        border: 1px solid #ddd;
        border-radius: 5px;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
        padding: 15px;
        width: 350px;
        max-height: 500px;
        overflow-y: auto;
        z-index: 9998;
        font-family: monospace;
        font-size: 12px;
      `;
      
      // Populate debug info
      const apiStatus = document.createElement('div');
      apiStatus.innerHTML = `<strong>API URL:</strong> ${API_BASE_URL}`;
      apiStatus.style.marginBottom = '10px';
      debugPanel.appendChild(apiStatus);
      
      // Add API test button
      const testApiButton = document.createElement('button');
      testApiButton.textContent = 'Test API Connection';
      testApiButton.style.cssText = `
        background: #f0f0f0;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 5px 10px;
        margin-bottom: 10px;
        cursor: pointer;
        font-size: 12px;
      `;
      testApiButton.addEventListener('click', function() {
        const apiStatusResult = document.getElementById('api-status-result');
        apiStatusResult.textContent = 'Testing connection...';
        
        fetch(API_BASE_URL)
          .then(response => {
            if (response.ok) {
              return response.json();
            }
            throw new Error(`API responded with status: ${response.status}`);
          })
          .then(data => {
            apiStatusResult.innerHTML = `
              <span style="color:#4caf50">✓ API is online</span><br>
              <pre>${JSON.stringify(data, null, 2)}</pre>
            `;
          })
          .catch(error => {
            apiStatusResult.innerHTML = `
              <span style="color:#f44336">✗ API connection failed</span><br>
              <pre style="color:#f44336">${error.message}</pre>
            `;
          });
      });
      debugPanel.appendChild(testApiButton);
      
      // Add API status result container
      const apiStatusResult = document.createElement('div');
      apiStatusResult.id = 'api-status-result';
      apiStatusResult.style.cssText = `
        background: #f8f9fa;
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 10px;
        font-size: 11px;
      `;
      debugPanel.appendChild(apiStatusResult);
      
      // Configuration details
      const configDetails = document.createElement('div');
      configDetails.innerHTML = `<strong>Configuration:</strong>`;
      
      if (VESPA_UPLOAD_CONFIG) {
        const configList = document.createElement('ul');
        configList.style.paddingLeft = '20px';
        configList.style.margin = '5px 0';
        
        for (const key in VESPA_UPLOAD_CONFIG) {
          const item = document.createElement('li');
          item.textContent = `${key}: ${JSON.stringify(VESPA_UPLOAD_CONFIG[key])}`;
          configList.appendChild(item);
        }
        
        configDetails.appendChild(configList);
      } else {
        configDetails.innerHTML += `<div style="color:#f44336">No configuration available</div>`;
    }
      
      debugPanel.appendChild(configDetails);
      
      // User context information
      if (userContext) {
      const contextInfo = document.createElement('div');
      contextInfo.innerHTML = `<strong>User Context:</strong>`;
      const contextList = document.createElement('ul');
      contextList.style.paddingLeft = '20px';
      contextList.style.margin = '5px 0';
  
      for (const key in userContext) {
      const item = document.createElement('li');
      item.textContent = `${key}: ${userContext[key] || 'N/A'}`;
      contextList.appendChild(item);
    }
  
  contextInfo.appendChild(contextList);
  debugPanel.appendChild(contextInfo);
}

      // State information
      const stateInfo = document.createElement('div');
      stateInfo.innerHTML = `
        <strong>Current State:</strong>
        <ul style="padding-left: 20px; margin: 5px 0">
          <li>Step: ${currentStep}</li>
          <li>Upload Type: ${uploadType || 'Not selected'}</li>
          <li>Selected School: ${selectedSchool || 'N/A'}</li>
          <li>Is Processing: ${isProcessing}</li>
        </ul>
      `;
      debugPanel.appendChild(stateInfo);
      
      // Add close button
      const closeButton = document.createElement('button');
      closeButton.textContent = 'Close';
      closeButton.style.cssText = `
        background: #f8f9fa;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 5px 10px;
        margin-top: 10px;
        cursor: pointer;
        font-size: 12px;
        float: right;
      `;
      closeButton.addEventListener('click', function(e) {
        e.stopPropagation();
        debugPanel.style.display = 'none';
      });
      debugPanel.appendChild(closeButton);
      
      document.body.appendChild(debugPanel);
    }
    
    // Log to console as well
    debugLog("Debug panel opened", {
      'uploadContainer': VESPA_UPLOAD_CONFIG && document.querySelector(VESPA_UPLOAD_CONFIG.elementSelector) ? 'Found' : 'Not found',
      'config': VESPA_UPLOAD_CONFIG,
      'currentStep': currentStep,
      'uploadType': uploadType,
      'API_BASE_URL': API_BASE_URL
    });
  });
  
  document.body.appendChild(indicator);
}

/**
 * Render the current step
 * @param {number} step - The step number to render
 */
function renderStep(step) {
  if (!VESPA_UPLOAD_CONFIG) {
    console.error("[VESPA Upload] Cannot render step without configuration");
    debugLog("Cannot render step without configuration", null, 'error');
    return;
  }
// Debug step rendering (PART 6 - Add this block right here)
const isSuperUser = VESPA_UPLOAD_CONFIG.userRole === SUPER_USER_ROLE_ID; // <-- Modified
debugLog(`Rendering step ${step}, User is SuperUser: ${isSuperUser}`, {
  currentStep: step,
  uploadType: uploadType,
  isSuperUser: isSuperUser
});

  // Update step indicators
  document.querySelectorAll('.vespa-step').forEach(stepElem => {
    stepElem.classList.remove('active', 'completed');
    
    const stepNum = parseInt(stepElem.dataset.step);
    if (stepNum === step) {
      stepElem.classList.add('active');
    } else if (stepNum < step) {
      stepElem.classList.add('completed');
    }

  });

  // Show/hide universal password button based on upload type
  const universalPasswordBtn = document.getElementById('universal-password-button');
  if (universalPasswordBtn) {
    if (uploadType && (uploadType === 'student-onboard' || uploadType === 'student-ks4' || uploadType === 'student-ks5')) {
      universalPasswordBtn.style.display = 'inline-block';
    } else {
      universalPasswordBtn.style.display = 'none';
    }
  }

  setTimeout(() => {
    debugLog("Binding events after render");
    bindStepEvents();
  }, 50);
  // Update buttons
  const prevButton = document.getElementById('vespa-prev-button');
  const nextButton = document.getElementById('vespa-next-button');
  
  if (prevButton) prevButton.style.display = step > 1 ? 'block' : 'none';
  
  const maxSteps = isSuperUser ? 6 : 5;
  
  if (nextButton) {
    // Hide next button for manual entry on the entry step
    if (window.uploadMethod === 'manual' && 
        ((isSuperUser && step === 3) || (!isSuperUser && step === 2))) {
      nextButton.style.display = 'none';
    } else if (step === maxSteps) {
      nextButton.style.display = 'none';
    } else {
      nextButton.style.display = 'block';
      
      // Update button text based on step
      if ((isSuperUser && step === 4) || (!isSuperUser && step === 3)) {
        nextButton.textContent = 'Validate';
      } else if ((isSuperUser && step === 5) || (!isSuperUser && step === 4)) {
        nextButton.textContent = 'Process';
      } else {
        nextButton.textContent = 'Next';
      }
    }
  }
  
  // Render step content
  const contentDiv = document.querySelector('.vespa-upload-content');
  if (!contentDiv) {
    console.error("[VESPA Upload] Could not find .vespa-upload-content to render step");
    return;
  }
  
  contentDiv.innerHTML = '';
  
  // Determine actual step based on user role
  let contentStep = step;
  if (!isSuperUser && step > 1) {
    // For regular users, we skip the school selection step
    contentStep++;
  }
  
  switch (contentStep) {
    case 1:
      contentDiv.innerHTML = renderSelectTypeStep();
      break;
    case 2:
      contentDiv.innerHTML = renderSelectSchoolStep();
      break;
    case 3:
      contentDiv.innerHTML = renderUploadCsvStep();
      // After content is rendered, bind event listeners directly
      setTimeout(() => {
        const downloadBtn = document.getElementById('download-template');
        if (downloadBtn) {
          downloadBtn.addEventListener('click', function() {
            downloadTemplateFile();
          });
        }
        
        const fileInput = document.getElementById('csv-file');
        if (fileInput) {
          fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                selectedFile = file;  // <- Add this line
              const fileNameElement = document.createElement('div');
              fileNameElement.className = 'vespa-file-selected';
              fileNameElement.innerHTML = '<strong>Selected file:</strong> ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
              fileNameElement.style.marginTop = '10px';
              fileNameElement.style.padding = '8px';
              fileNameElement.style.backgroundColor = '#f0f7ff';
              fileNameElement.style.borderRadius = '4px';
              
              // Replace existing notification or add new one
              const existingNotification = document.querySelector('.vespa-file-selected');
              if (existingNotification) {
                existingNotification.parentNode.replaceChild(fileNameElement, existingNotification);
              } else {
                document.querySelector('.vespa-file-input').after(fileNameElement);
              }
              
              console.log('[VESPA Upload] File selected:', file.name, file.size);
            }
          });
        }
      }, 100);
      break;
    case 4:
      contentDiv.innerHTML = renderValidationStep();
      break;
    case 5:
      contentDiv.innerHTML = renderProcessingStep();
      break;
    case 6:
      contentDiv.innerHTML = renderResultsStep();
      setTimeout(() => {
        const downloadResultsBtn = document.getElementById('download-results');
        if (downloadResultsBtn) {
          downloadResultsBtn.addEventListener('click', function() {
            alert('Results download functionality will be implemented here');
          });
        }
        
        const newUploadBtn = document.getElementById('start-new-upload');
        if (newUploadBtn) {
          newUploadBtn.addEventListener('click', function() {
            // Clear emulation state if not a super user
            if (VESPA_UPLOAD_CONFIG.userRole !== SUPER_USER_ROLE_ID) {
              clearEmulationState();
            }
            
            // Reset the wizard and go back to step 1
            currentStep = 1;
            uploadType = null;
            validationResults = null;
            processingResults = null;
            selectedSchool = null;
            isProcessing = false;
            universalPassword = null;
            useUniversalPassword = false;
            
            // Reset universal password button
            const universalPwdBtn = document.getElementById('universal-password-button');
            if (universalPwdBtn) {
              universalPwdBtn.textContent = 'Set Universal Password';
              universalPwdBtn.style.backgroundColor = '';
              universalPwdBtn.style.borderColor = '';
              universalPwdBtn.style.color = '';
            }
            
            renderStep(1);
          });
        }
      }, 100);
      break;
  }
}

/**
 * VESPA Upload Bridge - UI Steps Rendering
 * 
 * This file contains functions for rendering each step of the wizard interface.
 */

/**
 * Render the select upload type step
 * @returns {string} HTML for the step
 */
function renderSelectTypeStep() {
    // Check if we need to verify staff existence
    checkStaffExistence();
    
    // Check if user is a Super User
    const isSuperUser = VESPA_UPLOAD_CONFIG && VESPA_UPLOAD_CONFIG.userRole === SUPER_USER_ROLE_ID;
    
    return `
      <h2>VESPA Data Upload System</h2>
      
      ${isSuperUser ? `
      <div class="vespa-stage-container" style="margin-bottom: 30px; padding: 20px; background: #fff3cd; border-radius: 8px; border: 2px solid #ffc107;">
        <h3 style="color: #856404; margin-bottom: 15px;">🏢 Super User: Customer Account Management</h3>
        <p style="margin-bottom: 15px;">Create new VESPA Customer accounts or manage renewals.</p>
        
        <div class="vespa-upload-options">
          <div class="vespa-upload-option">
            <input type="radio" id="create-new-customer" name="upload-type" value="new-customer">
            <label for="create-new-customer">
              <div class="vespa-option-icon">🆕</div>
              <div class="vespa-option-title">Create New Customer Account</div>
              <div class="vespa-option-description">Set up a new school/organization with VESPA</div>
            </label>
          </div>
          
          <div class="vespa-upload-option">
            <input type="radio" id="renew-customer" name="upload-type" value="renew-customer">
            <label for="renew-customer">
              <div class="vespa-option-icon">🔄</div>
              <div class="vespa-option-title">Generate Renewal Invoice</div>
              <div class="vespa-option-description">Generate and manage renewals</div>
            </label>
          </div>
        </div>
      </div>
      ` : ''}
      
      <div class="vespa-stage-container" style="margin-bottom: 30px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
        <h3 style="color: #0056b3; margin-bottom: 15px;">📋 Stage 1: Account Generation (Required)</h3>
        <p style="margin-bottom: 15px;">You must create accounts before uploading any academic data.</p>
        
        <div class="vespa-upload-options">
          <div class="vespa-upload-option">
            <input type="radio" id="upload-staff" name="upload-type" value="staff">
            <label for="upload-staff">
              <div class="vespa-option-icon">👥</div>
              <div class="vespa-option-title">A) Staff Accounts</div>
              <div class="vespa-option-description">Upload staff accounts first - tutors, teachers, heads of year</div>
              <div id="staff-status" class="vespa-status-badge" style="display: none;"></div>
            </label>
          </div>
          
          <div class="vespa-upload-option" id="student-upload-option">
            <input type="radio" id="upload-student-onboard" name="upload-type" value="student-onboard">
            <label for="upload-student-onboard">
              <div class="vespa-option-icon">🎓</div>
              <div class="vespa-option-title">B) Student Accounts</div>
              <div class="vespa-option-description">Create student accounts (requires staff to exist)</div>
              <div id="student-disabled-message" class="vespa-disabled-message" style="display: none; color: #dc3545; margin-top: 5px;">
                ⚠️ Staff accounts must be created first
              </div>
            </label>
          </div>
        </div>
        
        <!-- Manual Entry Option -->
        <div class="vespa-upload-sub-options" style="display: none; margin-top: 20px;" id="upload-method-container">
          <h4 style="margin-bottom: 10px;">Select Upload Method:</h4>
          <div class="vespa-upload-options">
            <div class="vespa-upload-option sub-option">
              <input type="radio" id="method-csv" name="upload-method" value="csv" checked>
              <label for="method-csv">
                <div class="vespa-option-icon">📁</div>
                <div class="vespa-option-title">CSV Upload</div>
                <div class="vespa-option-description">Upload multiple records via CSV file</div>
              </label>
            </div>
            
            <div class="vespa-upload-option sub-option">
              <input type="radio" id="method-manual" name="upload-method" value="manual">
              <label for="method-manual">
                <div class="vespa-option-icon">✏️</div>
                <div class="vespa-option-title">Manual Entry</div>
                <div class="vespa-option-description">Add individual records one by one</div>
              </label>
            </div>
          </div>
        </div>
      </div>
      
      <div class="vespa-stage-container" style="padding: 20px; background: #f0f7ff; border-radius: 8px;">
        <h3 style="color: #28a745; margin-bottom: 15px;">📊 Stage 2: Academic Data Upload (Optional)</h3>
        <div class="vespa-info-box" style="background: #e8f5e9; border-left: 4px solid #28a745; padding: 12px; margin-bottom: 15px;">
          <div class="vespa-info-icon" style="display: inline-block; margin-right: 8px;">ℹ️</div>
          <div class="vespa-info-content" style="display: inline-block; width: calc(100% - 30px); vertical-align: top;">
            Academic data is completely optional. Schools can use VESPA successfully without uploading any subject or grade information.
          </div>
        </div>
        
        <div class="vespa-upload-options">
          <div class="vespa-upload-option">
            <input type="radio" id="upload-ks4-simple" name="upload-type" value="student-ks4">
            <label for="upload-ks4-simple">
              <div class="vespa-option-icon">📚</div>
              <div class="vespa-option-title">A) Key Stage 4 (Yrs 9-11)</div>
              <div class="vespa-option-description">Simple upload of GCSE subjects - no calculations needed</div>
            </label>
          </div>
          
          <div class="vespa-upload-option">
            <input type="radio" id="upload-ks5-workflow" name="upload-type" value="ks5-workflow">
            <label for="upload-ks5-workflow">
              <div class="vespa-option-icon">🎯</div>
              <div class="vespa-option-title">B) Key Stage 5 (Yr 12-13)</div>
              <div class="vespa-option-description">Prior Attainment Calc. & Academic Profile</div>
            </label>
          </div>
          
          <div class="vespa-upload-option">
            <input type="radio" id="upload-academic-data" name="upload-type" value="academic-data">
            <label for="upload-academic-data">
              <div class="vespa-option-icon">✏️</div>
              <div class="vespa-option-title">C) Mid-Year Updates</div>
              <div class="vespa-option-description">Update existing academic data - grades, exam boards, etc.</div>
            </label>
          </div>
        </div>
      </div>
      
      <div class="vespa-stage-container" style="margin-bottom: 30px; padding: 20px; background: #e6f3ff; border-radius: 8px; border: 2px solid #0066cc;">
        <h3 style="color: #004080; margin-bottom: 15px;">⚙️ Stage 3: Account Management</h3>
        <p style="margin-bottom: 15px;">Manage existing staff and student accounts, reset passwords, update roles, and manage linked relationships.</p>
        
        <div class="vespa-upload-options">
          <div class="vespa-upload-option">
            <input type="radio" id="account-management" name="upload-type" value="account-management">
            <label for="account-management">
              <div class="vespa-option-icon">👤</div>
              <div class="vespa-option-title">Account Management</div>
              <div class="vespa-option-description">Manage staff & student accounts, passwords, roles, and relationships</div>
            </label>
          </div>
        </div>
      </div>
    `;
  }

/**
   * Check if staff exist and update UI accordingly
   */
  async function checkStaffExistence() {
    try {
      const customerId = selectedSchool?.id || userContext?.customerId;
      if (!customerId) return;
      
      const response = await $.ajax({
        url: `${API_BASE_URL}staff/check-exists?customerId=${customerId}`,
        type: 'GET',
        xhrFields: { withCredentials: true }
      });
      
      const hasStaff = response.success && response.hasStaff;
      const staffStatus = document.getElementById('staff-status');
      const studentOption = document.getElementById('upload-student-onboard');
      const disabledMessage = document.getElementById('student-disabled-message');
      
      if (hasStaff) {
        // Enable student upload
        if (studentOption) studentOption.disabled = false;
        if (disabledMessage) disabledMessage.style.display = 'none';
        if (staffStatus) {
          staffStatus.innerHTML = '✅ Staff exist';
          staffStatus.style.display = 'inline-block';
          staffStatus.style.color = '#28a745';
        }
    } else {
        // Disable student upload
        if (studentOption) studentOption.disabled = true;
        if (disabledMessage) disabledMessage.style.display = 'block';
        if (staffStatus) {
          staffStatus.innerHTML = '❌ No staff found';
          staffStatus.style.display = 'inline-block';
          staffStatus.style.color = '#dc3545';
        }
      }
  } catch (error) {
      debugLog('Error checking staff existence:', error, 'warn');
      // Don't let this error prevent the interface from working
      // Just hide the status indicators if there's an error
      const staffStatus = document.getElementById('staff-status');
      const disabledMessage = document.getElementById('student-disabled-message');
      if (staffStatus) staffStatus.style.display = 'none';
      if (disabledMessage) disabledMessage.style.display = 'none';
  }
}

/**
   * Render the select school step (super user only)
 * @returns {string} HTML for the step
 */
function renderSelectSchoolStep() {
  return `
      <h2>Select School to Emulate</h2>
      <p>As a Super User, choose the VESPA Customer account you want to upload data for.</p>
      
      <div class="vespa-school-search">
        <input type="text" id="school-search-input" placeholder="Type to search for a school..." style="margin-bottom: 10px; width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
        <select id="school-select">
          <option value="">-- Loading schools... --</option>
          <!-- Schools will be dynamically populated by fetchVespaCustomers -->
        </select>
    </div>
      
      <div id="emulation-details-container" style="display: none; margin-top: 15px; padding: 10px; background-color: #fff8e1; border: 1px solid #ffecb3; border-radius: 4px;">
        <h4>Emulation Mode Active</h4>
        <div id="emulation-school-name"></div>
        <div id="emulation-admin-email"></div>
        <div id="emulation-status"></div>
    </div>

      <div id="school-details" class="vespa-school-details" style="display: none; margin-top:15px;">
        <h3>Selected School Details (from object_2)</h3>
        <div class="vespa-school-info">
          <div class="vespa-info-row">
            <div class="vespa-info-label">Customer Name:</div>
            <div class="vespa-info-value" id="customer-name-display"></div>
          </div>
          <div class="vespa-info-row">
            <div class="vespa-info-label">Customer ID (object_2):</div>
            <div class="vespa-info-value" id="customer-id-display"></div>
          </div>
          <!-- Add more object_2 details if needed -->
        </div>
    </div>
  `;
}

/**
   * Render the upload CSV step
 * @returns {string} HTML for the step
 */
  function renderUploadCsvStep() {
    debugLog("renderUploadCsvStep called", { 
      uploadMethod: window.uploadMethod, 
      uploadType: uploadType 
    });
    
    // Check if manual entry is selected
    if (window.uploadMethod === 'manual') {
      debugLog("Manual entry mode detected, rendering manual form");
      if (uploadType === 'staff') {
        return renderStaffManualEntryForm();
      } else if (uploadType === 'student-onboard') {
        return renderStudentManualEntryForm();
      }
    }
    
    // Otherwise render the CSV upload interface
    // Create the button text and requirements outside the template string
    let buttonText = 'Template';
    let requirementsHtml = '';

    switch (uploadType) {
      case 'staff':
        buttonText = 'Staff';
        requirementsHtml = `
          <ul>
            <li><strong>Required fields:</strong> Title, First Name, Last Name, Email Address, Staff Type</li>
            <li><strong>Staff Type codes:</strong> admin (Staff Admin), tut (Tutor), sub (Subject Teacher), hoy (Head of Year), hod (Head of Dept), gen (General Staff)</li>
            <li>Multiple staff types can be assigned using comma-separated values (e.g., "admin,tut")</li>
          </ul>
        `;
        break;
      case 'student-onboard':
        buttonText = 'Student Accounts (Stage 1)';
        requirementsHtml = `
          <ul>
            <li><strong>CSV:</strong> <code>StudentData.csv</code></li>
            <li><strong>Required fields:</strong> ULN, UPN, Firstname, Lastname, Student Email, Gender, DOB, Group, Year Gp, Level, Tutors, Head of Year</li>
            <li><strong>Level values:</strong> Must be either "Level 2" or "Level 3"</li>
            <li><strong>Tutors, Head of Year:</strong> Must contain valid email address(es) of existing staff.</li>
            <li>Ensure staff (Tutors, HoY) exist before this upload.</li>
          </ul>
        `;
        break;
      case 'student-ks4':
        buttonText = 'KS4 Subject Data (Stage 2)';
        requirementsHtml = `
          <ul>
            <li><strong>CSV:</strong> <code>SubjectData_KS4.csv</code></li>
            <li><strong>Required fields:</strong> UPN, Student_Email, sub1, ex1 (and subsequent subX, exX pairs as needed).</li>
            <li><code>subX</code> is the subject name, <code>exX</code> is the student's expected/target grade for that subject.</li>
            <li>Ensure student accounts exist (via Stage 1 upload or manually).</li>
            <li>This process adds/updates subject records; can be run multiple times.</li>
          </ul>
        `;
        break;
      case 'student-ks5':
        buttonText = 'KS5 Subject Data (Stage 2)';
        requirementsHtml = `
          <ul>
            <li><strong>CSV:</strong> <code>SubjectData_KS5.csv</code></li>
            <li><strong>Required fields:</strong> UPN, Student_Email, GCSE_Prior_Attainment, sub1 (and subsequent subX as needed).</li>
            <li><code>GCSE_Prior_Attainment</code>: User-calculated average GCSE score.</li>
            <li><code>subX</code> is the A-Level/Level 3 subject name.</li>
            <li>System calculates MEG for each subject based on Prior Attainment.</li>
            <li>Ensure student accounts exist (via Stage 1 upload or manually).</li>
          </ul>
        `;
        break;
      default:
        requirementsHtml = '<p>Please select an upload type first.</p>';
    }
    
    return `
      <h2>Upload CSV File</h2>
      <p>Select a CSV file containing your ${uploadType} data.</p>
      
      <div class="vespa-upload-container">
        <div class="vespa-file-input">
          <input type="file" id="csv-file" accept=".csv">
          <label for="csv-file">
            <div class="vespa-file-icon">📄</div>
            <div class="vespa-file-text">Drag & drop your CSV file here or click to browse</div>
            </label>
          </div>
          
        <div class="vespa-template-download">
          <p>Don't have a template? Download one below:</p>
          <button id="download-template" class="vespa-button secondary">Download ${buttonText} Template</button>
          <div id="download-status-message" style="display: none;"></div>
          </div>
        </div>
        
      <div class="vespa-info-box">
        <div class="vespa-info-icon">ℹ️</div>
        <div class="vespa-info-content">
          <strong>CSV Format Requirements:</strong>
          ${requirementsHtml}
            </div>
            </div>
    `;
  }
  
  /**
   * Render the validation step
   * @returns {string} HTML for the step
   */
  function renderValidationStep() {
    // Create the table headers outside the template literal
    let tableHeaders = '';
    let colSpan = 6; // Default for staff
    
    // This logic determines the HEADERS of the preview table
    if (uploadType === 'staff') {
      tableHeaders = `
        <th>Title</th><th>First Name</th><th>Last Name</th><th>Email Address</th><th>Staff Type</th>
      `;
      colSpan = 6;
    } else if (uploadType === 'student-onboard') { 
      tableHeaders = `
        <th>Lastname</th><th>Firstname</th><th>Student Email</th><th>Group</th><th>Year Gp</th><th>Level</th><th>Tutor</th>
      `;
      colSpan = 8;
    } else if (uploadType === 'student-ks4') {
      tableHeaders = `
        <th>UPN</th><th>Student Email</th><th>Sub1</th><th>Ex1</th><th>Sub2</th><th>Ex2</th>
      `;
      colSpan = 7;
    } else if (uploadType === 'student-ks5') { // Ensure this is correct for student-ks5
      tableHeaders = `
        <th>UPN</th><th>Student Email</th><th>GCSE Prior</th><th>Sub1</th><th>Sub2</th><th>Sub3</th>
      `;
      colSpan = 7; // # + 6 headers
    } else { // Fallback if uploadType is unknown at this stage
      tableHeaders = `<th>Data Column 1</th><th>Data Column 2</th><th>Data Column 3</th><th>Data Column 4</th><th>Data Column 5</th>`;
      colSpan = 6;
  }
    
    return `
      <h2>Validate Data</h2>
      <p>Click "Validate" to check your CSV file for errors.</p>
      
      <div class="vespa-validation-container">
        <div class="vespa-validation-status">
          <div class="vespa-status-icon">⏳</div>
          <div class="vespa-status-text">Ready to validate</div>
        </div>
        
        <div class="vespa-validation-preview">
          <h3>CSV Preview</h3>
          <div class="vespa-preview-table">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  ${tableHeaders}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="${colSpan}" class="vespa-placeholder">File preview will appear here after validation</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <div class="vespa-validation-results" style="display: none;">
        <h3>Validation Results</h3>
        <div class="vespa-results-summary">
          <div class="vespa-result-item">
            <div class="vespa-result-label">Total Records:</div>
            <div class="vespa-result-value" id="total-records">0</div>
          </div>
          <div class="vespa-result-item">
            <div class="vespa-result-label">Valid Records:</div>
            <div class="vespa-result-value" id="valid-records">0</div>
          </div>
          <div class="vespa-result-item">
            <div class="vespa-result-label">Errors:</div>
            <div class="vespa-result-value" id="error-count">0</div>
          </div>
        </div>
        
        <div class="vespa-errors-container" id="validation-errors">
          <!-- Errors will be displayed here -->
        </div>
      </div>
      
      <div class="vespa-button-container">
        <button id="validate-button" class="vespa-button primary">Validate CSV Data</button>
      </div>
    `;
  }
  
  /**
   * Render the processing step
   * @returns {string} HTML for the step
   */
  function renderProcessingStep() {
    // Default empty email value from config
    const userEmail = VESPA_UPLOAD_CONFIG && VESPA_UPLOAD_CONFIG.userEmail ? VESPA_UPLOAD_CONFIG.userEmail : '';

    // Create the validation results HTML outside the template literal
    let validationStatusHtml = '';
    if (validationResults) {
      const badgeClass = validationResults.isValid ? 'success' : 'error';
      const statusText = validationResults.isValid ? 'Valid' : 'Has Errors';
      validationStatusHtml = `
        <div class="vespa-summary-item">
          <div class="vespa-summary-label">Validation Status:</div>
          <div class="vespa-summary-value">
            <span class="vespa-validation-badge ${badgeClass}">
              ${statusText}
            </span>
          </div>
        </div>
      `;
    }

    // Determine Upload Type Text for display
    let uploadTypeText = 'Unknown';
    switch (uploadType) {
      case 'staff':
        uploadTypeText = 'Staff Upload';
        break;
      case 'student-onboard':
        uploadTypeText = 'Student Accounts (Stage 1)';
        break;
      case 'student-ks4':
        uploadTypeText = 'KS4 Subject Data (Stage 2)';
        break;
      case 'student-ks5':
        uploadTypeText = 'KS5 Subject Data (Stage 2)';
        break;
    }

    // Create the calculator options HTML outside the template literal
    let calculatorOptionsHtml = '';
    if (uploadType === 'student-ks4' || uploadType === 'student-ks5') {
      calculatorOptionsHtml = `
        <div class="vespa-checkbox-group">
          <input type="checkbox" id="run-calculators" checked>
          <label for="run-calculators">Run ALPS calculators for subject data</label>
        </div>
      `;
    }

    return `
      <h2>Process Upload</h2>
      <p>Review your data and processing options before submitting.</p>
      
      <div class="vespa-processing-container">
        <div class="vespa-processing-status">
          <div class="vespa-status-icon">⏳</div>
          <div class="vespa-status-text">Ready to submit for processing</div>
        </div>
        
        <div class="vespa-processing-summary">
          <h3>Summary</h3>
          <div class="vespa-summary-details">
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Upload Type:</div>
              <div class="vespa-summary-value">${uploadTypeText}</div>
            </div>
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Total Records:</div>
              <div class="vespa-summary-value" id="total-records-summary">${validationResults?.total || validationResults?.csvData?.length || 0}</div>
            </div>
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Valid Records:</div>
              <div class="vespa-summary-value" id="valid-records-summary">${validationResults?.isValid ? (validationResults?.total || validationResults?.csvData?.length || 0) : ((validationResults?.total || validationResults?.csvData?.length || 0) - (validationResults?.errors?.length || 0))}</div>
            </div>
            ${validationStatusHtml}
            ${(uploadType === 'student-onboard' || uploadType === 'student-ks4' || uploadType === 'student-ks5') && useUniversalPassword ? `
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Password Setting:</div>
              <div class="vespa-summary-value">
                <span class="vespa-validation-badge success">Universal Password Set</span>
              </div>
            </div>
            ` : ''}
          </div>
        </div>
        
        <div class="vespa-processing-options">
          <h3>Processing Options</h3>
          <div class="vespa-options-form">
            <div class="vespa-checkbox-group">
              <input type="checkbox" id="send-notifications" checked>
              <label for="send-notifications">Send welcome emails to new users (if applicable)</label>
            </div>
            
            ${calculatorOptionsHtml}
            
            <div class="vespa-input-group">
              <label for="notification-email">Send results to email:</label>
              <input type="email" id="notification-email" value="${userEmail}">
            </div>
          </div>
        </div>
      </div>
      
      <div class="vespa-info-box">
        <div class="vespa-info-icon">ℹ️</div>
        <div class="vespa-info-content">
          <strong>Important:</strong> Your data will be queued for background processing. You will receive an email with the results once processing is complete.
        </div>
      </div>
      
      <div class="vespa-button-container">
        <button id="process-button" class="vespa-button primary">Submit for Processing</button>
      </div>
    `;
  }
  
  /**
   * Render the results step
   * @returns {string} HTML for the step
   */
  function renderResultsStep() {
    let statusText = 'Processing Status';
    let statusClass = 'info'; // Default to info
    let statusIcon = 'ℹ️';
    let summaryHtml = '<p>Your upload has been submitted for processing.</p>';
    let detailsHtml = '';

    if (processingResults) {
        if (processingResults.status === 'queued') {
            statusText = 'Upload Queued Successfully';
            statusClass = 'success';
            statusIcon = '✅';
            summaryHtml = `
                <p><strong>Your data has been successfully queued for processing.</strong></p>
                <p>Job ID: <code>${processingResults.jobId || 'N/A'}</code></p>
                <p>You will receive an email at <strong>${processingResults.notificationEmail || 'your registered email'}</strong> with detailed results once processing is complete.</p>
                <p class="vespa-success-message" style="margin-top: 20px;">✓ You can safely close this window now.</p>
            `;
        } else if (processingResults.status === 'submission_failed') {
            statusText = 'Upload Submission Failed';
            statusClass = 'error';
            statusIcon = '❌';
            summaryHtml = `
                <p><strong>There was an error submitting your upload for processing.</strong></p>
                <p class="vespa-error-message">Error: ${processingResults.message || 'Unknown submission error.'}</p>
                <p>Please try submitting the upload again. If the problem persists, contact support.</p>
            `;
        } else if (processingResults.status === 'completed_with_errors') {
            statusText = 'Processing Completed with Errors';
            statusClass = 'warning';
            statusIcon = '⚠️';
            summaryHtml = `
                <p><strong>Your upload was processed but encountered some errors.</strong></p>
                <p>${processingResults.finalMessage || 'Some records could not be processed successfully.'}</p>
            `;
            
            // Show error details if available
            if (processingResults.processingErrors && processingResults.processingErrors.length > 0) {
                detailsHtml = `
                    <div class="vespa-error-details" style="margin-top: 20px;">
                        <h4>Error Details:</h4>
                        <div class="vespa-errors-list">
                `;
                processingResults.processingErrors.forEach((error, index) => {
                    if (index < 5) { // Show first 5 errors
                        detailsHtml += `
                            <div class="vespa-error-item">
                                <strong>Row ${error.row || 'N/A'}:</strong> ${error.message || error.type || 'Unknown error'}
                            </div>
                        `;
                    }
                });
                if (processingResults.processingErrors.length > 5) {
                    detailsHtml += `<p><em>...and ${processingResults.processingErrors.length - 5} more errors. Check your email for full details.</em></p>`;
                }
                detailsHtml += `
                        </div>
                    </div>
                `;
            }
        } else if (processingResults.status === 'completed') {
            statusText = 'Processing Completed Successfully';
            statusClass = 'success';
            statusIcon = '✅';
            summaryHtml = `
                <p><strong>Your upload has been processed successfully!</strong></p>
                <p>${processingResults.finalMessage || 'All records were processed without errors.'}</p>
                <p>Check your email for detailed results.</p>
            `;
        } else {
            // Fallback for unexpected states
            statusText = 'Processing Status Unknown';
            statusClass = 'info';
            statusIcon = 'ℹ️';
            summaryHtml = `<p>The upload process status is unclear. Please check your email for results or contact support if you don't receive an update.</p>`;
        }
    } else {
        // No processing results yet
        summaryHtml = `<p>No processing results available. If you just submitted an upload, please wait for the email confirmation.</p>`;
    }
    
    return `
      <h2>Upload Status</h2>
      
      <div class="vespa-results-container">
        <div class="vespa-results-status ${statusClass}">
          <div class="vespa-status-icon">${statusIcon}</div>
          <div class="vespa-status-text">${statusText}</div>
        </div>
        
        <div class="vespa-results-summary">
          ${summaryHtml}
          ${detailsHtml}
        </div>
        
        <div class="vespa-results-actions">
          <button class="vespa-button primary" id="start-new-upload">Start New Upload</button>
        </div>
      </div>
        `;
  }

  /**
   * Render the staff manual entry form
   * @returns {string} HTML for the staff manual entry form
   */
  function renderStaffManualEntryForm() {
    return `
      <h2>Add Staff Member</h2>
      <p>Enter the details for a single staff member.</p>
      
      <form id="staff-manual-entry-form" style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
        <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 2fr 2fr; gap: 10px; margin-bottom: 15px;">
          <div class="vespa-form-group">
            <label for="staff-title">Title <span style="color: red;">*</span></label>
            <input type="text" id="staff-title" name="title" required placeholder="Mr/Ms/Dr">
          </div>
          <div class="vespa-form-group">
            <label for="staff-first-name">First Name <span style="color: red;">*</span></label>
            <input type="text" id="staff-first-name" name="firstName" required>
          </div>
          <div class="vespa-form-group">
            <label for="staff-last-name">Last Name <span style="color: red;">*</span></label>
            <input type="text" id="staff-last-name" name="lastName" required>
          </div>
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 15px;">
          <label for="staff-email">Email Address <span style="color: red;">*</span></label>
          <input type="email" id="staff-email" name="email" required>
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 15px;">
          <label for="staff-types">Staff Type(s) <span style="color: red;">*</span></label>
          <select id="staff-types" name="staffTypes" multiple required style="height: 120px;">
            <option value="admin">Staff Admin</option>
            <option value="tut">Tutor</option>
            <option value="hoy">Head of Year</option>
            <option value="hod">Head of Department</option>
            <option value="sub">Subject Teacher</option>
            <option value="gen">General Staff</option>
          </select>
          <small>Hold Ctrl/Cmd to select multiple</small>
        </div>
        
        <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div class="vespa-form-group">
            <label for="staff-year-group">Year Group (Optional)</label>
            <select id="staff-year-group" name="yearGroup">
              <option value="">-- Select --</option>
              <option value="9">Year 9</option>
              <option value="10">Year 10</option>
              <option value="11">Year 11</option>
              <option value="12">Year 12</option>
              <option value="13">Year 13</option>
            </select>
          </div>
          <div class="vespa-form-group">
            <label for="staff-group">Group (Optional)</label>
            <input type="text" id="staff-group" name="group" placeholder="e.g., 12A">
          </div>
        </div>
        
        <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div class="vespa-form-group">
            <label for="staff-faculty">Faculty/Dept (Optional)</label>
            <input type="text" id="staff-faculty" name="faculty" placeholder="e.g., Science">
          </div>
          <div class="vespa-form-group">
            <label for="staff-subject">Subject (Optional)</label>
            <input type="text" id="staff-subject" name="subject" placeholder="e.g., Physics">
          </div>
        </div>
        
        <div class="vespa-form-actions" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6;">
          <button type="submit" class="vespa-button primary">Add Staff Member</button>
          <button type="button" class="vespa-button secondary" onclick="resetManualEntryForm('staff')">Clear Form</button>
        </div>
      </form>
      
      <div id="manual-entry-results" style="display: none; margin-top: 20px;"></div>
    `;
  }

  /**
   * Render the student manual entry form
   * @returns {string} HTML for the student manual entry form
   */
  function renderStudentManualEntryForm() {
    // Load dropdown options when form is rendered
    setTimeout(() => loadStudentFormOptions(), 100);
    
    return `
      <h2>Add Student</h2>
      <p>Enter the details for a single student.</p>
      
      <form id="student-manual-entry-form" style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
        <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div class="vespa-form-group">
            <label for="student-uln">ULN <span style="color: red;">*</span></label>
            <input type="text" id="student-uln" name="uln" required placeholder="10-digit ULN">
          </div>
          <div class="vespa-form-group">
            <label for="student-upn">UPN <span style="color: red;">*</span></label>
            <input type="text" id="student-upn" name="upn" required placeholder="e.g., A123456">
          </div>
        </div>
        
        <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div class="vespa-form-group">
            <label for="student-first-name">First Name <span style="color: red;">*</span></label>
            <input type="text" id="student-first-name" name="firstName" required>
          </div>
          <div class="vespa-form-group">
            <label for="student-last-name">Last Name <span style="color: red;">*</span></label>
            <input type="text" id="student-last-name" name="lastName" required>
          </div>
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 15px;">
          <label for="student-email">Student Email <span style="color: red;">*</span></label>
          <input type="email" id="student-email" name="email" required>
        </div>
        
        <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div class="vespa-form-group">
            <label for="student-gender">Gender (Optional)</label>
            <select id="student-gender" name="gender">
              <option value="">-- Select --</option>
              <option value="Female">Female</option>
              <option value="Male">Male</option>
              <option value="Non-Binary">Non-Binary</option>
              <option value="Prefer Not to Say">Prefer Not to Say</option>
              <option value="Unspecified">Unspecified</option>
            </select>
          </div>
          <div class="vespa-form-group">
            <label for="student-dob">Date of Birth (Optional)</label>
            <input type="date" id="student-dob" name="dob">
          </div>
        </div>
        
        <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 15px;">
          <div class="vespa-form-group">
            <label for="student-year-group">Year Group <span style="color: red;">*</span></label>
            <select id="student-year-group" name="yearGroup" required>
              <option value="">-- Select --</option>
              <option value="9">Year 9</option>
              <option value="10">Year 10</option>
              <option value="11">Year 11</option>
              <option value="12">Year 12</option>
              <option value="13">Year 13</option>
            </select>
          </div>
          <div class="vespa-form-group">
            <label for="student-level">Level <span style="color: red;">*</span></label>
            <select id="student-level" name="level" required>
              <option value="">-- Select --</option>
              <option value="Level 2">Level 2</option>
              <option value="Level 3">Level 3</option>
            </select>
          </div>
          <div class="vespa-form-group">
            <label for="student-group">Group (Optional)</label>
            <input type="text" id="student-group" name="group" placeholder="e.g., 12B">
          </div>
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 15px;">
          <label for="student-tutors">Tutor(s) (Optional)</label>
          <select id="student-tutors" name="tutors" multiple style="height: 100px;">
            <option value="">Loading tutors...</option>
          </select>
          <small>Hold Ctrl/Cmd to select multiple</small>
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 15px;">
          <label for="student-hoy">Head of Year (Optional)</label>
          <select id="student-hoy" name="headOfYear">
            <option value="">Loading heads of year...</option>
          </select>
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 15px;">
          <label for="student-subject-teachers">Subject Teacher(s) (Optional)</label>
          <select id="student-subject-teachers" name="subjectTeachers" multiple style="height: 100px;">
            <option value="">Loading subject teachers...</option>
          </select>
          <small>Hold Ctrl/Cmd to select multiple</small>
        </div>
        
        <div class="vespa-form-actions" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #dee2e6;">
          <button type="submit" class="vespa-button primary">Add Student</button>
          <button type="button" class="vespa-button secondary" onclick="resetManualEntryForm('student')">Clear Form</button>
        </div>
      </form>
      
      <div id="manual-entry-results" style="display: none; margin-top: 20px;"></div>
    `;
  }

  /**
   * VESPA Upload Bridge - API Functions
 * 
 * This file contains functions for communicating with the VESPA Upload API,
 * handling template downloads, CSV validation, and data processing.
 */

/**
 * Download a template file
 * This function generates templates client-side as a fallback
 */
function downloadTemplateFile() {
  debugLog("Template download initiated", null, 'info');
  
  try {
    // Show status message for feedback
    let statusMessage = document.getElementById('download-status-message');
    if (!statusMessage) {
      statusMessage = document.createElement('div');
      statusMessage.id = 'download-status-message';
      statusMessage.style.cssText = `
        margin-top: 10px;
        padding: 8px;
        border-radius: 4px;
        text-align: center;
        background-color: #e0f7fa;
        color: #0288d1;
      `;
      document.querySelector('.vespa-template-download').appendChild(statusMessage);
    }
    
    statusMessage.style.display = 'block';
    statusMessage.textContent = 'Preparing download...';
    
    // Generate template content based on upload type
    let templateContent = '';
    let filename = '';
    
    switch (uploadType) {
      case 'staff':
        templateContent = `Title,First Name,Last Name,Email Address,Staff Type,Year Group,Group,Faculty/Dept,Subject
Mr,John,Smith,jsmith@school.edu,tut,12,12A,Science,Physics
Ms,Jane,Doe,jdoe@school.edu,"admin,hoy",12,,,
Dr,Sarah,Johnson,sjohnson@school.edu,sub,13,13B,Maths,Further Maths
Mrs,Emily,Brown,ebrown@school.edu,"tut,sub",12,12C,English,English Literature
Mr,David,Wilson,dwilson@school.edu,hod,,,"Science,Physics",`;
        filename = 'staff_template.csv';
        break;
        
      case 'student-onboard':
        templateContent = `ULN,UPN,Firstname,Lastname,Student Email,Gender,DOB,Group,Year Gp,Level,Tutors,Head of Year
1234567890,A123456,Alex,Johnson,ajohnson@school.edu,M,15/09/2006,12B,12,Level 3,jsmith@school.edu,jdoe@school.edu
2345678901,A123457,Emma,Williams,ewilliams@school.edu,F,22/10/2006,12A,12,Level 3,"jsmith@school.edu,ebrown@school.edu",jdoe@school.edu
3456789012,A123458,Michael,Brown,mbrown@school.edu,M,08/03/2007,12C,12,Level 3,dwilson@school.edu,jdoe@school.edu
4567890123,A123459,Sophie,Davis,sdavis@school.edu,F,14/07/2006,12A,12,Level 3,ebrown@school.edu,jdoe@school.edu`;
        filename = 'StudentData.csv';
        break;
        
      case 'student-ks4':
        templateContent = `UPN,Student_Email,sub1,ex1,sub2,ex2,sub3,ex3,sub4,ex4,sub5,ex5
A123456,ajohnson@school.edu,English Language,7,English Literature,7,Maths,8,Biology,7,Chemistry,7,Physics,8
A123457,ewilliams@school.edu,English Language,8,English Literature,9,Maths,7,Biology,8,Chemistry,8,Physics,7
A123458,mbrown@school.edu,English Language,6,English Literature,6,Maths,9,Biology,7,Chemistry,8,Physics,9
A123459,sdavis@school.edu,English Language,9,English Literature,8,Maths,6,Biology,6,Chemistry,6,Physics,5`;
        filename = 'SubjectData_KS4.csv';
        break;
        
      case 'student-ks5':
        templateContent = `UPN,Student_Email,GCSE_Prior_Attainment,sub1,sub2,sub3,sub4,sub5
A123456,ajohnson@school.edu,7.2,Physics,Chemistry,Maths,Further Maths,
A123457,ewilliams@school.edu,7.8,English Literature,History,Psychology,Sociology,
A123458,mbrown@school.edu,8.1,Maths,Further Maths,Physics,Computer Science,
A123459,sdavis@school.edu,6.5,Biology,Chemistry,Psychology,,`;
        filename = 'SubjectData_KS5.csv';
        break;
        
      default:
        showError('Unknown upload type for template generation');
        return;
    }
    
    debugLog(`Generating ${uploadType} template locally`);
    
    // Create blob and download
    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Show success message
    statusMessage.innerHTML = `
      <span style="color:#2e7d32">✓ Template downloaded!</span>
    `;
    statusMessage.style.backgroundColor = '#e8f5e9';
    
    debugLog(`Template '${filename}' generated and downloaded successfully`, null, 'success');
    
    // Reset button if needed
    const downloadButton = document.getElementById('download-template');
    if (downloadButton) {
      downloadButton.disabled = false;
    }
    
  } catch (error) {
    debugLog("Error in template download", error, 'error');
    showError(`Template download failed: ${error.message}`);
    
    // Reset button if error
    const downloadButton = document.getElementById('download-template');
    if (downloadButton) {
      downloadButton.disabled = false;
    }
  }
}
  
  /**
   * Update the validation status UI
   * @param {string} message - Status message to display
   * @param {string} type - Status type (ready, processing, success, error)
   */
  function updateValidationStatus(message, type = 'ready') {
    const statusDiv = document.querySelector('.vespa-validation-status');
    if (!statusDiv) return;
    
    let icon = '⏳';
    let className = '';
    
    switch (type) {
      case 'processing':
        icon = '⏳';
        className = 'processing';
        break;
      case 'success':
        icon = '✅';
        className = 'success';
        break;
      case 'error':
        icon = '❌';
        className = 'error';
        break;
      default:
        icon = '⏳';
        className = '';
    }
    
    statusDiv.innerHTML = `
      <div class="vespa-status-icon">${icon}</div>
      <div class="vespa-status-text">${message}</div>
    `;
    
    // Update classes
    statusDiv.className = 'vespa-validation-status';
    if (className) {
      statusDiv.classList.add(className);
    }
  }
  
  /**
   * Handle API response and check for errors
   * @param {Response} response - Fetch API response
   * @returns {Promise} - Promise that resolves to the JSON data
   */
  function handleApiResponse(response) {
    // Log the response for debugging
    console.log('[VESPA Upload] API response status:', response.status);
    
    if (!response.ok) {
      // Try to get error details if possible
      return response.json()
        .catch(() => {
          // If we can't parse JSON, just use status text
          throw new Error(`API error: ${response.status} ${response.statusText}`);
        })
        .then(errorData => {
          // If we got JSON error details, use them
          const errorMessage = errorData.message || errorData.error || `API error: ${response.status}`;
          throw new Error(errorMessage);
        });
    }
    
    return response.json();
  }
  
  /**
   * Parse a CSV file into an array of objects
   * @param {File} file - The CSV file to parse
   * @returns {Promise<Array<Object>>} - Promise resolving to array of row objects
   */
  async function parseCSVFile(file) { // Ensured async
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = function(event) {
        try {
          const csvText = event.target.result;
          debugLog("CSV file read successfully", null, 'info');
          
          // Robust CSV parsing
          const rowsData = []; // Store arrays of strings (parsed rows)
          let currentRow = [];
          let inQuotes = false;
          let value = "";

          for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];

            if (char === '"') { // Check for quote
              if (inQuotes && i + 1 < csvText.length && csvText[i+1] === '"') {
                // Handle escaped quote (two double quotes)
                value += '"';
                i++; // Skip next quote
              } else {
                inQuotes = !inQuotes; // Toggle inQuotes state
              }
            } else if (char === ',' && !inQuotes) {
              currentRow.push(value); // Don't trim yet, headers might need spaces
              value = "";
            } else if ((char === '\r' || char === '\n') && !inQuotes) {
              // End of line
              if (csvText[i] === '\r' && csvText[i+1] === '\n') { // CRLF
                i++; // Skip LF
              }
              currentRow.push(value); // Add last value of the row
              if (currentRow.length > 0 && currentRow.some(cell => cell.trim() !== "")) { // Only add non-empty rows
                  rowsData.push(currentRow);
              }
              currentRow = [];
              value = "";
            } else {
              value += char;
            }
          }
          // Add the last value and row if any (e.g., if file doesn't end with newline)
          currentRow.push(value);
          if (currentRow.length > 0 && currentRow.some(cell => cell.trim() !== "")) {
             rowsData.push(currentRow);
          }

          if (rowsData.length === 0) {
            reject(new Error('CSV file is empty or contains no data'));
            return;
          }
          
          // Get headers from first row, trimming them now
          const headers = rowsData[0].map(header => header.trim());
          
          // Parse data rows
          const data = [];
          for (let i = 1; i < rowsData.length; i++) {
            const rowArray = rowsData[i];
            const rowObj = {};
            
            headers.forEach((header, index) => {
              // Trim individual cell values here
              let cellValue = index < rowArray.length ? rowArray[index].trim() : '';
              rowObj[header] = cellValue;
            });
            
            data.push(rowObj);
          }
          
          debugLog(`CSV parsed successfully: ${data.length} data rows found`, null, 'success');
          
          data.forEach((row, i) => {
            const rowNumber = i + 1;
            debugLog(`Parsed Row ${rowNumber} data:`, row, 'info');
          });
          
          resolve(data);
        } catch (error) {
          debugLog(`CSV parsing error: ${error.message}`, error, 'error');
          reject(error);
        }
      };
      
      reader.onerror = function() {
        debugLog("Error reading CSV file", null, 'error');
        reject(new Error('Error reading CSV file'));
      };
      
      reader.readAsText(file);
    });
  }

  /**
   * Local validation of CSV data to catch common errors before sending to API
   * @param {Array} csvData - Parsed CSV data
   * @returns {Promise<Object>} Validation results object
   */
  async function validateLocally(csvData) { // Changed to async
    const results = {
      isValid: true,
      errors: [],
      total: csvData.length
    };
    
    // Only continue if we have data
    if (!csvData || !csvData.length) {
      results.isValid = false;
      results.errors.push({
        row: 'N/A',
        type: 'CSV Error',
        message: 'CSV file is empty or has no valid data rows'
      });
      return results;
    }
    
    debugLog(`Validating ${csvData.length} rows locally for type: ${uploadType}`, null, 'info');
    
    // Check required fields based on upload type
    csvData.forEach((row, index) => {
      const rowNum = index + 1;
      
      if (uploadType === 'staff') {
        // Required fields for staff
        const requiredFields = ['Title', 'First Name', 'Last Name', 'Email Address', 'Staff Type'];
        
        requiredFields.forEach(field => {
          if (!row[field] || row[field].trim() === '') {
            results.isValid = false;
            results.errors.push({
              row: rowNum,
              type: 'Missing Field',
              field: field,
              message: `Row ${rowNum}: Required field "${field}" is missing or empty`
            });
          }
        });
        
        // Email format check
        if (row['Email Address'] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row['Email Address'])) {
          results.isValid = false;
          results.errors.push({
            row: rowNum,
            type: 'Format Error',
            field: 'Email Address',
            message: `Row ${rowNum}: Email format is invalid (${row['Email Address']})`
          });
        }
        
        // Staff Type format check
        if (row['Staff Type']) {
          const validTypes = ['admin', 'tut', 'sub', 'hoy', 'hod', 'gen'];
          const types = row['Staff Type'].split(',').map(t => t.trim());
          
          types.forEach(type => {
            if (!validTypes.includes(type)) {
              results.isValid = false;
              results.errors.push({
                row: rowNum,
                type: 'Invalid Value',
                field: 'Staff Type',
                message: `Row ${rowNum}: Invalid staff type code "${type}" - must be one of: admin, tut, sub, hoy, hod, gen`
              });
            }
          });
        }
      } else if (uploadType === 'student-onboard') { // Changed from 'student'
        // Required fields for students (Stage 1 - Onboarding)
        const requiredFields = ['ULN', 'UPN', 'Firstname', 'Lastname', 'Student Email', 'Gender', 'DOB', 'Group', 'Year Gp', 'Level', 'Tutors', 'Head of Year'];
        
        requiredFields.forEach(field => {
          if (!row[field] || row[field].trim() === '') {
            results.isValid = false;
            results.errors.push({
              row: rowNum,
              type: 'Missing Field',
              field: field,
              message: `Row ${rowNum}: Required field "${field}" is missing or empty for Student Onboarding.`
            });
          }
        });
        
        // Email format check for Student Email
        if (row['Student Email'] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row['Student Email'])) {
          results.isValid = false;
          results.errors.push({
            row: rowNum,
            type: 'Format Error',
            field: 'Student Email',
            message: `Row ${rowNum}: Student Email format is invalid (${row['Student Email']})`
          });
        }

        // Level value check
        if (row['Level'] && !['Level 2', 'Level 3'].includes(row['Level'])) {
          results.isValid = false;
          results.errors.push({
            row: rowNum,
            type: 'Invalid Value',
            field: 'Level',
            message: `Row ${rowNum}: Level must be "Level 2" or "Level 3", got "${row['Level']}"`
          });
        }
      } else if (uploadType === 'student-ks4') {
        const requiredFields = ['UPN', 'Student_Email', 'sub1', 'ex1'];
        requiredFields.forEach(field => {
          if (!row[field] || String(row[field]).trim() === '') { // Convert to string before trim for numeric grades
            results.isValid = false;
            results.errors.push({
              row: rowNum,
              type: 'Missing Field',
              field: field,
              message: `Row ${rowNum}: Required field \"${field}\" is missing or empty for KS4 Subject Data.`
            });
          }
        });
        if (row['Student_Email'] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row['Student_Email'])) {
            results.isValid = false;
            results.errors.push({ row: rowNum, type: 'Format Error', field: 'Student_Email', message: `Row ${rowNum}: Student_Email format is invalid.` });
        }
        // Check that for every subX there is an exX up to a reasonable limit (e.g., 10 subjects)
        for (let i = 1; i <= 10; i++) {
          if (row[`sub${i}`] && !row[`ex${i}`]) {
            results.isValid = false;
            results.errors.push({ row: rowNum, type: 'Missing Field', field: `ex${i}`, message: `Row ${rowNum}: Grade (ex${i}) is missing for subject sub${i}.` });
          }
          if (!row[`sub${i}`] && row[`ex${i}`]) {
            results.isValid = false;
            results.errors.push({ row: rowNum, type: 'Missing Field', field: `sub${i}`, message: `Row ${rowNum}: Subject (sub${i}) is missing for grade ex${i}.` });
          }
        }
      } else if (uploadType === 'student-ks5') {
        const requiredFields = ['UPN', 'Student_Email', 'GCSE_Prior_Attainment', 'sub1'];
        requiredFields.forEach(field => {
          if (!row[field] || String(row[field]).trim() === '') { // Convert to string before trim
            results.isValid = false;
            results.errors.push({
              row: rowNum,
              type: 'Missing Field',
              field: field,
              message: `Row ${rowNum}: Required field \"${field}\" is missing or empty for KS5 Subject Data.`
            });
          }
        });
        if (row['Student_Email'] && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row['Student_Email'])) {
            results.isValid = false;
            results.errors.push({ row: rowNum, type: 'Format Error', field: 'Student_Email', message: `Row ${rowNum}: Student_Email format is invalid.` });
        }
        if (row['GCSE_Prior_Attainment'] && isNaN(parseFloat(row['GCSE_Prior_Attainment']))) {
            results.isValid = false;
            results.errors.push({ row: rowNum, type: 'Format Error', field: 'GCSE_Prior_Attainment', message: `Row ${rowNum}: GCSE_Prior_Attainment must be a valid number.` });
        }
      }
    });
    
    // If initial local validation already found errors, no need to call external validation
    if (!results.isValid) {
      debugLog("Initial local validation failed, skipping subject name check.", results.errors, 'warn');
      return results; // Return Promise.resolve(results) if not using async/await for the whole chain
    }

    // === New: Subject Name Validation for student-ks5 ===
    if (uploadType === 'student-ks5' && csvData && csvData.length > 0) {
      debugLog("Starting student-ks5 subject name validation.", null, 'info');
      let allSubjectNamesFromCsv = [];
      const subjectColumns = ['sub1', 'sub2', 'sub3', 'sub4', 'sub5'];

      csvData.forEach(row => {
        subjectColumns.forEach(colName => {
          if (row[colName] && String(row[colName]).trim() !== '') {
            allSubjectNamesFromCsv.push(String(row[colName]).trim());
          }
        });
      });
      const uniqueSubjectNames = [...new Set(allSubjectNamesFromCsv)];

      if (uniqueSubjectNames.length > 0) {
        debugLog("Unique subject names collected for API validation:", uniqueSubjectNames);
        
        // Simplified and robust URL construction for check-subjects endpoint
        // determineApiUrl() ensures API_BASE_URL ends with /api/
        // The target endpoint is registered at /api/validation/check-subjects
        const checkSubjectsUrl = API_BASE_URL + "validation/check-subjects";
        debugLog("Calling subject check API at:", checkSubjectsUrl);

        try {
          const response = await $.ajax({
            url: checkSubjectsUrl,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ subjectNames: uniqueSubjectNames }),
            // Add headers if necessary, though this helper might be public
          });

          debugLog("Response from /api/validation/check-subjects:", response);

          if (response && response.success && response.invalidSubjectNames && response.invalidSubjectNames.length > 0) {
            const unrecognizedSubjectsFromApi = response.invalidSubjectNames;
            debugLog("Unrecognized subjects from API:", unrecognizedSubjectsFromApi);

            csvData.forEach((row, rowIndex) => {
              subjectColumns.forEach(colName => {
                const cellValue = String(row[colName] || '').trim();
                if (cellValue !== '' && unrecognizedSubjectsFromApi.includes(cellValue)) {
                  results.isValid = false; // Mark overall validation as false
                  results.errors.push({
                    row: rowIndex + 1, // 1-based for display
                    type: 'Invalid Subject', // Added type for clarity
                    field: colName, // Using 'field' to be consistent with other errors
                    message: `Unrecognized subject: "${cellValue}". Please check spelling or prefix for non-A-Level (e.g., IB HL - Subject).`
                  });
                }
              });
            });
            if (!results.isValid) {
                 debugLog(`Found ${results.errors.filter(e => e.type === 'Invalid Subject').length} unrecognized subjects after API check.`, null, 'warn');
            }
          } else if (response && !response.success) {
            debugLog("API call to /api/validation/check-subjects was not successful.", response.message, 'warn');
            // Optionally add a general error if the API call itself fails in a known way
            // results.errors.push({ row: 'N/A', type: 'API Error', message: `Subject validation service error: ${response.message}` });
            // results.isValid = false;
          }
        } catch (error) {
          console.error("Error calling /api/validation/check-subjects:", error);
          debugLog("AJAX error validating subjects via API.", {
             status: error.status, statusText: error.statusText, responseText: error.responseText
          }, 'error');
          results.isValid = false; // Mark validation as failed due to API error
          results.errors.push({
            row: 'N/A',
            type: 'API Communication Error',
            field: 'Subject Validation',
            message: 'Could not validate subject names with the server. Please try again. Details: ' + (error.statusText || error.message)
          });
        }
      } else {
        debugLog("No unique subject names found in CSV to validate via API.", null, 'info');
      }
    }
    // === End New: Subject Name Validation ===

    // Return the validation results
    return results; // This will be a promise resolving to results
  }

  /**
   * Validate the CSV data
   * This function replaces the previous validation approach that had issues
   */
  async function validateCsvData() { // Changed to async
    debugLog("Starting CSV validation", null, 'info');
    
    let file = null;
    
    // First try to use the stored selectedFile
    if (selectedFile) {
      file = selectedFile;
      debugLog(`Using previously stored file: ${file.name} (${file.size} bytes)`);
    } 
    // If no stored file, try to get it from the current file input
    else {
      const fileInput = document.getElementById('csv-file');
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        debugLog("No file selected", null, 'error');
        showError('Please select a CSV file first');
        return;
      }
      file = fileInput.files[0];
      debugLog(`Selected file from input: ${file.name} (${file.size} bytes)`);
    }
    
    // Update UI to show validation in progress
    updateValidationStatus('Validating data...', 'processing');
    
    try {
        const csvData = await parseCSVFile(file); // await parseCSVFile

        // First validate locally to catch common errors
        const localValidation = await validateLocally(csvData); // await validateLocally
        
        // If we have local validation errors (including new subject check), show those without making API call
        if (!localValidation.isValid) {
          debugLog(`Local validation found ${localValidation.errors.length} errors`, localValidation.errors, 'warn');
          
          validationResults = {
            ...localValidation,
            csvData: csvData, 
            source: 'local'
          };
          
          displayValidationResults(validationResults);
          updateValidationStatus(`Validation completed with ${localValidation.errors.length} errors`, 'error');
          showError(`Found ${localValidation.errors.length} validation issues. Please fix these before proceeding.`);
          return; 
        }
        
        // No local errors - proceed with API validation
        debugLog("Local validation passed, proceeding with API validation");
        
        let endpointPath = '';
        switch (uploadType) {
          case 'staff':
            endpointPath = 'staff/validate';
            break;
          case 'student-onboard':
            endpointPath = 'students/onboard/validate';
            break;
          case 'student-ks4':
            endpointPath = 'students/ks4-subjects/validate';
            break;
          case 'student-ks5':
            endpointPath = 'students/ks5-subjects/validate';
            break;
          default:
            showError('Invalid upload type for API validation.');
            debugLog(`validateCsvData: Invalid uploadType "${uploadType}" for API call`, null, 'error');
            updateValidationStatus('Validation failed: Invalid type', 'error'); // Update status
            return;
        }

        let baseUrl = API_BASE_URL;
        debugLog(`API Base URL (original): "${baseUrl}"`, null, 'info');
        
        if (!baseUrl.endsWith('/')) {
          baseUrl += '/';
          debugLog(`Added trailing slash: "${baseUrl}"`, null, 'info');
        }
        
        if (!baseUrl.includes('/api/')) {
          if (baseUrl.endsWith('/api')) {
            baseUrl += '/';
            debugLog(`Added trailing slash after /api: "${baseUrl}"`, null, 'info');
          } else {
            const originalUrl = baseUrl;
            baseUrl = baseUrl.replace(/\/+$/, '') + '/api/';
            debugLog(`Added /api/ path: "${originalUrl}" -> "${baseUrl}"`, null, 'info');
          }
        }
        
        const validationUrl = `${baseUrl}${endpointPath}`;
        debugLog(`Final validation URL: "${validationUrl}"`, null, 'info');
        
        let logOutput = '=== CSV DATA BEING SENT TO API ===\n';
        csvData.forEach((row, idx) => {
          logOutput += `Row ${idx+1}: ${JSON.stringify(row)}\n`;
        });
        logOutput += '==============================';
        console.log(logOutput);
        
        debugLog(`Sending API validation request to ${validationUrl}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          bodyLength: JSON.stringify({ csvData }).length,
          rowCount: csvData.length
        }, 'info');
        
        // Corrected try-catch block for the fetch call
        const response = await fetch(validationUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ csvData })
        });

        debugLog(`Validation response status: ${response.status} ${response.statusText}`);
        const resultData = await response.json().catch(err => {
          if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}. Response body was not valid JSON or empty.`);
          }
          debugLog("Could not parse JSON response from API, but status was OK.", err, 'warn');
          throw new Error(`Could not parse API response: ${err.message}. Check API format.`);
        });

        if (!response.ok) {
          const errorMessage = resultData?.message || resultData?.error || (`API error: ${response.status}` + (resultData?.details ? ` Details: ${JSON.stringify(resultData.details)}` : ''));
          throw new Error(errorMessage);
        }
        
        // result is now resultData from the successfully parsed JSON
        debugLog("Validation result received:", resultData, 'success');
        validationResults = resultData; // resultData has .success, not .isValid from API
        displayValidationResults(resultData);
        const statusType = resultData.success ? 'success' : 'error'; // Use .success
        const statusMessage = resultData.success ? 
          'Validation successful' : 
          `Validation completed with ${resultData.errors?.length || 0} errors`;
        updateValidationStatus(statusMessage, statusType);

    } catch (error) {
        // This catch block now handles errors from parseCSVFile, validateLocally, fetch, or response.json()
        debugLog("Validation error in validateCsvData catch block:", error, 'error');
        updateValidationStatus(`Validation failed: ${error.message}`, 'error');
        showError(`CSV validation failed: ${error.message}`);
        validationResults = null; // Reset validation results on any failure in the try block
    }
}
  
  /**
   * Display validation results in the UI
   * @param {Object} results - Validation results from the API
   */
  function displayValidationResults(results) {
    if (!results) return;
    
    try {
      debugLog("Displaying validation results:", results, 'info');
      
      // Show the validation results section
      const resultsDiv = document.querySelector('.vespa-validation-results');
      if (resultsDiv) {
        resultsDiv.style.display = 'block';
      }
      
      // Update counts with null checks
      const totalRecordsEl = document.getElementById('total-records');
      const validRecordsEl = document.getElementById('valid-records');
      const errorCountEl = document.getElementById('error-count');
      
      if (totalRecordsEl) {
        totalRecordsEl.textContent = results.total || results.csvData?.length || 0;
      }
      
      if (validRecordsEl) {
        validRecordsEl.textContent = results.success ? // Use .success
          (results.rowCount || results.csvData?.length || 0) : 
          ((results.rowCount || results.csvData?.length || 0) - (results.errors?.length || 0));
      }
      
      if (errorCountEl) {
        errorCountEl.textContent = results.errors?.length || 0;
      }
      
      // Also update processing step summary if it exists
      const totalRecordsSummary = document.getElementById('total-records-summary');
      const validRecordsSummary = document.getElementById('valid-records-summary');
      
      if (totalRecordsSummary) {
        totalRecordsSummary.textContent = results.total || results.csvData?.length || 0;
      }
      
      if (validRecordsSummary) {
        validRecordsSummary.textContent = results.success ? // Use .success
          (results.rowCount || results.csvData?.length || 0) : 
          ((results.rowCount || results.csvData?.length || 0) - (results.errors?.length || 0));
      }
      
      // Display CSV preview if we're on the validation step
      if (document.querySelector('.vespa-preview-table')) {
        displayCsvPreview(results.csvData || []);
      }
      
      // Display errors if there are any and the container exists
      const errorsContainer = document.getElementById('validation-errors');
      if (errorsContainer) {
        displayValidationErrors(results.errors || []);
      }
    } catch (error) {
      debugLog("Error displaying validation results:", error, 'error');
      // Don't let display errors break the app flow
    }
  }
  
  /**
   * Display CSV preview data in the UI
   * @param {Array} csvData - Array of CSV data objects
   */
  function displayCsvPreview(csvData) {
    const tbody = document.querySelector('.vespa-preview-table tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (csvData && csvData.length > 0) {
      // Get field names based on upload type
      let fields = [];
      switch (uploadType) {
        case 'staff':
          fields = ['Title', 'First Name', 'Last Name', 'Email Address', 'Staff Type'];
          break;
        case 'student-onboard':
           fields = ['UPN', 'Firstname', 'Lastname', 'Student Email', 'Year Gp', 'Level', 'Tutors'];
          break;
        case 'student-ks4':
          fields = ['UPN', 'Student_Email', 'sub1', 'ex1', 'sub2', 'ex2', 'sub3', 'ex3'];
          break;
        case 'student-ks5': // Ensure this matches the headers in renderValidationStep for student-ks5
          fields = ['UPN', 'Student_Email', 'GCSE_Prior_Attainment', 'sub1', 'sub2', 'sub3'];
          break;
        default:
          fields = Object.keys(csvData[0] || {}).slice(0, 5); // Fallback to first 5 headers
      }
      
      // Create rows for first 5 records
      csvData.slice(0, 5).forEach((row, index) => {
        const tr = document.createElement('tr');
        
        // Add row number
        const tdNum = document.createElement('td');
        tdNum.textContent = index + 1;
        tr.appendChild(tdNum);
        
        // Add data cells
        fields.forEach(field => {
          const td = document.createElement('td');
          td.textContent = row[field] || '';
          tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
      });
      
      // Add ellipsis row if more records
      if (csvData.length > 5) {
        const trMore = document.createElement('tr');
        const tdMore = document.createElement('td');
        tdMore.colSpan = fields.length + 1;
        tdMore.className = 'vespa-placeholder';
        tdMore.textContent = `... and ${csvData.length - 5} more records`;
        trMore.appendChild(tdMore);
        tbody.appendChild(trMore);
      }
    } else {
      // No data
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = uploadType === 'staff' ? 6 : 8;
      td.className = 'vespa-placeholder';
      td.textContent = 'No data available';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }
  
  /**
   * Display validation errors in the UI
   * @param {Array} errors - Array of validation error objects
   */
  function displayValidationErrors(errors) {
    const errorsContainer = document.getElementById('validation-errors');
    if (!errorsContainer) return;
    
    errorsContainer.innerHTML = '';
    
    if (errors && errors.length > 0) {
      // Log the raw error data for debugging
      debugLog("Raw validation errors:", errors, 'warn');
      
      errors.forEach((error, index) => {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'vespa-error-item';
        
        // Try to extract data from various error formats
        // Sometimes we get raw strings, sometimes objects
        let errorType = 'Validation Error';
        let errorRow = '';
        let errorField = '';
        let errorMessage = '';
        let errorData = '';
        
        if (typeof error === 'string') {
          // Handle string errors
          errorMessage = error;
        } else {
          // Handle object errors with different possible structures
          errorRow = error.row || '';
          errorType = error.type || 'Validation Error';
          errorField = error.field || '';
          errorMessage = error.message || error.error || 'Unknown error';
          
          // If we have data that failed validation, show it
          if (error.data) {
            errorData = typeof error.data === 'object' ? 
              JSON.stringify(error.data) : error.data;
          }
        }
        
        // Special handling for 'unknown error' to give more context
        if (errorMessage === 'Unknown error' || !errorMessage) {
          errorMessage = `Unspecified validation error. This might be related to:
            <ul>
              <li>Staff Type format - must use commas between multiple types (e.g., "tut,sub" not "tut sub")</li>
              <li>Email format - must be a valid email address</li>
              <li>Missing required fields - First Name, Last Name, Email Address, Staff Type are required</li>
              <li>For KS5 Subjects: Unrecognized subject name or incorrect prefix.</li>
            </ul>
            Row ${errorRow || index + 1} in the preview table may contain the issue.`;
        }
        
        let errorContent = `
          <div class="vespa-error-title">Row ${errorRow || index + 1}: ${errorType}</div>
          <div class="vespa-error-details">
        `;
        
        if (errorField) {
          errorContent += `<div class="vespa-error-field">Field: ${errorField}</div>`;
        }
        // If error.column is present (from new subject validation), use it instead of/in addition to errorField
        // However, the new subject errors already populate 'field' with the column name.

        errorContent += `<div class="vespa-error-message">${errorMessage}</div>`;
        
        if (errorData) {
          errorContent += `<div class="vespa-error-data">Data: ${errorData}</div>`;
        }
        
        errorContent += '</div>';
        
        errorDiv.innerHTML = errorContent;
        errorsContainer.appendChild(errorDiv);
      });
    } else {
      // No errors
      const messageDiv = document.createElement('div');
      messageDiv.className = 'vespa-success-message';
      messageDiv.innerHTML = `<span style="color: #2e7d32">✓ No validation errors found</span>`;
      errorsContainer.appendChild(messageDiv);
    }
  }
  
  /**
   * Process the upload data
   * This function handles the actual upload/processing of the validated data
   */
  async function processUploadData() { // Changed to async
    debugLog("Starting data processing (Background Job)", null, 'info');

    // Safety checks
    if (!validationResults || !validationResults.csvData) {
      showError('Please validate your data first, or no valid data to process.');
      debugLog("ProcessUploadData: No validationResults or validationResults.csvData", validationResults, 'error');
      return;
    }

    let filteredData = [];
    let endpointPath = '';
    let runCalculators = false; // Default

    // Determine endpoint and filter data based on uploadType
    switch (uploadType) {
      case 'staff':
        endpointPath = 'staff/process';
        filteredData = validationResults.csvData.filter(row => {
          const email = row && row['Email Address'] ? row['Email Address'].trim() : '';
          const firstName = row && row['First Name'] ? row['First Name'].trim() : '';
          const lastName = row && row['Last Name'] ? row['Last Name'].trim() : '';
          const staffType = row && row['Staff Type'] ? row['Staff Type'].trim() : '';
          return email && (firstName || lastName) && staffType;
        });
        break;
      case 'student-onboard':
        endpointPath = 'students/onboard/process';
        filteredData = validationResults.csvData.filter(row => { // Basic check, backend will do more
          const upn = row && row['UPN'] ? row['UPN'].trim() : '';
          const email = row && row['Student Email'] ? row['Student Email'].trim() : '';
          return upn || email; 
        });
        break;
      case 'student-ks4':
        endpointPath = 'students/ks4-subjects/process';
        filteredData = validationResults.csvData.filter(row => {
          const upn = row && row['UPN'] ? row['UPN'].trim() : '';
          const email = row && row['Student_Email'] ? row['Student_Email'].trim() : '';
          return upn || email;
        });
        runCalculators = document.getElementById('run-calculators')?.checked ?? false;
        break;
      case 'student-ks5':
        endpointPath = 'students/ks5-subjects/process';
        filteredData = validationResults.csvData.filter(row => {
          const upn = row && row['UPN'] ? row['UPN'].trim() : '';
          const email = row && row['Student_Email'] ? row['Student_Email'].trim() : '';
          return upn || email;
        });
        runCalculators = document.getElementById('run-calculators')?.checked ?? false;
        break;
      default:
        showError('Invalid upload type for processing.');
        debugLog(`ProcessUploadData: Invalid uploadType "${uploadType}"`, null, 'error');
        return;
    }

    if (filteredData.length === 0) {
      showError('No valid data rows to process after filtering. Please check your CSV content for essential identifiers.');
      debugLog(`ProcessUploadData: No valid data after filtering for ${uploadType}.`, validationResults.csvData, 'warn');
      return;
    }

    // Get processing options
    const sendNotifications = document.getElementById('send-notifications')?.checked ?? true;
    const notificationEmail = document.getElementById('notification-email')?.value || userContext?.userEmail || '';

    const currentProcessingOptions = {
      sendNotifications: sendNotifications,
      notificationEmail: notificationEmail,
      percentile: selectedPercentile // Add selected percentile here
    };

    if (uploadType === 'student-ks4' || uploadType === 'student-ks5') {
        currentProcessingOptions.runCalculators = runCalculators;
    }

    // Add universal password if set for student uploads
    if ((uploadType === 'student-onboard' || uploadType === 'student-ks4' || uploadType === 'student-ks5') && useUniversalPassword && universalPassword) {
        currentProcessingOptions.universalPassword = universalPassword;
        currentProcessingOptions.useUniversalPassword = true;
        debugLog("Universal password will be used for this upload", null, 'info');
    }

    // Update UI to show processing request is being submitted
    updateStatusDisplay('Submitting your data for background processing... Please wait.', 'processing', true);

    const processButton = document.getElementById('process-button') || document.getElementById('vespa-next-button');
    const prevButton = document.getElementById('vespa-prev-button');
    const nextButton = document.getElementById('vespa-next-button');

    if (processButton) {
      processButton.disabled = true;
      processButton.textContent = 'Submitting...';
    }
    if (prevButton) prevButton.disabled = true;
    if (nextButton && nextButton !== processButton) nextButton.disabled = true;

    isProcessing = true;

    // Determine the context: either the logged-in user or the emulated school/admins
    const isEmulating = VESPA_UPLOAD_CONFIG.userRole === SUPER_USER_ROLE_ID && selectedSchool && selectedSchool.emulatedAdmins;

    // Check if we have a valid userId
    if (!userContext?.userId) {
        showError('User context not available. Please refresh the page and try again.');
        debugLog("ERROR: No user ID available in context", userContext, 'error');
        
        // Reset processing state
        isProcessing = false;
        if (processButton) {
            processButton.disabled = false;
            processButton.textContent = 'Submit for Processing';
        }
        if (prevButton) prevButton.disabled = false;
        if (nextButton && nextButton !== processButton) nextButton.disabled = false;
        
        return; // Exit early - don't proceed without a valid user ID
    }
    
    const uploaderContextForAPI = {
        // Always include userId at the top level for the API
        userId: userContext.userId,
        userEmail: userContext.userEmail || '',
        isEmulating: isEmulating,
        loggedInUser: { // Always send the actual logged-in user
            userId: userContext.userId,
            userEmail: userContext.userEmail || '',
            userRole: userContext.userRole || null,
            customerId: userContext.customerId || null
        },
        emulatedSchool: isEmulating ? {
            customerId: selectedSchool.id, // object_2 ID
            customerName: selectedSchool.name,
            admins: selectedSchool.emulatedAdmins // The array of admin objects
        } : null,
        // Pass the direct customer ID when not emulating
        customerId: !isEmulating ? userContext?.customerId : null
    };
    
    debugLog("Uploader context prepared for API:", uploaderContextForAPI);

    debugLog(`Data to be sent to /api/${endpointPath}:`, {
      csvData: filteredData,
      options: currentProcessingOptions,
      context: uploaderContextForAPI
    });

    try {
      let baseUrl = API_BASE_URL;
      if (!baseUrl.endsWith('/')) {
          baseUrl += '/';
      }
      const constructedUrl = `${baseUrl}${endpointPath}`;
      debugLog("API call to enqueue job: POST " + constructedUrl);

      const response = await $.ajax({
          url: constructedUrl,
          type: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({
              csvData: filteredData,
              options: currentProcessingOptions,
              context: uploaderContextForAPI // Send the full context object
          }),
          xhrFields: { withCredentials: true }
      });

      debugLog("Job Enqueue Response:", response, 'success');

      if (response.success && response.jobId) {
        // Job successfully queued
        updateStatusDisplay(`Upload accepted (Job ID: ${response.jobId}). It is now processing in the background. You will receive an email summary. This window can be closed.`, 'success', false);
        showSuccess("Your upload has been queued successfully! You'll receive an email with the results.");
        
        processingResults = {
            jobId: response.jobId,
            status: 'queued',
            message: response.message,
            total: filteredData.length,
            notificationEmail: notificationEmail // Add this line
        };
        
        if (processButton) {
            processButton.textContent = 'Processing in Background';
            processButton.disabled = true; 
        }
        setTimeout(() => {
            currentStep++; 
            renderStep(currentStep);
        }, 2500);

      } else {
        throw new Error(response.message || 'Failed to queue the upload job. Please try again.');
      }

    } catch (error) {
      const errorMessage = error.responseJSON?.message || error.responseText || error.message || "An unknown error occurred while submitting your upload.";
      debugLog("Error Enqueuing Job:", { error, errorMessage }, 'error');
      updateStatusDisplay(`Submission failed: ${errorMessage}`, 'error', false);
      showError(`Failed to submit your upload: ${errorMessage}`);
      
      processingResults = { 
          status: 'submission_failed',
          message: errorMessage,
          errors: [{ message: errorMessage}] 
      };
      
      isProcessing = false;
      if (processButton) {
          processButton.disabled = false;
          processButton.textContent = 'Retry Submission';
      }
      if (prevButton) prevButton.disabled = false;
      if (nextButton && nextButton !== processButton) nextButton.disabled = false;
       setTimeout(() => {
          currentStep++; 
          renderStep(currentStep);
      }, 1500);
    }
  }
  
  /**
   * Show the template modal
   */
  function showTemplateModal() {
    const modalContent = `
      <div class="vespa-templates-container">
        <div class="vespa-template-card">
          <h3>Staff Upload Template</h3>
          <div class="vespa-template-preview">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Email Address</th>
                  <th>Staff Type</th>
                  <th>Year Group</th>
                  <th>Group</th>
                  <th>Faculty/Dept</th>
                  <th>Subject</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Mr</td>
                  <td>John</td>
                  <td>Smith</td>
                  <td>jsmith@school.edu</td>
                  <td>tut,sub</td>
                  <td>12</td>
                  <td>12A</td>
                  <td>Science</td>
                  <td>Physics</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="vespa-template-info">
            <strong>Staff Type codes:</strong>
            <ul>
              <li><code>admin</code> - Staff Administrator</li>
              <li><code>tut</code> - Tutor</li>
              <li><code>sub</code> - Subject Teacher</li>
              <li><code>hoy</code> - Head of Year</li>
              <li><code>hod</code> - Head of Department</li>
              <li><code>gen</code> - General Staff</li>
            </ul>
            <p>Multiple staff types can be assigned using comma-separated values.</p>
          </div>
          <button class="vespa-button primary" id="download-staff-modal">Download Staff Template</button>
        </div>
        
        <div class="vespa-template-card">
          <h3>Student Upload Template</h3>
          <div class="vespa-template-preview">
            <table>
              <thead>
                <tr>
                  <th>Firstname</th>
                  <th>Lastname</th>
                  <th>Student Email</th>
                  <th>Group</th>
                  <th>Year Gp</th>
                  <th>Level</th>
                  <th>Tutor</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Alex</td>
                  <td>Johnson</td>
                  <td>ajohnson@school.edu</td>
                  <td>12B</td>
                  <td>12</td>
                  <td>Level 3</td>
                  <td>jsmith@school.edu</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="vespa-template-info">
            <strong>Important notes:</strong>
            <ul>
              <li>Level must be "Level 2" or "Level 3"</li>
              <li>Tutor field must contain valid email address(es) of existing tutors</li>
              <li>GCSE fields accept values from 1-9 for new grading or A*-G for old grading</li>
              <li>Up to 5 subjects can be included (Subject1, Subject2, etc.)</li>
            </ul>
          </div>
          <button class="vespa-button primary" id="download-student-modal">Download Student Template</button>
        </div>
      </div>
    `;
    
    // Show the modal
    showModal('CSV Templates', modalContent);
    
    // Add event listeners directly (after modal is created)
    setTimeout(() => {
      document.getElementById('download-staff-modal')?.addEventListener('click', () => {
        const originalUploadType = uploadType;
        uploadType = 'staff';
        downloadTemplateFile();
        uploadType = originalUploadType;
      });
      
      document.getElementById('download-student-modal')?.addEventListener('click', () => {
        const originalUploadType = uploadType;
        uploadType = 'student';
        downloadTemplateFile();
        uploadType = originalUploadType;
      });
    }, 100);
  }
  
  /**
   * Download the results as a CSV file
   */
  function downloadResults() {
    if (!processingResults) {
      showError('No processing results available');
      return;
    }
    
    alert('Results download functionality will be implemented here');
    // This would typically make an API call to get the results in CSV format
  }

  /**
 * VESPA Upload Bridge - Events and Navigation
 * 
 * This file contains event handlers and navigation functions
 * for the upload wizard interface.
 */

/**
 * Go to the previous step
 */
function prevStep() {
    if (currentStep > 1) {
      currentStep--;
      renderStep(currentStep);
    }
  }
  
  /**
   * Go to the next step
   * This function validates the current step before proceeding
   */
  function nextStep() {
    if (!VESPA_UPLOAD_CONFIG) {
      showError('Configuration not available. Please refresh the page and try again.');
      return;
    }
    
    const isSuperUser = VESPA_UPLOAD_CONFIG.userRole === SUPER_USER_ROLE_ID; // <-- Modified
    const maxSteps = isSuperUser ? 6 : 5;
    
    // Validate current step
    if (!validateCurrentStep()) {
      return;
    }
    
    // Handle special upload types on step 1
    if (currentStep === 1) {
      if (uploadType === 'new-customer') {
        debugLog("Proceeding to New Customer Creation form", null, 'info');
        showNewCustomerForm();
        return;
      } else if (uploadType === 'renew-customer') {
        debugLog("Loading Renewal Management System", null, 'info');
        loadRenewalModule();
        return;
      } else if (uploadType === 'ks5-workflow') {
        debugLog("Proceeding to KS5 Workflow interface", null, 'info');
        showKS5WorkflowInterface();
        return;
      } else if (uploadType === 'academic-data') {
        debugLog("Proceeding to Academic Data Management interface", null, 'info');
        showAcademicDataInterface();
        return;
      } else if (uploadType === 'account-management') {
        debugLog("Loading Account Management System", null, 'info');
        loadAccountManagementModule();
        return;
      }
    }
    
    // Handle manual entry navigation
    if (window.uploadMethod === 'manual') {
      // Check if we're at the step where manual entry form should be shown
      const uploadStepNumber = isSuperUser ? 3 : 2;
      
      // If we're moving TO the upload step (from type selection or school selection)
      if (currentStep < uploadStepNumber) {
        currentStep = uploadStepNumber;
        renderStep(currentStep);
        return;
      }
      
      // If we're already at the manual entry form, don't allow moving to validation/processing
      if (currentStep === uploadStepNumber) {
        // Don't show error - user should use the form buttons
        return;
      }
    }
    
    // Handle special actions for certain steps
    if ((isSuperUser && currentStep === 4) || (!isSuperUser && currentStep === 3)) {
      // Validation step
      validateCsvData();
      return;
    } else if ((isSuperUser && currentStep === 5) || (!isSuperUser && currentStep === 4)) {
      // Processing step
      processUploadData();
      return;
    }
    
    // Proceed to the next step
    if (currentStep < maxSteps) {
      currentStep++;
      renderStep(currentStep);
    }
  }
  
  /**
 * Bind events for each step after rendering
 * This ensures event handlers are properly attached
 */
function bindStepEvents() {
  debugLog("Binding events for step " + currentStep);
  
  // Use event delegation for dynamic elements
  const contentDiv = document.querySelector('.vespa-upload-content');
  if (!contentDiv) {
    debugLog("Could not find content div for event binding", null, 'error');
    return;
  }
  
  // Determine which step we're on
  const isSuperUser = VESPA_UPLOAD_CONFIG?.userRole === SUPER_USER_ROLE_ID; // <-- Modified
  const contentStep = !isSuperUser && currentStep > 1 ? currentStep + 1 : currentStep;
  
  debugLog(`Binding events for content step ${contentStep}, isSuperUser: ${isSuperUser}`);
  
  switch (contentStep) {
    case 1: // Select upload type
      const uploadTypeRadios = document.querySelectorAll('input[name="upload-type"]');
      const subTypesContainer = document.getElementById('student-subject-subtypes-container');
      const uploadMethodContainer = document.getElementById('upload-method-container');

      uploadTypeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
          // Handle staff or student selection - show upload method choice
          if ((radio.value === 'staff' || radio.value === 'student-onboard') && radio.checked) {
            if (uploadMethodContainer) {
              uploadMethodContainer.style.display = 'block';
            }
            uploadType = radio.value;
            return;
          }
          
          // Hide upload method choice for other selections
          if (uploadMethodContainer) {
            uploadMethodContainer.style.display = 'none';
          }
          
          // Handle KS5 workflow selection
          if (radio.value === 'ks5-workflow' && radio.checked) {
            debugLog("KS5 Workflow selected", null, 'info');
            // Don't show the interface immediately, just set the upload type
            uploadType = 'ks5-workflow';
            return;
          }
          
          // Handle academic-data selection (mid-year updates)
          if (radio.value === 'academic-data' && radio.checked) {
            debugLog("Academic Data Management selected", null, 'info');
            // Don't show the interface immediately, just set the upload type
            uploadType = 'academic-data';
            return;
          }
          
          // For other types, just set the upload type
          uploadType = radio.value;
        });
      });
      // Trigger change once on load to set initial state
      if (document.getElementById('upload-student-subjects')?.checked) {
        if (subTypesContainer) subTypesContainer.style.display = 'block';
      } else {
        if (subTypesContainer) subTypesContainer.style.display = 'none';
      }
      debugLog("Step 1: Event listeners for upload type and sub-type visibility attached.");
      break;
      
    case 2: // Select school (Super User Only)
      // This case is only hit if isSuperUser is true due to contentStep calculation
      debugLog("Binding events for Super User - School Selection (contentStep 2)");
      fetchVespaCustomers(); // Populate dropdown when step is rendered

      const schoolSelect = document.getElementById('school-select');
      const schoolSearchInput = document.getElementById('school-search-input');
      const emulationDetailsContainer = document.getElementById('emulation-details-container');
      const schoolDetailsContainer = document.getElementById('school-details');
      
      if (schoolSearchInput && schoolSelect) {
        schoolSearchInput.addEventListener('input', () => {
          const searchTerm = schoolSearchInput.value.toLowerCase();
          const options = schoolSelect.options;
          for (let i = 0; i < options.length; i++) {
            const option = options[i];
            // Always show the placeholder "-- Select a school --" option
            if (option.value === "") {
                option.style.display = "";
                continue;
            }
            const optionText = option.text.toLowerCase();
            if (optionText.includes(searchTerm)) {
              option.style.display = '';
            } else {
              option.style.display = 'none';
            }
          }
        });
      }

      if (schoolSelect) {
        debugLog("Found school select, attaching event for emulation details");
        schoolSelect.addEventListener('change', () => {
          const selectedOption = schoolSelect.options[schoolSelect.selectedIndex];
          if (selectedOption.value) {
            selectedSchool = {
              id: selectedOption.value, // This is object_2 ID
              name: selectedOption.dataset.name,
              schoolIdText: selectedOption.dataset.schoolIdText || '' // Text school ID
              // emulatedAdminEmail and emulatedAdminUserId will be populated by fetchEmulationAdminDetails
            };
            debugLog("School selected for emulation:", selectedSchool);
            
            document.getElementById('customer-name-display').textContent = selectedSchool.name;
            document.getElementById('customer-id-display').textContent = selectedSchool.id;
            if (schoolDetailsContainer) schoolDetailsContainer.style.display = 'block';

            document.getElementById('emulation-school-name').textContent = `Selected Customer: ${selectedSchool.name}`;
            document.getElementById('emulation-admin-email').textContent = 'Fetching admin details...';
            if (emulationDetailsContainer) emulationDetailsContainer.style.display = 'block';
            
            fetchEmulationAdminDetails(selectedSchool.id);
          } else {
            selectedSchool = null; // Clear selection
            document.getElementById('emulation-status-bar').style.display = 'none'; // Hide status bar
            if (schoolDetailsContainer) schoolDetailsContainer.style.display = 'none';
            if (emulationDetailsContainer) emulationDetailsContainer.style.display = 'none';
            debugLog("School selection cleared for emulation.");
          }
        });
      } else {
        debugLog("School select element not found in contentStep 2", null, "warn");
      }
      break;
      
    case 3: // Upload CSV or Manual Entry
      // Check if this is manual entry mode
      if (window.uploadMethod === 'manual') {
        // Bind manual entry form handlers
        const staffForm = document.getElementById('staff-manual-entry-form');
        const studentForm = document.getElementById('student-manual-entry-form');
        
        if (staffForm) {
          debugLog("Found staff manual entry form, attaching submit handler");
          staffForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleManualEntrySubmit('staff');
          });
        }
        
        if (studentForm) {
          debugLog("Found student manual entry form, attaching submit handler");
          studentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleManualEntrySubmit('student');
          });
        }
      } else {
        // CSV upload mode
        const downloadBtn = document.getElementById('download-template');
        const fileInput = document.getElementById('csv-file');
        
        if (downloadBtn) {
          debugLog("Found download button, attaching event");
          downloadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            debugLog("Download template button clicked");
            downloadTemplateFile();
          });
        }
        
        if (fileInput) {
          debugLog("Found file input, attaching event");
          fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
              // Store the file in the global variable
              selectedFile = file;
              debugLog(`File selected and stored globally: ${file.name} (${file.size} bytes)`);
              const fileNameElement = document.createElement('div');
              fileNameElement.className = 'vespa-file-selected';
              fileNameElement.innerHTML = '<strong>Selected file:</strong> ' + file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
              fileNameElement.style.marginTop = '10px';
              fileNameElement.style.padding = '8px';
              fileNameElement.style.backgroundColor = '#f0f7ff';
              fileNameElement.style.borderRadius = '4px';
              
              // Replace existing notification or add new one
              const existingNotification = document.querySelector('.vespa-file-selected');
              if (existingNotification) {
                existingNotification.parentNode.replaceChild(fileNameElement, existingNotification);
              } else {
                document.querySelector('.vespa-file-input').after(fileNameElement);
              }
            }
          });
        }
      }
      break;
      
    case 4: // Validate Data
      const validateButton = document.getElementById('validate-button');
      if (validateButton) {
        debugLog("Found validate button, attaching event");
        validateButton.addEventListener('click', (e) => {
          e.preventDefault();
          debugLog("Validate button clicked");
          validateCsvData();
        });
      }
      
      // Add event handler for the "Validate" button in the actions area (bottom right)
      const nextStepValidateButton = document.getElementById('vespa-next-button');
      if (nextStepValidateButton && nextStepValidateButton.textContent === 'Validate') {
        debugLog("Found next step validate button, attaching event");
        nextStepValidateButton.addEventListener('click', (e) => { 
          e.preventDefault();
          debugLog("Next step validate button clicked");
          // If validation was successful, allow moving to the next step
          if (validationResults && validationResults.success) { // Use .success
            debugLog("Validation was successful, proceeding to next step");
            currentStep++; 
            renderStep(currentStep); 
          } else {
            // If not validated yet or validation failed, run validation
            validateCsvData();
          }
        });
      }
      break;
      
    case 5: // Process Upload
      const processButton = document.getElementById('process-button');
      if (processButton) {
        debugLog("Found process button, attaching event");
        processButton.addEventListener('click', (e) => {
          e.preventDefault();
          debugLog("Process button clicked");
          processUploadData();
        });
      }
      break;
      
    case 6: // Results
      const downloadResultsBtn = document.getElementById('download-results');
      const newUploadBtn = document.getElementById('start-new-upload');
      
      if (downloadResultsBtn) {
        debugLog("Found download results button, attaching event");
        downloadResultsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          downloadResults();
        });
      }
      
      if (newUploadBtn) {
        debugLog("Found new upload button, attaching event");
        newUploadBtn.addEventListener('click', (e) => {
          e.preventDefault();

          // Hide the emulation status bar
          const statusBar = document.getElementById('emulation-status-bar');
          if (statusBar) {
            statusBar.style.display = 'none';
            statusBar.innerHTML = '';
          }
          
          // Reset the wizard and go back to step 1
          currentStep = 1;
          uploadType = null;
          validationResults = null;
          processingResults = null;
          selectedSchool = null;
          isProcessing = false;
          
          renderStep(1);
        });
      }
      break;
  }
  
  debugLog("Event binding complete for step " + contentStep);
}
  
  /**
   * Search for schools
   * This function would typically make an API call to search for schools
   * For now, it just uses mock data
   * @param {string} searchTerm - The search term
   */
  function searchSchools(searchTerm) {
    console.log('[VESPA Upload] Searching for schools:', searchTerm);
    
    // In a real implementation, this would make an API call
    // For now, populate with dummy data
    const schoolSelect = document.getElementById('school-select');
    if (!schoolSelect) return;
    
    schoolSelect.innerHTML = '<option value="">-- Select a school --</option>';
    
    // Mock data
    const schools = [
      { id: 'school1', name: 'Sample Academy', email: 'admin@sampleacademy.edu', type: 'Gold' },
      { id: 'school2', name: 'Test High School', email: 'admin@testhigh.edu', type: 'Silver' }
    ];
    
    schools.forEach(school => {
      const option = document.createElement('option');
      option.value = school.id;
      option.text = school.name;
      option.dataset.email = school.email;
      option.dataset.type = school.type;
      schoolSelect.appendChild(option);
    });
    
    showSuccess('School search completed');
  }
  
  /**
   * Load dropdown options for student manual entry form
   */
  async function loadStudentFormOptions() {
    try {
      // Check for emulation state first
      const emulationState = getEmulationState();
      let customerId = null;
      
      if (emulationState && emulationState.school) {
        customerId = emulationState.school.id;
        debugLog("Using emulated customer ID for form options", { customerId, school: emulationState.school.name });
      } else if (selectedSchool?.id) {
        customerId = selectedSchool.id;
        debugLog("Using selected school ID for form options", { customerId });
      } else if (userContext?.customerId) {
        customerId = userContext.customerId;
        debugLog("Using user context customer ID for form options", { customerId });
      }
      
      if (!customerId) {
        debugLog("No customer ID available for loading form options", { 
          emulationState: emulationState, 
          selectedSchool: selectedSchool, 
          userContext: userContext 
        }, 'error');
        
        // Update dropdowns to show error state
        const tutorsSelect = document.getElementById('student-tutors');
        const hoySelect = document.getElementById('student-hoy');
        const teachersSelect = document.getElementById('student-subject-teachers');
        
        if (tutorsSelect) tutorsSelect.innerHTML = '<option value="">Error: Unable to load tutors</option>';
        if (hoySelect) hoySelect.innerHTML = '<option value="">Error: Unable to load heads of year</option>';
        if (teachersSelect) teachersSelect.innerHTML = '<option value="">Error: Unable to load teachers</option>';
        
        return;
      }
      
      // Fetch options from API
      const response = await $.ajax({
        url: `${API_BASE_URL}validation/get-form-options?customerId=${customerId}`,
        type: 'GET',
        xhrFields: { withCredentials: true }
      });
      
      if (response.success && response.options) {
        debugLog("Form options received from API:", response.options);
        
        // Populate tutors dropdown
        const tutorsSelect = document.getElementById('student-tutors');
        if (tutorsSelect && response.options.tutors) {
          tutorsSelect.innerHTML = '<option value="">-- None Selected --</option>';
          response.options.tutors.forEach(tutor => {
            debugLog("Processing tutor:", tutor);
            const option = document.createElement('option');
            option.value = tutor.email || '';
            option.textContent = tutor.name || tutor.email || 'Unknown';
            tutorsSelect.appendChild(option);
          });
        }
        
        // Populate heads of year dropdown
        const hoySelect = document.getElementById('student-hoy');
        if (hoySelect && response.options.headsOfYear) {
          hoySelect.innerHTML = '<option value="">-- None Selected --</option>';
          response.options.headsOfYear.forEach(hoy => {
            debugLog("Processing head of year:", hoy);
            const option = document.createElement('option');
            option.value = hoy.email || '';
            option.textContent = hoy.name || hoy.email || 'Unknown';
            hoySelect.appendChild(option);
          });
        }
        
        // Populate subject teachers dropdown
        const teachersSelect = document.getElementById('student-subject-teachers');
        if (teachersSelect && response.options.subjectTeachers) {
          teachersSelect.innerHTML = '<option value="">-- None Selected --</option>';
          response.options.subjectTeachers.forEach(teacher => {
            debugLog("Processing subject teacher:", teacher);
            const option = document.createElement('option');
            option.value = teacher.email || '';
            option.textContent = teacher.subject ? `${teacher.name || teacher.email || 'Unknown'} (${teacher.subject})` : (teacher.name || teacher.email || 'Unknown');
            teachersSelect.appendChild(option);
          });
        }
      }
    } catch (error) {
      debugLog("Error loading form options:", error, 'error');
      showError('Failed to load dropdown options. Please refresh and try again.');
    }
  }
  
  /**
   * Handle manual entry form submission
   */
  async function handleManualEntrySubmit(type) {
    debugLog(`Handling manual entry submission for ${type}`, null, 'info');
    
    const form = document.getElementById(`${type}-manual-entry-form`);
    if (!form) return;
    
    // Disable submit button during processing
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing...';
    }
    
    try {
      let csvData = {};
      
      if (type === 'staff') {
        // Get selected staff types
        const selectedTypes = Array.from(document.getElementById('staff-types').selectedOptions)
          .map(opt => opt.value)
          .join(',');
        
        csvData = {
          'Title': form.title.value.trim(),
          'First Name': form.firstName.value.trim(),
          'Last Name': form.lastName.value.trim(),
          'Email Address': form.email.value.trim(),
          'Staff Type': selectedTypes,
          'Year Group': form.yearGroup.value || '',
          'Group': form.group.value.trim() || '',
          'Faculty/Dept': form.faculty.value.trim() || '',
          'Subject': form.subject.value.trim() || ''
        };
        
      } else if (type === 'student') {
        // Get selected tutors (filter out empty values)
        const selectedTutors = Array.from(document.getElementById('student-tutors').selectedOptions)
          .map(opt => opt.value)
          .filter(val => val)  // Filter out empty values
          .join(',');
        
        // Get selected subject teachers (filter out empty values)
        const selectedTeachers = Array.from(document.getElementById('student-subject-teachers').selectedOptions)
          .map(opt => opt.value)
          .filter(val => val)  // Filter out empty values
          .join(',');
        
        // Format DOB if provided
        let dobFormatted = '';
        if (form.dob.value) {
          const date = new Date(form.dob.value);
          dobFormatted = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
        }
        
        csvData = {
          'ULN': form.uln.value.trim(),
          'UPN': form.upn.value.trim(), // Required field
          'Firstname': form.firstName.value.trim(),
          'Lastname': form.lastName.value.trim(),
          'Student Email': form.email.value.trim(),
          'Gender': form.gender.value || '',
          'DOB': dobFormatted,
          'Group': form.group.value.trim() || '',
          'Year Gp': form.yearGroup.value,
          'Level': form.level.value,
          'Tutors': selectedTutors || '',
          'Head of Year': form.headOfYear.value || '',
          'Subject Teachers': selectedTeachers || ''
        };
      }
      
      // Prepare the data as if it's a single-row CSV
      const endpoint = type === 'staff' ? 'staff/process' : 'students/onboard/process';
      
      // Build the context object similar to processUploadData function
      const isEmulating = VESPA_UPLOAD_CONFIG.userRole === SUPER_USER_ROLE_ID && (selectedSchool?.id || getEmulationState()?.school?.id);
      const emulationState = getEmulationState();
      
      const uploaderContextForAPI = {
        // Always include userId at the top level for the API
        userId: userContext?.userId,
        userEmail: userContext?.userEmail || '',
        isEmulating: !!isEmulating, // Force to boolean
        loggedInUser: { // Always send the actual logged-in user
          userId: userContext?.userId,
          userEmail: userContext?.userEmail || '',
          userRole: userContext?.userRole || null,
          customerId: userContext?.customerId || null
        },
        emulatedSchool: isEmulating ? {
          customerId: selectedSchool?.id || emulationState?.school?.id,
          customerName: selectedSchool?.name || emulationState?.school?.name,
          admins: selectedSchool?.emulatedAdmins || emulationState?.admins || [] // The array of admin objects
        } : null,
        // Pass the direct customer ID when not emulating
        customerId: !isEmulating ? userContext?.customerId : null
      };
      
      debugLog("Manual entry context prepared for API:", uploaderContextForAPI);
      
      const response = await $.ajax({
        url: `${API_BASE_URL}${endpoint}`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          csvData: [csvData], // Send as array with single item
          options: {
            sendNotifications: true,
            notificationEmail: userContext?.userEmail || '',
            percentile: selectedPercentile,
            manualEntry: true // Flag to indicate manual entry
          },
          context: uploaderContextForAPI
        }),
        xhrFields: { withCredentials: true }
      });
      
      if (response.success) {
        // Show success message
        showSuccess(`${type === 'staff' ? 'Staff member' : 'Student'} added successfully!`);
        
        // Show results with "Add Another" option
        showManualEntryResults(type, csvData, true);
        
        // Clear the form
        form.reset();
        
      } else {
        throw new Error(response.message || 'Failed to add record');
      }
      
    } catch (error) {
      debugLog(`Error in manual entry submission:`, error, 'error');
      showError(`Failed to add ${type}: ${error.responseJSON?.message || error.message}`);
    } finally {
      // Re-enable submit button
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = `Add ${type === 'staff' ? 'Staff Member' : 'Student'}`;
      }
    }
  }
  
  /**
   * Show results after manual entry
   */
  function showManualEntryResults(type, data, success) {
    const resultsDiv = document.getElementById('manual-entry-results');
    if (!resultsDiv) return;
    
    resultsDiv.style.display = 'block';
    
    const name = type === 'staff' 
      ? `${data['First Name']} ${data['Last Name']}` 
      : `${data['Firstname']} ${data['Lastname']}`;
    
    resultsDiv.innerHTML = `
      <div class="vespa-results-status ${success ? 'success' : 'error'}">
        <div class="vespa-status-icon">${success ? '✅' : '❌'}</div>
        <div class="vespa-status-text">${success ? 'Successfully Added' : 'Failed to Add'}: ${name}</div>
      </div>
      
      <div class="vespa-results-actions" style="margin-top: 20px;">
        <button class="vespa-button primary" onclick="continueManualEntry('${type}')">
          Add Another ${type === 'staff' ? 'Staff Member' : 'Student'}
        </button>
        <button class="vespa-button secondary" onclick="finishManualEntry()">
          Finish
        </button>
      </div>
    `;
  }
  
  /**
   * Continue with another manual entry
   */
  window.continueManualEntry = function(type) {
    // Hide results and show form again
    const resultsDiv = document.getElementById('manual-entry-results');
    if (resultsDiv) resultsDiv.style.display = 'none';
    
    // Clear form and focus on first field
    const form = document.getElementById(`${type}-manual-entry-form`);
    if (form) {
      form.reset();
      const firstInput = form.querySelector('input');
      if (firstInput) firstInput.focus();
    }
    
    // Reload dropdown options for student form
    if (type === 'student') {
      loadStudentFormOptions();
    }
  }
  
  /**
   * Finish manual entry and go to results
   */
  window.finishManualEntry = function() {
    // Move to the results step
    currentStep = VESPA_UPLOAD_CONFIG.userRole === SUPER_USER_ROLE_ID ? 6 : 5;
    processingResults = {
      status: 'completed',
      message: 'Manual entry completed successfully',
      finalMessage: 'All manually entered records have been processed.'
    };
    renderStep(currentStep);
  }
  
  /**
   * Reset manual entry form
   */
  window.resetManualEntryForm = function(type) {
    const form = document.getElementById(`${type}-manual-entry-form`);
    if (form) {
      form.reset();
      const resultsDiv = document.getElementById('manual-entry-results');
      if (resultsDiv) resultsDiv.style.display = 'none';
    }
  }

  // === IMPORTANT: Expose functions to global scope ===
  // This is critical for the system to be able to call our functions
  window.initializeUploadBridge = initializeUploadBridge;
  window.showTemplateModal = showTemplateModal;
  window.downloadTemplate = downloadTemplateFile;
  window.showModal = showModal;
  window.closeModal = closeModal;
  window.showEmulationSettingsModal = showEmulationSettingsModal;
  window.showSelfRegistrationModal = showSelfRegistrationModal;
  window.generateRegistrationLink = generateRegistrationLink;
  // Note: viewQRCode, downloadQRFromView, and regenerateQRLink are assigned to window after their definitions
  
  // Academic Data Management functions
  window.showAcademicDataInterface = showAcademicDataInterface;
  window.showAcademicTab = showAcademicTab;
  window.backToUploadWizard = backToUploadWizard;
  window.showGCSECalculator = showGCSECalculator;
  window.showKS5Upload = showKS5Upload;
  window.showGCSEPriorAttainmentCalculator = showGCSEPriorAttainmentCalculator;
  window.handleGCSEFileUpload = handleGCSEFileUpload;
  window.downloadPriorAttainmentResults = downloadPriorAttainmentResults;
  
  // Customer Management and Lead functions
  window.handleFlowTypeChange = handleFlowTypeChange;
  // handleAccountTypeChange is defined directly on window later
  // handleCycleModeChange is defined directly on window later
  // calculateTotal is defined directly on window later
  // checkEmailAvailability is defined directly on window later
  window.loadCustomDataTable = loadCustomDataTable;
  window.showLeadForm = showLeadForm;
  window.handleProductChange = handleProductChange;
  window.showLoadFromLeadsModal = showLoadFromLeadsModal;
  window.closeLeadsModal = closeLeadsModal;
  window.loadLeadData = loadLeadData;
  // window.selectLead = selectLead; // Commented out - selectLead is defined later as window.selectLead
  // window.filterLeads = filterLeads; // Commented out - filterLeads is defined later as window.filterLeads
  // window.resetLeadForm = resetLeadForm; // Commented out - resetLeadForm is defined later as window.resetLeadForm
  
  // KS5 Workflow functions
  window.showKS5WorkflowInterface = showKS5WorkflowInterface;
  window.downloadGCSETemplate = downloadGCSETemplate;
  window.downloadKS5Template = downloadKS5Template;
  window.proceedToKS5Upload = proceedToKS5Upload;
  
  // Add an initialization complete flag
  window.VESPA_UPLOAD_BRIDGE_INITIALIZED = true;
  
  // Log initialization completion
  debugLog("VESPA Upload Bridge script loaded and ready")

  /**
   * Update the general status display (e.g., during processing)
   * @param {string} message - Status message to display
   * @param {string} type - Status type (ready, processing, success, error, info)
   * @param {boolean} showSpinner - Whether to show a spinner icon (defaults to true for 'processing')
   */
  function updateStatusDisplay(message, type = 'info', showSpinner = undefined) {
    let statusDiv;
    // Try to find the status display within the current step's content
    // Adjusted logic for finding the correct status div
    const isSuperUser = VESPA_UPLOAD_CONFIG?.userRole === SUPER_USER_ROLE_ID; // <-- Modified
    const processingStepNumber = isSuperUser ? 5 : 4;
    const validationStepNumber = isSuperUser ? 4 : 3;

    if (currentStep === processingStepNumber) { 
      statusDiv = document.querySelector('.vespa-processing-status');
    } else if (currentStep === validationStepNumber) {
      statusDiv = document.querySelector('.vespa-validation-status');
    }
    
    // Fallback or if we need a more generic status update location later
    if (!statusDiv) {
      statusDiv = document.getElementById('general-status-display'); 
      if (!statusDiv) {
          const contentArea = document.querySelector('.vespa-upload-content');
          if (contentArea) {
              statusDiv = document.createElement('div');
              statusDiv.id = 'general-status-display';
              statusDiv.className = 'vespa-status-display-generic'; 
              // Prepend to current step's content if possible, or a general content area
              const currentStepContent = contentArea.querySelector(':first-child'); // Assuming step content is wrapped
              if (currentStepContent) {
                  currentStepContent.prepend(statusDiv);
              } else {
                  contentArea.prepend(statusDiv);
              }
          }
      }
    }

    if (!statusDiv) {
      debugLog("Could not find status display element.", {message, type}, 'warn');
      return;
    }

    let icon = 'ℹ️'; // Default for info
    let className = 'info';
    if (showSpinner === undefined) {
      showSpinner = (type === 'processing');
    }

    switch (type) {
      case 'processing':
        icon = '⏳';
        className = 'processing';
        break;
      case 'success':
        icon = '✅';
        className = 'success';
        break;
      case 'error':
        icon = '❌';
        className = 'error';
        break;
      case 'ready':
        icon = '⏳'; // Or some other icon like a dot
        className = 'ready';
        break;
      case 'info':
      default:
        icon = 'ℹ️';
        className = 'info';
        break;
    }
    
    statusDiv.innerHTML = `
      <div class="vespa-status-icon">${showSpinner ? '<div class="vespa-spinner"></div>' : icon}</div>
      <div class="vespa-status-text">${message}</div>
    `;
    
    // Update classes: remove old, add new
    statusDiv.className = ''; // Clear existing specific type classes
    
    // Determine base class based on which div we found/created
    if (currentStep === processingStepNumber && document.querySelector('.vespa-processing-status') === statusDiv) {
        statusDiv.classList.add('vespa-processing-status');
    } else if (currentStep === validationStepNumber && document.querySelector('.vespa-validation-status') === statusDiv) {
        statusDiv.classList.add('vespa-validation-status');
    } else if (document.getElementById('general-status-display') === statusDiv) {
        statusDiv.classList.add('vespa-status-display-generic');
    } else {
        // Default base class if none of the above matched perfectly (should be rare)
        statusDiv.classList.add('vespa-generic-status-area'); 
    }


    if (className) {
      statusDiv.classList.add(className);
    }
    debugLog(`Status display updated: ${message}`, {type, showSpinner}, 'info');
  }

  /**
   * Fetches all VESPA Customer (object_2) records and populates the school select dropdown.
   */
  async function fetchVespaCustomers() {
    debugLog("Fetching VESPA Customers (object_2)...");
    const schoolSelect = document.getElementById('school-select');
    if (!schoolSelect) {
      debugLog("School select dropdown not found.", null, "error");
      return;
    }
    schoolSelect.disabled = true;
    schoolSelect.innerHTML = '<option value="">-- Loading schools... --</option>';

    try {
      const response = await $.ajax({
        url: `${API_BASE_URL}vespa-customers`, // New endpoint: /api/vespa-customers
        type: 'GET',
        xhrFields: { withCredentials: true }
      });
      debugLog("VESPA Customers API response:", response);

      if (response.success && response.customers && response.customers.length > 0) {
        schoolSelect.innerHTML = '<option value="">-- Select a school --</option>'; // Clear loading message
        response.customers.forEach(customer => {
          const option = document.createElement('option');
          option.value = customer.id; // Store object_2 ID
          option.textContent = customer.name; // Display name
          option.dataset.name = customer.name;
          option.dataset.schoolIdText = customer.schoolIdText || ''; // Store schoolIdText if available
          schoolSelect.appendChild(option);
        });
        showSuccess(`Found ${response.customers.length} VESPA Customer accounts.`);
      } else {
        schoolSelect.innerHTML = '<option value="">-- No schools found --</option>';
        showError(response.message || "Could not load schools.");
      }
          } catch (error) {
        debugLog("Error fetching VESPA customers:", error, 'error');
        schoolSelect.innerHTML = '<option value="">-- Error loading schools --</option>';
        
        // Check if it's a CORS error
        if (error.status === 0 && error.statusText === 'error') {
          debugLog("Possible CORS error detected", error, 'error');
          showError(`Failed to fetch schools. This may be a CORS issue. Please try refreshing the page.`);
        } else {
          showError(`Failed to fetch schools: ${error.responseJSON?.message || error.message || error.statusText || 'Unknown error'}`);
        }
      } finally {
      schoolSelect.disabled = false;
    }
  }

  /**
   * Fetches admin details for the selected VESPA Customer for emulation.
   * @param {string} customerId - The ID of the selected VESPA Customer (object_2).
   */
  async function fetchEmulationAdminDetails(customerId) {
    debugLog("Fetching emulation admin details for customer ID:", customerId);
    const emulationAdminEmailDiv = document.getElementById('emulation-admin-email');
    const emulationStatusDiv = document.getElementById('emulation-status');
    if (emulationAdminEmailDiv) emulationAdminEmailDiv.innerHTML = 'Fetching admin details...';
    if (emulationStatusDiv) emulationStatusDiv.textContent = 'Fetching...';

    try {
      const response = await $.ajax({
        url: `${API_BASE_URL}customer-admin-details?customerId=${customerId}`, // Use the updated endpoint
        type: 'GET',
        xhrFields: { withCredentials: true }
      });
      debugLog("Customer Admin Details API response:", response);

      if (response.success && response.admins && response.admins.length > 0) {
        selectedSchool.emulatedAdmins = response.admins; // Store array of admins
        
        // Save emulation state to session storage
        setEmulationState({
          school: selectedSchool,
          admins: response.admins
        });
        
        // --- Update the main emulation status bar ---
        updateEmulationStatusBar();

        // --- Update the in-step details (for clarity within the step) ---
        const adminEmailsHtml = response.admins.map(admin => `<li>${admin.email}</li>`).join('');
        emulationAdminEmailDiv.innerHTML = `<strong>Emulating as Admins:</strong><ul>${adminEmailsHtml}</ul>`;
        
        if (emulationStatusDiv) emulationStatusDiv.textContent = 'Emulation ready.';
        showSuccess(`Emulation configured for ${selectedSchool.name} with ${response.admins.length} admin(s).`);
              } else {
          selectedSchool.emulatedAdmins = [];
          clearEmulationState(); // Clear any stored emulation state
          updateEmulationStatusBar(); // This will hide the bar
          emulationAdminEmailDiv.innerHTML = '<strong>No primary admins found for emulation.</strong>';
          if (emulationStatusDiv) emulationStatusDiv.textContent = 'Emulation setup failed.';
          showError(response.message || "Could not fetch admin details for emulation.");
        }
      } catch (error) {
        debugLog("Error fetching emulation admin details:", error, 'error');
        selectedSchool.emulatedAdmins = [];
        clearEmulationState(); // Clear any stored emulation state
        updateEmulationStatusBar(); // This will hide the bar
        if (emulationAdminEmailDiv) emulationAdminEmailDiv.innerHTML = '<strong>Error fetching admin details.</strong>';
        if (emulationStatusDiv) emulationStatusDiv.textContent = 'Error.';
        
        // Check if it's a CORS error
        if (error.status === 0 && error.statusText === 'error') {
          debugLog("Possible CORS error detected", error, 'error');
          showError(`Failed to fetch admin details. This may be a CORS issue. Please try refreshing the page.`);
        } else {
          showError(`Failed to fetch admin details: ${error.responseJSON?.message || error.message || error.statusText || 'Unknown error'}`);
        }
      }
  }

  /**
   * Shows the emulation settings modal for super users
   */
  function showEmulationSettingsModal() {
    const emulationState = getEmulationState();
    const currentSchoolName = emulationState?.school?.name || 'None';
    
    const modalContent = `
      <div class="vespa-emulation-settings">
        <p>Manage emulation settings for testing and support purposes.</p>
        
        <div class="vespa-current-emulation" style="margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
          <h4>Current Emulation Status</h4>
          ${emulationState && emulationState.school ? `
            <p><strong>School:</strong> ${currentSchoolName}</p>
            <p><strong>Admin(s):</strong></p>
            <ul style="margin: 10px 0; padding-left: 20px;">
              ${emulationState.admins.map(admin => `<li>${admin.email}</li>`).join('')}
            </ul>
          ` : `
            <p>No school currently being emulated.</p>
          `}
        </div>
        
        <div class="vespa-emulation-actions" style="margin-top: 20px;">
          ${emulationState && emulationState.school ? `
            <button class="vespa-button secondary" onclick="showChangeEmulationModal(); closeModal();">Change School</button>
            <button class="vespa-button secondary" onclick="clearEmulationMode(); closeModal();">Exit Emulation</button>
            <button class="vespa-button secondary" onclick="location.reload();">🔄 Refresh Page</button>
          ` : `
            <button class="vespa-button primary" onclick="currentStep = 2; renderStep(2); closeModal();">Select School to Emulate</button>
          `}
        </div>
        
        <div class="vespa-info-box" style="margin-top: 20px; background: #e3f2fd; border-left: 4px solid #2196f3; padding: 12px;">
          <div class="vespa-info-icon" style="display: inline-block; margin-right: 8px;">ℹ️</div>
          <div class="vespa-info-content" style="display: inline-block; width: calc(100% - 30px); vertical-align: top;">
            <strong>Tip:</strong> When emulating a school, all uploads and actions will be performed as if you were logged in as that school's admin.
          </div>
        </div>
        
        <div class="vespa-modal-actions" style="margin-top: 20px; text-align: right;">
          <button class="vespa-button primary" onclick="closeModal()">Close</button>
        </div>
      </div>
    `;
    
    showModal('Emulation Settings', modalContent);
  }

  /**
   * Shows the percentile selection modal.
   */
  function showPercentileModal() {
    const modalContent = `
      <div class="vespa-percentile-modal-content">
        <p>Select the ALPS percentile benchmark to be used for calculations. This will affect the Minimum Expected Grades (MEGs) and Subject Adjusted Grades (SAGs).</p>
        
        <div class="vespa-percentile-options">
          <div class="vespa-percentile-option">
            <input type="radio" id="percentile-60" name="percentile-select" value="60" ${selectedPercentile === 60 ? 'checked' : ''}>
            <label for="percentile-60">60th Percentile</label>
          </div>
          <div class="vespa-percentile-option">
            <input type="radio" id="percentile-75" name="percentile-select" value="75" ${selectedPercentile === 75 ? 'checked' : ''}>
            <label for="percentile-75">75th Percentile (Default & Recommended)</label>
          </div>
          <div class="vespa-percentile-option">
            <input type="radio" id="percentile-90" name="percentile-select" value="90" ${selectedPercentile === 90 ? 'checked' : ''}>
            <label for="percentile-90">90th Percentile</label>
          </div>
          <div class="vespa-percentile-option">
            <input type="radio" id="percentile-100" name="percentile-select" value="100" ${selectedPercentile === 100 ? 'checked' : ''}>
            <label for="percentile-100">100th Percentile</label>
          </div>
        </div>
        
        <div class="vespa-percentile-info-trigger">
          <button id="percentile-info-btn" class="vespa-info-btn">ⓘ What do these percentiles mean?</button>
        </div>

        <div class="vespa-modal-actions">
          <button id="cancel-percentile-btn" class="vespa-button secondary">Cancel</button>
          <button id="save-percentile-btn" class="vespa-button primary">Save Selection</button>
        </div>
      </div>
    `;

    showModal('Select ALPS Percentile Target', modalContent);

    // Add event listeners for the new modal's buttons
    document.getElementById('percentile-info-btn').addEventListener('click', showPercentileInfoModal);
    document.getElementById('save-percentile-btn').addEventListener('click', () => {
      const selectedValue = document.querySelector('input[name="percentile-select"]:checked');
      if (selectedValue) {
        selectedPercentile = parseInt(selectedValue.value);
        // Update display name
        switch(selectedPercentile) {
          case 60: selectedPercentileName = '60th Percentile'; break;
          case 75: selectedPercentileName = '75th (Default & Recommended)'; break;
          case 90: selectedPercentileName = '90th Percentile'; break;
          case 100: selectedPercentileName = '100th Percentile'; break;
          default: selectedPercentileName = `${selectedPercentile}th Percentile`;
        }
        document.getElementById('select-percentile-button').textContent = `Target: ${selectedPercentileName}`;
        debugLog("Percentile selected:", selectedPercentile, 'info');
        showSuccess(`Percentile target set to ${selectedPercentileName}.`);
      }
      closeModal();
    });
    document.getElementById('cancel-percentile-btn').addEventListener('click', closeModal);
  }

  /**
   * Shows the percentile information modal.
   */
  function showPercentileInfoModal() {
    const infoContent = `
      <h4>Understanding ALPS Percentile Benchmarks:</h4>
      <p>Selecting a percentile benchmark determines the aspirational target grades (MEGs) and the baseline for Subject Adjusted Grades (SAGs). Here's a general guide:</p>
      <ul>
        <li><strong>100th Percentile:</strong> Targets based on the performance of the top 1% of students/schools nationally. This is a highly aspirational target, typically for outstanding providers aiming for elite performance.</li>
        <li><strong>90th Percentile:</strong> Targets based on the performance of the top 10% of students/schools nationally. This represents a very strong, aspirational target for high-performing providers.</li>
        <li><strong>75th Percentile (Default & Recommended):</strong> Targets based on the performance of the top 25% of students/schools nationally. This is the standard ALPS benchmark and represents excellent performance. It is generally recommended for most schools.</li>
        <li><strong>60th Percentile:</strong> Targets based on the performance of the top 40% of students/schools nationally. This can be a useful interim target for schools on an improvement journey, aiming to move towards national average and above.</li>
      </ul>
      <p>The chosen percentile will influence which set of benchmark data is used for A-Level expected points/grades and the VA (Value Added) factors applied to all qualifications.</p>
    `;
    showModal('ALPS Percentile Information', infoContent);
  }

  /**
   * Shows the universal password modal for student uploads.
   */
  function showUniversalPasswordModal() {
    const modalContent = `
      <div class="vespa-universal-password-content">
        <p>Set a universal password for all students in this upload. This will override the automatic password generation.</p>
        
        <div class="vespa-password-input-group">
          <label for="universal-password-input">Universal Password:</label>
          <input type="password" id="universal-password-input" placeholder="Enter password" value="${universalPassword || ''}" style="width: 100%; padding: 8px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px;">
          <div class="vespa-password-requirements" style="font-size: 12px; color: #666; margin-top: 5px;">
            <p>Password requirements:</p>
            <ul style="margin: 5px 0; padding-left: 20px;">
              <li>Minimum 8 characters</li>
              <li>At least one uppercase letter</li>
              <li>At least one lowercase letter</li>
              <li>At least one number</li>
            </ul>
          </div>
        </div>
        
        <div class="vespa-checkbox-group" style="margin: 15px 0;">
          <input type="checkbox" id="show-password" onchange="document.getElementById('universal-password-input').type = this.checked ? 'text' : 'password'">
          <label for="show-password">Show password</label>
        </div>
        
        <div class="vespa-info-box" style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 15px 0;">
          <div class="vespa-info-icon" style="display: inline-block; margin-right: 8px;">⚠️</div>
          <div class="vespa-info-content" style="display: inline-block; width: calc(100% - 30px); vertical-align: top;">
            <strong>Important:</strong> You will need to communicate this password to all students. The welcome email will state: "Your password will be supplied by your teacher."
          </div>
        </div>
        
        <div class="vespa-modal-actions" style="margin-top: 20px; text-align: right;">
          <button id="cancel-universal-password-btn" class="vespa-button secondary">Cancel</button>
          <button id="clear-universal-password-btn" class="vespa-button secondary">Clear Password</button>
          <button id="save-universal-password-btn" class="vespa-button primary">Save Password</button>
        </div>
      </div>
    `;

    showModal('Set Universal Password', modalContent);

    // Add event listeners
    document.getElementById('save-universal-password-btn').addEventListener('click', () => {
      const passwordInput = document.getElementById('universal-password-input');
      const password = passwordInput.value.trim();
      
      if (password) {
        // Validate password
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const isLongEnough = password.length >= 8;
        
        if (!isLongEnough || !hasUpperCase || !hasLowerCase || !hasNumbers) {
          showError('Password does not meet the requirements. Please check and try again.');
          return;
        }
        
        universalPassword = password;
        useUniversalPassword = true;
        showSuccess('Universal password has been set. Remember to share this with your students.');
        
        // Update button text to show it's set
        const btn = document.getElementById('universal-password-button');
        if (btn) {
          btn.textContent = 'Universal Password ✓';
          btn.style.backgroundColor = '#d4edda';
          btn.style.borderColor = '#28a745';
          btn.style.color = '#155724';
        }
      } else {
        showError('Please enter a password.');
        return;
      }
      
      closeModal();
    });

    document.getElementById('clear-universal-password-btn').addEventListener('click', () => {
      universalPassword = null;
      useUniversalPassword = false;
      
      // Reset button appearance
      const btn = document.getElementById('universal-password-button');
      if (btn) {
        btn.textContent = 'Set Universal Password';
        btn.style.backgroundColor = '';
        btn.style.borderColor = '';
        btn.style.color = '';
      }
      
      showSuccess('Universal password has been cleared. Auto-generated passwords will be used.');
      closeModal();
    });

    document.getElementById('cancel-universal-password-btn').addEventListener('click', closeModal);
  }

  /**
   * Shows the self-registration QR code generation modal (Super Users only).
   */
  function showSelfRegistrationModal() {
    debugLog("showSelfRegistrationModal called", null, 'info');
    
    try {
      debugLog("Opening self-registration modal for super user");
      
      const modalContent = `
      <div class="vespa-self-registration-content">
        <h3>Generate Student Registration QR Code</h3>
        <p>Create a QR code for students to self-register during webinars or events.</p>
        
        <div class="vespa-school-selection" style="margin: 20px 0;">
          <label for="qr-school-search" style="display: block; font-weight: bold; margin-bottom: 10px;">
            Select School/Customer <span style="color: red;">*</span>
          </label>
          
          <div style="margin-bottom: 10px;">
            <input type="text" id="qr-school-search" placeholder="Search for school..." 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <div class="help-text" style="font-size: 12px; color: #666; margin-top: 5px;">
              Type to search or select from dropdown below
            </div>
          </div>
          
          <select id="qr-school-select" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;">
            <option value="">-- Loading schools... --</option>
          </select>
        </div>
        
        <div id="qr-school-details" style="display: none; background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
          <h4 style="margin-top: 0;">Selected School Details</h4>
          <div><strong>School Name:</strong> <span id="qr-school-name"></span></div>
          <div><strong>Current Logo:</strong> <span id="qr-current-logo">None</span></div>
          <div><strong>Staff Admins:</strong> <span id="qr-admin-count">0</span> found</div>
        </div>
        
        <div class="vespa-logo-section" style="margin: 20px 0;">
          <label for="qr-logo-url" style="display: block; font-weight: bold; margin-bottom: 10px;">
            School Logo URL (optional)
          </label>
          <input type="url" id="qr-logo-url" placeholder="https://example.com/logo.png" 
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          <div class="help-text" style="font-size: 12px; color: #666; margin-top: 5px;">
            Leave empty to use existing logo, or enter a new URL to update
          </div>
          <div id="logo-preview" style="margin-top: 10px; display: none;">
            <img id="logo-preview-img" style="max-width: 200px; max-height: 100px; border: 1px solid #ddd; padding: 5px;">
          </div>
        </div>
        
        <div class="vespa-registration-options" style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
          <h4 style="margin-top: 0;">Registration Settings:</h4>
          
          <div class="vespa-checkbox-group" style="margin: 10px 0;">
            <input type="checkbox" id="require-school-email" checked>
            <label for="require-school-email">Require school email addresses only</label>
          </div>
          
          <div class="vespa-checkbox-group" style="margin: 10px 0;">
            <input type="checkbox" id="auto-approve-registration" checked>
            <label for="auto-approve-registration">Auto-approve registrations</label>
          </div>
          
          <div class="vespa-checkbox-group" style="margin: 10px 0;">
            <input type="checkbox" id="webinar-mode" unchecked>
            <label for="webinar-mode">Webinar Mode (2-hour tokens for delayed login)</label>
            <div class="help-text" style="font-size: 12px; color: #666; margin-top: 5px; margin-left: 28px;">
              Enable this for online webinars where students register now but log in later
            </div>
          </div>
          
          <div class="vespa-input-group" style="margin: 15px 0;">
            <label for="qr-expiry-days">Link expires in (days):</label>
            <input type="number" id="qr-expiry-days" value="365" min="1" max="730" 
              style="width: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          </div>
          
          <div class="vespa-input-group" style="margin: 15px 0;">
            <label for="registration-message">Custom welcome message (optional):</label>
            <textarea id="registration-message" placeholder="e.g., Welcome to today's VESPA webinar! Please register below..." 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; min-height: 60px;"></textarea>
          </div>
        </div>
        
        <div class="vespa-modal-actions" style="margin-top: 20px; text-align: right;">
          <button id="cancel-registration-link-btn" class="vespa-button secondary">Cancel</button>
          <button id="generate-registration-link-btn" class="vespa-button primary" disabled>Generate QR Code</button>
        </div>
      </div>
    `;

    showModal('Generate Student Registration QR Code', modalContent);

    // Load schools for dropdown
    loadSchoolsForQRGeneration();

    // Add event listeners
    document.getElementById('qr-school-select').addEventListener('change', handleQRSchoolSelection);
    document.getElementById('qr-logo-url').addEventListener('input', handleLogoPreview);
    
    // Add search functionality
    document.getElementById('qr-school-search').addEventListener('input', handleQRSchoolSearch);
    
    document.getElementById('generate-registration-link-btn').addEventListener('click', async () => {
      const schoolSelect = document.getElementById('qr-school-select');
      const customerId = schoolSelect.value;
      
      if (!customerId) {
        showError('Please select a school first');
        return;
      }
      
      const logoUrl = document.getElementById('qr-logo-url').value.trim();
      const requireSchoolEmail = document.getElementById('require-school-email').checked;
      const autoApprove = document.getElementById('auto-approve-registration').checked;
      const expiresIn = parseInt(document.getElementById('qr-expiry-days').value) || 365;
      const customMessage = document.getElementById('registration-message').value.trim();
      const webinarMode = document.getElementById('webinar-mode').checked;
      
      // Generate the registration link
      await generateRegistrationLink({
        customerId,
        logoUrl,
        requireSchoolEmail,
        autoApprove,
        expiresIn,
        customMessage,
        webinarMode
      });
    });

    document.getElementById('cancel-registration-link-btn').addEventListener('click', closeModal);
    
    } catch (error) {
      debugLog("Error in showSelfRegistrationModal:", error, 'error');
      showError('Failed to open registration modal. Please try again.');
    }
  }

  /**
   * Load schools for QR generation dropdown
   */
  async function loadSchoolsForQRGeneration() {
    try {
      const response = await $.ajax({
        url: `${API_BASE_URL}vespa-customers`,
        type: 'GET',
        xhrFields: { withCredentials: true }
      });
      
      const schoolSelect = document.getElementById('qr-school-select');
      if (!schoolSelect) return;
      
      if (response.success && response.customers && response.customers.length > 0) {
        // Store schools data for search
        qrSchoolsData = response.customers;
        
        // Populate dropdown
        populateQRSchoolDropdown(qrSchoolsData);
      } else {
        schoolSelect.innerHTML = '<option value="">-- No schools found --</option>';
        qrSchoolsData = [];
      }
    } catch (error) {
      debugLog('Error loading schools for QR generation:', error, 'error');
      showError('Failed to load schools. Please refresh and try again.');
    }
  }

  /**
   * Populate the school dropdown with filtered data
   */
  function populateQRSchoolDropdown(schools) {
    const schoolSelect = document.getElementById('qr-school-select');
    if (!schoolSelect) return;
    
    schoolSelect.innerHTML = '<option value="">-- Select a school --</option>';
    schools.forEach(customer => {
      const option = document.createElement('option');
      option.value = customer.id;
      option.textContent = customer.name;
      option.dataset.logo = customer.logoUrl || '';
      schoolSelect.appendChild(option);
    });
  }

  /**
   * Handle school search input
   */
  function handleQRSchoolSearch(event) {
    const searchTerm = event.target.value.toLowerCase().trim();
    
    if (!searchTerm) {
      // If search is empty, show all schools
      populateQRSchoolDropdown(qrSchoolsData);
      return;
    }
    
    // Filter schools based on search term
    const filteredSchools = qrSchoolsData.filter(school => 
      school.name.toLowerCase().includes(searchTerm)
    );
    
    if (filteredSchools.length > 0) {
      populateQRSchoolDropdown(filteredSchools);
    } else {
      const schoolSelect = document.getElementById('qr-school-select');
      schoolSelect.innerHTML = '<option value="">-- No schools found matching search --</option>';
    }
    
    // Clear current selection if it doesn't match search
    const currentSelection = document.getElementById('qr-school-select').value;
    if (currentSelection) {
      const selectedSchool = qrSchoolsData.find(s => s.id === currentSelection);
      if (selectedSchool && !selectedSchool.name.toLowerCase().includes(searchTerm)) {
        document.getElementById('qr-school-select').value = '';
        document.getElementById('qr-school-details').style.display = 'none';
        document.getElementById('generate-registration-link-btn').disabled = true;
      }
    }
  }

  /**
   * Handle school selection for QR generation
   */
  async function handleQRSchoolSelection(event) {
    const customerId = event.target.value;
    const schoolDetails = document.getElementById('qr-school-details');
    const generateBtn = document.getElementById('generate-registration-link-btn');
    
    if (!customerId) {
      schoolDetails.style.display = 'none';
      generateBtn.disabled = true;
      return;
    }
    
    try {
      // Get school details
      const selectedOption = event.target.selectedOptions[0];
      document.getElementById('qr-school-name').textContent = selectedOption.textContent;
      
      // Get current logo from dataset or fetch from API
      const response = await $.ajax({
        url: `${API_BASE_URL}customer-admin-details?customerId=${customerId}`,
        type: 'GET',
        xhrFields: { withCredentials: true }
      });
      
      if (response.success) {
        // Show current logo
        const currentLogo = response.customer?.field_3206 || '';
        document.getElementById('qr-current-logo').textContent = currentLogo || 'None';
        
        // Show admin count
        document.getElementById('qr-admin-count').textContent = response.admins?.length || 0;
        
        // If there's a logo, set it in the input for preview
        if (currentLogo) {
          document.getElementById('qr-logo-url').value = currentLogo;
          handleLogoPreview({ target: { value: currentLogo } });
        }
      }
      
      schoolDetails.style.display = 'block';
      generateBtn.disabled = false;
      
    } catch (error) {
      debugLog('Error fetching school details:', error, 'error');
      schoolDetails.style.display = 'block';
      generateBtn.disabled = false;
    }
  }

  /**
   * Handle logo URL preview
   */
  function handleLogoPreview(event) {
    const logoUrl = event.target.value.trim();
    const previewDiv = document.getElementById('logo-preview');
    const previewImg = document.getElementById('logo-preview-img');
    
    if (!logoUrl) {
      previewDiv.style.display = 'none';
      return;
    }
    
    // Simple URL validation
    try {
      new URL(logoUrl);
      previewImg.src = logoUrl;
      previewDiv.style.display = 'block';
      
      previewImg.onerror = () => {
        previewDiv.style.display = 'none';
        showError('Unable to load logo preview. Please check the URL.');
      };
    } catch (e) {
      previewDiv.style.display = 'none';
    }
  }

  /**
   * Generates a self-registration link and displays it with QR code
   */
  async function generateRegistrationLink(options) {
    try {
      // Close the current modal
      closeModal();
      
      // Show loading
      showModal('Generating Registration Link', '<div style="text-align: center; padding: 20px;"><div class="vespa-spinner"></div><p>Generating link and QR code...</p></div>');
      
      // Call the new API endpoint to generate and store the link
      const response = await $.ajax({
        url: `${API_BASE_URL}self-registration/generate-link`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(options),
        xhrFields: { withCredentials: true }
      });
      
      if (!response.success) {
        throw new Error(response.message || 'Failed to generate link');
      }
      
      debugLog('Registration link generated:', response);
      
      // Load QR code library if not already loaded
      if (typeof QRCode === 'undefined') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
      }
      
      // Display the link and QR code
      const resultContent = `
        <div class="vespa-registration-link-result">
          <h4>✅ Student Registration QR Code Generated!</h4>
          
          <div class="vespa-qr-code" style="text-align: center; margin: 20px 0;">
            <div id="qrcode" style="display: inline-block; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"></div>
          </div>
          
          <div class="vespa-link-display" style="margin: 20px 0;">
            <label style="font-weight: bold;">Registration URL:</label>
            <div style="display: flex; align-items: center; margin-top: 5px;">
              <input type="text" id="registration-url" value="${response.registrationUrl}" readonly 
                style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px 0 0 4px; font-size: 12px;">
              <button id="copy-url-btn" class="vespa-button primary" style="border-radius: 0 4px 4px 0; margin: 0;">Copy</button>
            </div>
          </div>
          
          <div class="vespa-link-details" style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <h5>QR Code Details:</h5>
            <ul style="margin: 10px 0; padding-left: 20px;">
              <li><strong>School:</strong> ${response.configSettings.customerName}</li>
              <li><strong>Valid until:</strong> ${new Date(response.expiresAt).toLocaleDateString()}</li>
              <li><strong>School email required:</strong> ${response.configSettings.requireSchoolEmail ? 'Yes' : 'No'}</li>
              <li><strong>Auto-approve:</strong> ${response.configSettings.autoApprove ? 'Yes' : 'No'}</li>
              <li><strong>Webinar mode:</strong> ${response.configSettings.webinarMode ? 'Yes (2-hour tokens)' : 'No (5-minute tokens)'}</li>
              ${response.configSettings.customMessage ? `<li><strong>Custom message:</strong> ${response.configSettings.customMessage}</li>` : ''}
              <li><strong>Link ID:</strong> <code>${response.linkId}</code></li>
            </ul>
          </div>
          
          <div class="vespa-info-box" style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 12px; margin: 15px 0;">
            <div class="vespa-info-icon" style="display: inline-block; margin-right: 8px;">💡</div>
            <div class="vespa-info-content" style="display: inline-block; width: calc(100% - 30px); vertical-align: top;">
              <strong>For your webinar:</strong> Display this QR code on screen. Students can scan it with their phones to register immediately. All staff admins will be automatically connected to registering students.
            </div>
          </div>
          
          <div class="vespa-modal-actions" style="margin-top: 20px; text-align: right; display: flex; gap: 10px; justify-content: flex-end;">
            <button id="download-qr-btn" class="vespa-button secondary">📥 Download QR Code</button>
            <button id="view-links-btn" class="vespa-button secondary">📋 View All Links</button>
            <button id="close-registration-result-btn" class="vespa-button primary">Close</button>
          </div>
        </div>
      `;
      
      showModal('QR Code Generated Successfully', resultContent);
      
      // Generate the QR code
      setTimeout(() => {
        new QRCode(document.getElementById("qrcode"), {
          text: response.registrationUrl,
          width: 300,
          height: 300,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.H
        });
      }, 100);
      
      // Add event listeners
      document.getElementById('copy-url-btn').addEventListener('click', () => {
        const urlInput = document.getElementById('registration-url');
        urlInput.select();
        document.execCommand('copy');
        showSuccess('Link copied to clipboard!');
      });
      
      document.getElementById('download-qr-btn').addEventListener('click', () => {
        // Add a small delay to ensure QR code is fully rendered
        setTimeout(() => {
          const canvas = document.querySelector('#qrcode canvas');
          if (canvas) {
            const link = document.createElement('a');
            const schoolName = response.configSettings.customerName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.download = `vespa_qr_${schoolName}_${new Date().toISOString().slice(0,10)}.png`;
            link.href = canvas.toDataURL();
            link.click();
          } else {
            debugLog('QR code canvas not found!', null, 'error');
            showError('Please wait for the QR code to generate before downloading.');
          }
        }, 200);
      });
      
      document.getElementById('view-links-btn').addEventListener('click', () => {
        closeModal();
        showQRLinksManagement();
      });
      
      document.getElementById('close-registration-result-btn').addEventListener('click', closeModal);
      
    } catch (error) {
      debugLog('Error generating registration link:', error, 'error');
      showError(`Failed to generate registration link: ${error.message}`);
      closeModal();
    }
  }

  /**
   * Helper function to load external scripts
   */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // Check if script already exists
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        debugLog("Script already loaded:", src, 'info');
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        debugLog("Script loaded successfully:", src, 'success');
        resolve();
      };
      script.onerror = (error) => {
        debugLog("Failed to load script:", { src, error }, 'error');
        reject(new Error(`Failed to load script: ${src}`));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Show QR Links Management interface (Super Users only)
   */
  function showQRLinksManagement() {
    debugLog("Opening QR Links Management interface");
    
    const modalContent = `
      <div class="vespa-qr-links-management">
        <h3>Manage Registration QR Codes</h3>
        <p>View and manage all generated registration links.</p>
        
        <div id="qr-links-loading" style="text-align: center; padding: 20px;">
          <div class="vespa-spinner"></div>
          <p>Loading registration links...</p>
        </div>
        
        <div id="qr-links-container" style="display: none;">
          <div id="qr-links-list"></div>
        </div>
        
        <div class="vespa-modal-actions" style="margin-top: 20px; text-align: right;">
          <button id="create-new-qr-btn" class="vespa-button primary">➕ Create New QR Code</button>
          <button id="close-qr-management-btn" class="vespa-button secondary">Close</button>
        </div>
      </div>
    `;
    
    showModal('QR Code Management', modalContent);
    
    // Load QR links
    loadQRLinks();
    
    // Add event listeners
    document.getElementById('create-new-qr-btn').addEventListener('click', () => {
      closeModal();
      showSelfRegistrationModal();
    });
    
    document.getElementById('close-qr-management-btn').addEventListener('click', closeModal);
  }

  /**
   * Load all QR links
   */
  async function loadQRLinks() {
    try {
      // For super users, we need to get all QR links across all customers
      // This would require a new API endpoint to fetch QR links
      const response = await $.ajax({
        url: `${API_BASE_URL}self-registration/links`,
        type: 'GET',
        xhrFields: { withCredentials: true }
      });
      
      const container = document.getElementById('qr-links-container');
      const listContainer = document.getElementById('qr-links-list');
      const loadingDiv = document.getElementById('qr-links-loading');
      
      if (response.success && response.links && response.links.length > 0) {
        let linksHtml = `
          <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse;">
              <thead>
                <tr style="background: #f8f9fa;">
                  <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">School</th>
                  <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Created</th>
                  <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Expires</th>
                  <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Usage</th>
                  <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Status</th>
                  <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Actions</th>
                </tr>
              </thead>
              <tbody>
        `;
        
        response.links.forEach(link => {
          const configSettings = JSON.parse(link.field_3519 || '{}');
          const isExpired = new Date(configSettings.expiresAt) < new Date();
          const customerName = link.field_3514_raw?.[0]?.identifier || 'Unknown School';
          
          linksHtml += `
            <tr style="border-bottom: 1px solid #dee2e6;">
              <td style="padding: 10px;">${customerName}</td>
              <td style="padding: 10px;">${new Date(link.field_3516).toLocaleDateString()}</td>
              <td style="padding: 10px;">${new Date(configSettings.expiresAt).toLocaleDateString()}</td>
              <td style="padding: 10px; text-align: center;">${link.field_3518 || 0}</td>
              <td style="padding: 10px; text-align: center;">
                <span style="
                  padding: 4px 8px;
                  border-radius: 4px;
                  font-size: 12px;
                  background: ${isExpired ? '#f8d7da' : '#d4edda'};
                  color: ${isExpired ? '#721c24' : '#155724'};
                ">
                  ${isExpired ? 'Expired' : 'Active'}
                </span>
              </td>
              <td style="padding: 10px; text-align: center;">
                <button class="vespa-button secondary small-button" onclick="viewQRCode('${link.field_3513}')">
                  View QR
                </button>
                ${isExpired ? `
                  <button class="vespa-button secondary small-button" onclick="regenerateQRLink('${link.id}')">
                    Regenerate
                  </button>
                ` : ''}
              </td>
            </tr>
          `;
        });
        
        linksHtml += `
              </tbody>
            </table>
          </div>
        `;
        
        listContainer.innerHTML = linksHtml;
      } else {
        listContainer.innerHTML = `
          <div style="text-align: center; padding: 40px; color: #666;">
            <p>No registration links found.</p>
            <p>Create your first QR code to get started.</p>
          </div>
        `;
      }
      
      loadingDiv.style.display = 'none';
      container.style.display = 'block';
      
    } catch (error) {
      debugLog('Error loading QR links:', error, 'error');
      document.getElementById('qr-links-loading').innerHTML = `
        <div style="color: #dc3545; padding: 20px;">
          <p>Failed to load registration links.</p>
          <p>${error.message || 'Please try again.'}</p>
        </div>
      `;
    }
  }

  /**
   * View a QR code
   */
  window.viewQRCode = async function(linkId) {
    const baseUrl = window.REGISTRATION_FORM_URL || 'https://4sighteducation.github.io/vespa-upload-bridge/root/self-registration-form.html';
    // Add cache buster to force fresh content load
    const cacheBuster = Date.now();
    const registrationUrl = `${baseUrl}?id=${linkId}&v=${cacheBuster}`;
    
    // Load QR code library if needed
    if (typeof QRCode === 'undefined') {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js');
    }
    
    const modalContent = `
      <div style="text-align: center;">
        <div id="qr-view" style="display: inline-block; background: white; padding: 20px; border-radius: 8px;"></div>
        <div style="margin-top: 20px;">
          <p><strong>Registration URL:</strong></p>
          <code style="background: #f8f9fa; padding: 8px; border-radius: 4px; display: block; margin: 10px 0;">
            ${registrationUrl}
          </code>
        </div>
        <div class="vespa-modal-actions" style="margin-top: 20px;">
          <button class="vespa-button secondary" onclick="downloadQRFromView('${linkId}')">Download QR</button>
          <button class="vespa-button primary" onclick="closeModal()">Close</button>
        </div>
      </div>
    `;
    
    showModal('View QR Code', modalContent);
    
    // Generate QR code
    setTimeout(() => {
      new QRCode(document.getElementById("qr-view"), {
        text: registrationUrl,
        width: 300,
        height: 300,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });
    }, 100);
  }

  /**
   * Download QR from view modal
   */
  window.downloadQRFromView = function(linkId) {
    const canvas = document.querySelector('#qr-view canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `vespa_qr_${linkId}_${new Date().toISOString().slice(0,10)}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  }

  /**
   * Regenerate an expired QR link
   */
  window.regenerateQRLink = async function(qrLinkId) {
    if (!confirm('Regenerate this QR code for another year?')) return;
    
    try {
      const response = await $.ajax({
        url: `${API_BASE_URL}self-registration/regenerate-link`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ qrLinkId, expiresIn: 365 }),
        xhrFields: { withCredentials: true }
      });
      
      if (response.success) {
        showSuccess('QR code regenerated successfully!');
        // Reload the list
        loadQRLinks();
      } else {
        throw new Error(response.message || 'Failed to regenerate link');
      }
      
    } catch (error) {
      debugLog('Error regenerating link:', error, 'error');
      showError(`Failed to regenerate link: ${error.message}`);
    }
  }

  /**
   * Show the Academic Data Management interface
   */
  async function showAcademicDataInterface() {
    debugLog("Loading Academic Data Management interface", null, 'info');
    
    // First check if students exist
    try {
      const customerId = selectedSchool?.id || userContext?.customerId;
      if (!customerId) {
        showError('Unable to determine school ID. Please refresh and try again.');
        return;
      }
      
      // Check if students exist
      // Try to check if students exist, but continue even if the endpoint doesn't exist
      let hasStudents = true; // Assume students exist by default
      
      try {
        const response = await $.ajax({
          url: `${API_BASE_URL}academic-data/check-students?customerId=${customerId}`,
          type: 'GET',
          xhrFields: { withCredentials: true }
        });
        
        hasStudents = response.success && response.hasStudents;
      } catch (error) {
        // If it's a 404, the endpoint doesn't exist - continue anyway
        if (error.status === 404) {
          debugLog('Student check endpoint not found, continuing anyway', error, 'warn');
        } else {
          debugLog('Error checking for students, continuing anyway', error, 'warn');
        }
        // Continue with the interface regardless
      }
      
      if (!hasStudents) {
        showModal('No Students Found', `
          <div class="vespa-info-box" style="background: #fff3cd; border-left: 4px solid #ffc107;">
            <div class="vespa-info-icon" style="display: inline-block; margin-right: 8px;">⚠️</div>
            <div class="vespa-info-content" style="display: inline-block; width: calc(100% - 30px); vertical-align: top;">
              <p><strong>No student accounts found in the system.</strong></p>
              <p>You must first create student accounts before managing academic data. Please use the "Create Student Accounts" option to upload student data first.</p>
            </div>
          </div>
          <div class="vespa-modal-actions" style="margin-top: 20px; text-align: right;">
            <button onclick="closeModal()" class="vespa-button primary">OK</button>
          </div>
        `);
        return;
      }
      
      // Students exist, show the academic data interface
      const mainContainer = document.querySelector(VESPA_UPLOAD_CONFIG.elementSelector);
      if (!mainContainer) {
        showError('Unable to find main container. Please refresh and try again.');
        return;
      }
      
      // Hide the wizard interface
      const wizard = document.getElementById('vespa-upload-wizard');
      if (wizard) wizard.style.display = 'none';
      
      // Create a new container for the academic data interface
      const academicContainer = document.createElement('div');
      academicContainer.id = 'vespa-academic-data';
      academicContainer.innerHTML = `
        <div class="vespa-academic-data-container">
          <div class="vespa-academic-header">
            <h2>Academic Data Management</h2>
            <button class="vespa-button secondary" data-action="backToUploadWizard">← Back to Upload Wizard</button>
          </div>
          
          <div class="vespa-academic-tabs">
            <button class="vespa-tab-button active">
              GCSE Prior Attainment Calculator
            </button>
            <button class="vespa-tab-button">
              KS5 Subject Upload
            </button>
            <button class="vespa-tab-button">
              Mid-Year Update
            </button>
          </div>
          
          <div class="vespa-academic-content">
            <div id="gcse-calculator-tab" class="vespa-tab-content active">
              <h3>GCSE Prior Attainment Calculator</h3>
              <p>Calculate and update student prior attainment scores based on their GCSE results.</p>
              <div class="vespa-info-box">
                <div class="vespa-info-icon">ℹ️</div>
                <div class="vespa-info-content">
                  This tool allows you to upload GCSE results and automatically calculate prior attainment scores for MEG calculations.
                </div>
              </div>
              <button class="vespa-button primary" data-action="showGCSECalculator">Launch GCSE Calculator</button>
            </div>
            
            <div id="ks5-upload-tab" class="vespa-tab-content" style="display: none;">
              <h3>KS5 Subject Upload</h3>
              <p>Upload A-Level and Level 3 subject data for students.</p>
              <div class="vespa-info-box">
                <div class="vespa-info-icon">ℹ️</div>
                <div class="vespa-info-content">
                  Upload subject choices and calculate Minimum Expected Grades (MEGs) based on prior attainment.
                </div>
              </div>
              <button class="vespa-button primary" data-action="showKS5Upload">Upload KS5 Subjects</button>
            </div>
            
            <div id="mid-year-update-tab" class="vespa-tab-content" style="display: none;">
              <h3>Mid-Year Subject Data Update</h3>
              <p>Update current grades, target grades, and exam boards for existing KS5 subjects.</p>
              <div id="custom-datatable-container" style="margin-top: 20px;">
                <!-- Custom data table will be loaded here -->
              </div>
            </div>
          </div>
        </div>
      `;
      
      // Add styles for the academic data interface
      addAcademicDataStyles();
      
      // Don't auto-load any tab - let user choose
      // The data table will be loaded when they click the Mid-Year Update tab
      
      // Append the academic container to the main container
      mainContainer.appendChild(academicContainer);
      
      // Add event listeners after HTML is created
      setTimeout(() => {
        // Tab buttons
        const tabButtons = academicContainer.querySelectorAll('.vespa-tab-button');
        tabButtons[0]?.addEventListener('click', function() { showAcademicTab('gcse-calculator', this); });
        tabButtons[1]?.addEventListener('click', function() { showAcademicTab('ks5-upload', this); });
        tabButtons[2]?.addEventListener('click', function() { showAcademicTab('mid-year-update', this); });
        
        // Back button
        const backBtn = academicContainer.querySelector('button[data-action="backToUploadWizard"]');
        if (backBtn) {
          backBtn.addEventListener('click', backToUploadWizard);
        }
        
        // GCSE Calculator button
        const gcseBtn = academicContainer.querySelector('button[data-action="showGCSECalculator"]');
        if (gcseBtn) {
          gcseBtn.addEventListener('click', showGCSECalculator);
        }
        
        // KS5 Upload button
        const ks5Btn = academicContainer.querySelector('button[data-action="showKS5Upload"]');
        if (ks5Btn) {
          ks5Btn.addEventListener('click', showKS5Upload);
        }
        
        debugLog("Academic interface event listeners attached", null, 'success');
      }, 100);
      
    } catch (error) {
      debugLog('Error loading academic data interface:', error, 'error');
      showError('Failed to load academic data interface. Please try again.');
    }
  }
  
  /**
   * Add styles for the academic data interface
   */
  function addAcademicDataStyles() {
    if (document.getElementById('vespa-academic-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'vespa-academic-styles';
    style.textContent = `
      .vespa-academic-data-container {
        padding: 20px;
      }
      
      .vespa-academic-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
      }
      
      .vespa-academic-tabs {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        border-bottom: 2px solid #e0e0e0;
      }
      
      .vespa-tab-button {
        padding: 10px 20px;
        background: none;
        border: none;
        border-bottom: 3px solid transparent;
        cursor: pointer;
        font-size: 16px;
        transition: all 0.3s;
      }
      
      .vespa-tab-button:hover {
        background: #f5f5f5;
      }
      
      .vespa-tab-button.active {
        border-bottom-color: #007bff;
        color: #007bff;
        font-weight: 600;
      }
      
      .vespa-tab-content {
        padding: 20px;
        background: #f8f9fa;
        border-radius: 8px;
      }
      
      .vespa-academic-content h3 {
        margin-top: 0;
        margin-bottom: 15px;
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * Show a specific academic data tab
   */
  async function showAcademicTab(tabName, buttonElement) {
    // Update tab buttons
    document.querySelectorAll('.vespa-tab-button').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // If buttonElement is provided, use it; otherwise find the button by tab name
    if (buttonElement) {
      buttonElement.classList.add('active');
    } else {
      // Find the button that corresponds to this tab
      const buttons = document.querySelectorAll('.vespa-tab-button');
      buttons.forEach(btn => {
        if ((tabName === 'gcse-calculator' && btn.textContent.includes('GCSE')) ||
            (tabName === 'ks5-upload' && btn.textContent.includes('KS5')) ||
            (tabName === 'mid-year-update' && btn.textContent.includes('Mid-Year'))) {
          btn.classList.add('active');
        }
      });
    }
    
    // Hide all tab contents
    document.querySelectorAll('.vespa-tab-content').forEach(content => {
      content.style.display = 'none';
    });
    
    // Show selected tab
    document.getElementById(`${tabName}-tab`).style.display = 'block';
    
    // If mid-year update tab, load the custom data table
    if (tabName === 'mid-year-update' && !window.vespaTable) {
      await loadCustomDataTable();
    }
  }
  
  /**
   * Load the custom data table module
   */
  async function loadCustomDataTable() {
    try {
      debugLog("Loading custom data table module", null, 'info');
      
      // First check if container exists
      const container = document.getElementById('custom-datatable-container');
      if (!container) {
        debugLog("Container 'custom-datatable-container' not found in DOM", null, 'error');
        throw new Error('Container element not found');
      }
      
      debugLog("Container found, preparing configuration...", null, 'info');
      
      // Configure the custom data table BEFORE loading the script
      const customerId = selectedSchool?.id || userContext?.customerId;
      
      if (!customerId) {
        debugLog("No customer ID available", { selectedSchool, userContext }, 'error');
        throw new Error('No customer ID available. Please ensure you are logged in or have selected a school.');
      }
      
      debugLog("Using customer ID:", customerId, 'info');
      
      // Store configuration in a different variable that won't be overwritten
      const dataTableConfig = {
        elementSelector: '#custom-datatable-container',
        customerId: customerId,
        apiUrl: API_BASE_URL
      };
      
      // Set configuration on window BEFORE loading the script
      window.CUSTOM_DATATABLE_CONFIG = dataTableConfig;
      
      // Also set it in a backup location in case the script clears it
      window._VESPA_DATATABLE_CONFIG_BACKUP = dataTableConfig;
      
      // Log configuration for debugging
      debugLog("Custom data table configuration set:", window.CUSTOM_DATATABLE_CONFIG, 'info');
      
      // Check if the module is already loaded
      if (window.initializeCustomDataTable && typeof window.initializeCustomDataTable === 'function') {
        debugLog("Custom data table module already loaded, reinitializing with new config", null, 'info');
        
        // Ensure configuration is set
        window.CUSTOM_DATATABLE_CONFIG = dataTableConfig;
        
        // Initialize with existing module
        window.initializeCustomDataTable();
        debugLog("Custom data table reinitialized successfully", null, 'success');
        return;
      }
      
      // NOW load the custom data table script AFTER configuration is set
      debugLog("Loading script from CDN...", null, 'info');
      // Load the fixed version with proper URL construction
      await loadScript('https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-upload-bridge@main/src/customDataTable1c.js');
      
      debugLog("Script loaded successfully", null, 'success');
      
      // Small delay to ensure script is fully executed
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Restore configuration from backup if it was cleared by the script
      if (!window.CUSTOM_DATATABLE_CONFIG || Object.keys(window.CUSTOM_DATATABLE_CONFIG).length === 0) {
        debugLog("Configuration was cleared by script, restoring from backup", null, 'warn');
        window.CUSTOM_DATATABLE_CONFIG = window._VESPA_DATATABLE_CONFIG_BACKUP || dataTableConfig;
      }
      
      // Log the current state
      debugLog("Configuration after script load:", window.CUSTOM_DATATABLE_CONFIG, 'info');
      
      // Initialize the custom data table
      if (window.initializeCustomDataTable && typeof window.initializeCustomDataTable === 'function') {
        debugLog("Calling initializeCustomDataTable...", null, 'info');
        
        // One more check to ensure configuration exists
        if (!window.CUSTOM_DATATABLE_CONFIG || !window.CUSTOM_DATATABLE_CONFIG.customerId) {
          debugLog("Configuration missing before init, setting it again", null, 'warn');
          window.CUSTOM_DATATABLE_CONFIG = dataTableConfig;
        }
        
        window.initializeCustomDataTable();
        debugLog("Custom data table initialized successfully", null, 'success');
      } else {
        debugLog("initializeCustomDataTable function not found on window", {
          hasFunction: !!window.initializeCustomDataTable,
          typeOfFunction: typeof window.initializeCustomDataTable
        }, 'error');
        throw new Error('Custom data table initialization function not found');
      }
      
    } catch (error) {
      debugLog('Error loading custom data table:', error, 'error');
      
      // Show more specific error message
      let errorMessage = 'Failed to load the data table. ';
      if (error.message.includes('Container element not found')) {
        errorMessage += 'The page structure is incorrect. Please refresh and try again.';
      } else if (error.message.includes('No customer ID')) {
        errorMessage += error.message;
      } else if (error.message.includes('initialization function not found')) {
        errorMessage += 'The data table module failed to load properly. Please check your internet connection and try again.';
      } else if (error.message.includes('Failed to load script')) {
        errorMessage += 'Unable to load the data table module from CDN. Please check your internet connection.';
      } else {
        errorMessage += 'Error: ' + error.message;
      }
      
      showError(errorMessage);
      
      // Show a message in the container if it exists
      const container = document.getElementById('custom-datatable-container');
      if (container) {
        container.innerHTML = `
          <div style="padding: 40px; text-align: center; color: #dc3545;">
            <h4>Unable to Load Data Table</h4>
            <p>${errorMessage}</p>
            <button class="vespa-button primary" onclick="location.reload()">Refresh Page</button>
          </div>
        `;
      }
    }
  }
  
  /**
   * Go back to the upload wizard
   */
  function backToUploadWizard() {
    // Show the wizard interface again
    const wizard = document.getElementById('vespa-upload-wizard');
    if (wizard) wizard.style.display = 'block';
    
    // Remove any KS5 workflow or academic data containers
    const ks5Container = document.getElementById('vespa-ks5-workflow');
    if (ks5Container) ks5Container.remove();
    
    const academicContainer = document.getElementById('vespa-academic-data');
    if (academicContainer) academicContainer.remove();
    
    // Remove new customer form container
    const customerFormContainer = document.getElementById('vespa-new-customer-form');
    if (customerFormContainer) customerFormContainer.remove();
    
    // Clear the content div if it exists
    const contentDiv = document.querySelector('.vespa-upload-content');
    if (contentDiv) contentDiv.innerHTML = '';
    
    // Reset to step 1
    currentStep = 1;
    uploadType = null;
    renderStep(1);
  }
  
  /**
   * Show GCSE Calculator (placeholder)
   */
  function showGCSECalculator() {
    showModal('GCSE Calculator', `
      <p>The GCSE Prior Attainment Calculator is coming soon.</p>
      <p>This feature will allow you to:</p>
      <ul>
        <li>Upload GCSE results via CSV</li>
        <li>Automatically calculate prior attainment scores</li>
        <li>Update student records with calculated values</li>
      </ul>
      <div class="vespa-modal-actions" style="margin-top: 20px; text-align: right;">
        <button onclick="closeModal()" class="vespa-button primary">OK</button>
      </div>
    `);
  }
  
  /**
   * Show KS5 Upload (placeholder)
   */
  function showKS5Upload() {
    showModal('KS5 Subject Upload', `
      <p>The KS5 Subject Upload feature is coming soon.</p>
      <p>This feature will allow you to:</p>
      <ul>
        <li>Upload A-Level and Level 3 subject choices</li>
        <li>Automatically calculate MEGs based on prior attainment</li>
        <li>Set initial target grades</li>
      </ul>
      <div class="vespa-modal-actions" style="margin-top: 20px; text-align: right;">
        <button onclick="closeModal()" class="vespa-button primary">OK</button>
      </div>
    `);
  }
  
  /**
   * Show the New Customer Creation Form (Super User only)
   */
  function showNewCustomerForm() {
    debugLog("Loading New Customer Creation form", null, 'info');
    
    // Get the main container
    const mainContainer = document.querySelector(VESPA_UPLOAD_CONFIG.elementSelector);
    if (!mainContainer) {
      showError('Unable to find main container. Please refresh and try again.');
      return;
    }
    
    // Hide the wizard interface
    const wizardContainer = document.getElementById('vespa-upload-wizard');
    if (wizardContainer) wizardContainer.style.display = 'none';
    
    // Create the new customer form container
    const formContainer = document.createElement('div');
    formContainer.id = 'vespa-new-customer-form';
    formContainer.innerHTML = `
      <div class="vespa-customer-form-container" style="padding: 20px; max-width: 900px; margin: 0 auto;">
        <div class="vespa-form-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <h2>VESPA Customer Account Management</h2>
          <button class="vespa-button secondary" onclick="backToUploadWizard()">← Back to Upload System</button>
        </div>
        
        <form id="new-customer-form" style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
          <div class="vespa-flow-selector" style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <label for="flow-type" style="display: block; font-weight: bold; margin-bottom: 10px;">
              Select Action <span style="color: red;">*</span>
            </label>
            <select id="flow-type" name="flowType" required onchange="handleFlowTypeChange()"
              style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 16px;">
              <option value="">-- Select an action --</option>
              <option value="new-invoice-email" selected="selected">Set up new user - generate invoice AND send welcome email</option>
              <option value="new-lead">Generate new lead and send email proposal</option>
            </select>
          </div>
          
          <div id="load-from-leads-container" style="text-align: right; margin-bottom: 20px; display: none;">
            <button type="button" id="load-from-leads-btn" class="vespa-button secondary" onclick="showLoadFromLeadsModal()">
              📋 Load from Leads
            </button>
          </div>
          
          <div id="lead-form-container" style="display: none;">
            <!-- Lead form will be dynamically inserted here -->
          </div>
          
          <div class="customer-form-section">
          <h3 style="color: #007bff; margin-bottom: 20px;">Organization Information</h3>
          
          <div class="vespa-form-group" style="margin-bottom: 20px;">
            <label for="org-name" style="display: block; font-weight: bold; margin-bottom: 5px;">
              Organization Name <span style="color: red;">*</span>
            </label>
            <input type="text" id="org-name" name="orgName" required 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
              placeholder="e.g., Springfield Academy">
          </div>
          
          <div class="vespa-form-group" style="margin-bottom: 20px;">
            <label for="centre-number" style="display: block; font-weight: bold; margin-bottom: 5px;">
              Centre Number <span style="color: red;">*</span>
            </label>
            <input type="text" id="centre-number" name="centreNumber" required 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
              placeholder="e.g., 123456">
          </div>
          
          <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div class="vespa-form-group">
              <label for="address" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Address <span style="color: red;">*</span>
              </label>
              <textarea id="address" name="address" required rows="3"
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                placeholder="Street address, City, Postal code"></textarea>
            </div>
            
            <div class="vespa-form-group">
              <label for="phone" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Phone Number <span style="color: red;">*</span>
              </label>
              <input type="tel" id="phone" name="phone" required 
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                placeholder="e.g., +44 20 1234 5678">
            </div>
          </div>
          
          <div class="vespa-form-group" style="margin-bottom: 30px;">
            <label for="logo-url" style="display: block; font-weight: bold; margin-bottom: 5px;">
              School Logo URL (optional)
            </label>
            <input type="url" id="logo-url" name="logoUrl" 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
              placeholder="https://example.com/logo.png">
          </div>
          
          <h3 style="color: #007bff; margin-bottom: 20px;">Account Configuration</h3>
          
          <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div class="vespa-form-group">
              <label for="account-type" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Account Type <span style="color: red;">*</span>
              </label>
              <select id="account-type" name="accountType" required onchange="handleAccountTypeChange()"
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                <option value="">-- Select Account Type --</option>
                <option value="COACHING PORTAL">COACHING PORTAL - Full coaching portal access</option>
                <option value="RESOURCE PORTAL">RESOURCE PORTAL - Resource portal only</option>
              </select>
            </div>
            
            <div class="vespa-form-group">
              <label for="account-level" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Account Level <span style="color: red;">*</span>
              </label>
              <select id="account-level" name="accountLevel" required 
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
                <option value="">-- Select Level --</option>
                <option value="Level 2">Level 2 Only</option>
                <option value="Level 3">Level 3 Only</option>
                <option value="Level 2&3">Level 2 & 3 Combined</option>
              </select>
            </div>
          </div>
          
          <div class="vespa-form-group" style="margin-bottom: 20px;">
            <label for="resource-size" style="display: block; font-weight: bold; margin-bottom: 5px;">
              Tutor Resource Size
            </label>
            <select id="resource-size" name="resourceSize" 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
              <option value="INDIVIDUAL">Individual</option>
              <option value="SMALL">Small</option>
              <option value="MEDIUM" selected>Medium</option>
              <option value="LARGE">Large</option>
              <option value="COLLEGE">College</option>
              <option value="ACADEMY TRUST">Academy Trust</option>
            </select>
          </div>
          
          <h3 style="color: #28a745; margin-bottom: 20px;">Order Details</h3>
          
          <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div class="vespa-form-group">
              <label for="admin-name" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Staff Admin Name <span style="color: red;">*</span>
              </label>
              <input type="text" id="admin-name" name="adminName" required 
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                placeholder="e.g., John Smith">
            </div>
            
            <div class="vespa-form-group">
              <label for="admin-email" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Staff Admin Email <span style="color: red;">*</span>
              </label>
              <input type="email" id="admin-email" name="adminEmail" required 
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                placeholder="e.g., admin@school.edu"
                onblur="checkEmailAvailability()">
              <div id="email-availability-message" style="font-size: 12px; margin-top: 5px;"></div>
            </div>
          </div>
          
          <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div class="vespa-form-group">
              <label for="finance-contact" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Finance Contact Name
              </label>
              <input type="text" id="finance-contact" name="financeContact" 
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                placeholder="e.g., Jane Smith">
            </div>
            
            <div class="vespa-form-group">
              <label for="finance-email" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Finance Email
              </label>
              <input type="email" id="finance-email" name="financeEmail" 
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                placeholder="e.g., finance@school.edu">
            </div>
          </div>
          
          <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div class="vespa-form-group">
              <label for="quantity" id="quantity-label" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Quantity <span style="color: red;">*</span>
              </label>
              <input type="number" id="quantity" name="quantity" required min="1" value="100"
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                onchange="calculateTotal()" oninput="calculateTotal()">
            </div>
            
            <div class="vespa-form-group">
              <label for="rate" id="rate-label" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Rate (£) <span style="color: red;">*</span>
              </label>
              <input type="number" id="rate" name="rate" required min="0" step="0.01" value="25.00"
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                onchange="calculateTotal()" oninput="calculateTotal()">
            </div>
            
            <div class="vespa-form-group">
              <label for="discount" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Discount (%)
              </label>
              <input type="number" id="discount" name="discount" min="0" max="100" value="0"
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                onchange="calculateTotal()" oninput="calculateTotal()">
            </div>
          </div>
          
          <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px;">
            <div class="vespa-form-group">
              <label for="po-number" style="display: block; font-weight: bold; margin-bottom: 5px;">
                Purchase Order Number
              </label>
              <input type="text" id="po-number" name="poNumber" 
                style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
                placeholder="Optional">
            </div>
            
            <div class="vespa-form-group">
              <label style="display: block; font-weight: bold; margin-bottom: 5px;">
                VAT Chargeable
              </label>
              <div style="margin-top: 10px;">
                <label style="margin-right: 20px;">
                  <input type="radio" name="vatChargeable" value="Yes" checked onchange="calculateTotal()" onclick="calculateTotal()"> Yes
                </label>
                <label>
                  <input type="radio" name="vatChargeable" value="No" onchange="calculateTotal()" onclick="calculateTotal()"> No
                </label>
              </div>
            </div>
            
            <div class="vespa-form-group">
              <label style="display: block; font-weight: bold; margin-bottom: 5px;">
                Total (£)
              </label>
              <div id="order-total" style="font-size: 24px; font-weight: bold; color: #28a745; padding: 8px;">
                £0.00
              </div>
            </div>
          </div>
          
          <div class="vespa-form-group" style="margin-bottom: 20px;">
            <label for="invoice-url" style="display: block; font-weight: bold; margin-bottom: 5px;">
              Invoice/Estimate URL
            </label>
            <input type="url" id="invoice-url" name="invoiceUrl" 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
              placeholder="https://quickbooks.intuit.com/invoice/...">
            <div class="help-text" style="font-size: 12px; color: #666; margin-top: 5px;">
              Optional: Enter the QuickBooks invoice or estimate URL to include in the welcome email
            </div>
          </div>
          
          <div class="vespa-form-group" style="margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 4px;">
            <label style="display: flex; align-items: center; cursor: pointer;">
              <input type="checkbox" id="bcc-admin" name="bccAdmin" value="true" 
                style="margin-right: 10px; width: 18px; height: 18px;">
              <span style="font-weight: bold;">BCC Welcome Email to Admin (Testing)</span>
            </label>
            <div class="help-text" style="font-size: 12px; color: #666; margin-top: 5px; margin-left: 28px;">
              Send a copy of the welcome email to admin@vespa.academy for testing purposes
            </div>
          </div>
          
          <div id="cycle-section" style="display: none;">
            <h3 style="color: #ff6f00; margin-bottom: 20px;">Cycle Configuration</h3>
            
            <div class="vespa-form-group" style="margin-bottom: 20px;">
              <label style="display: block; font-weight: bold; margin-bottom: 10px;">
                How would you like to set the cycles?
              </label>
              <div>
                <label style="margin-right: 20px;">
                  <input type="radio" name="cycleMode" value="automatic" checked onchange="handleCycleModeChange()"> 
                  Automatic (based on order date)
                </label>
                <label>
                  <input type="radio" name="cycleMode" value="manual" onchange="handleCycleModeChange()"> 
                  Manual
                </label>
              </div>
            </div>
            
            <div id="automatic-cycles-info" style="background: #fff3cd; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
              <p style="margin: 0;"><strong>Automatic cycles will be calculated based on today's date.</strong></p>
            </div>
            
            <div id="manual-cycles" style="display: none;">
              <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 2fr 2fr; gap: 20px; margin-bottom: 10px;">
                <div><strong>Cycle</strong></div>
                <div><strong>Start Date</strong></div>
                <div><strong>End Date</strong></div>
              </div>
              
              <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 2fr 2fr; gap: 20px; margin-bottom: 10px;">
                <div style="padding: 8px;">Cycle 1</div>
                <div><input type="date" id="cycle1-start" name="cycle1Start" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"></div>
                <div><input type="date" id="cycle1-end" name="cycle1End" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"></div>
              </div>
              
              <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 2fr 2fr; gap: 20px; margin-bottom: 10px;">
                <div style="padding: 8px;">Cycle 2</div>
                <div><input type="date" id="cycle2-start" name="cycle2Start" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"></div>
                <div><input type="date" id="cycle2-end" name="cycle2End" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"></div>
              </div>
              
              <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 2fr 2fr; gap: 20px; margin-bottom: 10px;">
                <div style="padding: 8px;">Cycle 3</div>
                <div><input type="date" id="cycle3-start" name="cycle3Start" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"></div>
                <div><input type="date" id="cycle3-end" name="cycle3End" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"></div>
              </div>
            </div>
          </div>
          </div> <!-- End of customer-form-section -->
          
          <div class="vespa-form-actions" style="margin-top: 30px; text-align: right;">
            <button type="button" class="vespa-button secondary" onclick="backToUploadWizard()">Cancel</button>
            <button type="submit" class="vespa-button primary" id="create-customer-btn">Create Customer Account</button>
          </div>
        </form>
        
        <div id="creation-status" style="display: none; margin-top: 20px; padding: 20px; border-radius: 8px;"></div>
      </div>
    `;
    
    // Append the form to the main container
    mainContainer.appendChild(formContainer);
    
    // Add form submission handler
    document.getElementById('new-customer-form').addEventListener('submit', handleNewCustomerSubmit);
    
    // Initialize total calculation after a small delay to ensure DOM is ready
    setTimeout(() => {
        // Set default flow type to new-invoice-email
        const flowTypeSelect = document.getElementById('flow-type');
        if (flowTypeSelect && !flowTypeSelect.value) {
            flowTypeSelect.value = 'new-invoice-email';
        }
        
        // Initialize flow type (shows Load from Leads button for default selection)
        handleFlowTypeChange();
        
        // Ensure calculateTotal is available
        if (typeof window.calculateTotal === 'function') {
            window.calculateTotal();
            // Also call it again after another small delay in case values aren't loaded yet
            setTimeout(() => window.calculateTotal(), 100);
            setTimeout(() => window.calculateTotal(), 500); // One more time to be sure
        } else {
            debugLog("calculateTotal function not found during initialization", null, 'error');
        }
        
        // Check initial account type
        if (typeof window.handleAccountTypeChange === 'function') {
            window.handleAccountTypeChange();
        }
    }, 50);
  }
  
  /**
   * Handle account type change
   */
  // handleAccountTypeChange is defined directly on window below
  
  /**
   * Check email availability (placeholder function)
   */
  window.checkEmailAvailability = async function() {
    const emailInput = document.getElementById('admin-email');
    const messageDiv = document.getElementById('email-availability-message');
    
    if (!emailInput || !messageDiv) return;
    
    const email = emailInput.value.trim();
    if (!email || !email.includes('@')) {
      messageDiv.textContent = '';
      return;
    }
    
    // For now, just show a placeholder message
    // In future, this could check against Knack API
    messageDiv.style.color = '#28a745';
    messageDiv.textContent = '✓ Email format valid';
  }
  
  /**
   * Calculate order total - Global function for new customer form
   */
  window.calculateTotal = function() {
    const quantityEl = document.getElementById('quantity');
    const rateEl = document.getElementById('rate');
    const discountEl = document.getElementById('discount');
    
    if (!quantityEl || !rateEl || !discountEl) {
      debugLog("calculateTotal: Required elements not found", {
        quantity: !!quantityEl,
        rate: !!rateEl,
        discount: !!discountEl
      }, 'warn');
      return;
    }
    
    const quantity = parseFloat(quantityEl.value) || 0;
    const rate = parseFloat(rateEl.value) || 0;
    const discount = parseFloat(discountEl.value) || 0;
    const vatCheckbox = document.querySelector('input[name="vatChargeable"]:checked');
    const vatChargeable = vatCheckbox ? vatCheckbox.value === 'Yes' : true;
    
    let subtotal = quantity * rate;
    let discountAmount = subtotal * (discount / 100);
    let afterDiscount = subtotal - discountAmount;
    let vatAmount = vatChargeable ? afterDiscount * 0.20 : 0; // 20% VAT
    let total = afterDiscount + vatAmount;
    
    debugLog("calculateTotal calculation:", {
      quantity,
      rate,
      discount,
      vatChargeable,
      subtotal,
      discountAmount,
      afterDiscount,
      vatAmount,
      total
    });
    
    const orderTotalEl = document.getElementById('order-total');
    if (orderTotalEl) {
      orderTotalEl.textContent = `£${total.toFixed(2)}`;
      debugLog(`calculateTotal: Updated total to £${total.toFixed(2)}`, null, 'success');
    } else {
      debugLog("calculateTotal: order-total element not found", null, 'error');
    }
  }
  
  /**
   * Handle flow type change
   */
  function handleFlowTypeChange() {
    const flowType = document.getElementById('flow-type').value;
    debugLog("Flow type changed to:", flowType);
    
    // Toggle between customer form and lead form
    const customerFormElements = document.querySelectorAll('.customer-form-section');
    const leadFormElements = document.querySelectorAll('.lead-form-section');
    const loadFromLeadsContainer = document.getElementById('load-from-leads-container');
    const submitBtn = document.getElementById('create-customer-btn');
    
    if (flowType === 'new-lead') {
      // Hide customer-specific sections, show lead sections
      customerFormElements.forEach(el => {
        el.style.display = 'none';
        // Disable required fields in hidden sections to prevent validation errors
        el.querySelectorAll('[required]').forEach(input => {
          input.setAttribute('data-was-required', 'true');
          input.removeAttribute('required');
        });
      });
      if (loadFromLeadsContainer) loadFromLeadsContainer.style.display = 'none';
      // Show lead form
      showLeadForm();
      // Update submit button text
      if (submitBtn) submitBtn.textContent = 'Create Lead & Send Proposal';
    } else if (flowType === 'new-invoice-email') {
      // Show customer form sections
      customerFormElements.forEach(el => {
        el.style.display = 'block';
        // Re-enable required fields that were disabled
        el.querySelectorAll('[data-was-required]').forEach(input => {
          input.setAttribute('required', '');
          input.removeAttribute('data-was-required');
        });
      });
      // Hide lead form if it exists
      const leadForm = document.getElementById('lead-form-container');
      if (leadForm) leadForm.style.display = 'none';
      
      // Show "Load from Leads" container
      if (loadFromLeadsContainer) loadFromLeadsContainer.style.display = 'block';
      
      // Update submit button text
      if (submitBtn) submitBtn.textContent = 'Create Customer Account';
    }
  }
  
  /**
   * Handle account type change
   */
  window.handleAccountTypeChange = function() {
    const accountType = document.getElementById('account-type').value;
    const cycleSection = document.getElementById('cycle-section');
    const quantityLabel = document.getElementById('quantity-label');
    const rateLabel = document.getElementById('rate-label');
    
    if (accountType === 'COACHING PORTAL') {
      cycleSection.style.display = 'block';
      // Update labels for coaching portal (student-based)
      if (quantityLabel) quantityLabel.innerHTML = 'Student Quantity <span style="color: red;">*</span>';
      if (rateLabel) rateLabel.innerHTML = 'Rate per Student (£) <span style="color: red;">*</span>';
    } else {
      cycleSection.style.display = 'none';
      // Update labels for resource portal (generic)
      if (quantityLabel) quantityLabel.innerHTML = 'Quantity <span style="color: red;">*</span>';
      if (rateLabel) rateLabel.innerHTML = 'Rate (£) <span style="color: red;">*</span>';
    }
  }
  
  /**
   * Handle cycle mode change
   */
  window.handleCycleModeChange = function() {
    const cycleMode = document.querySelector('input[name="cycleMode"]:checked').value;
    const manualCycles = document.getElementById('manual-cycles');
    const automaticInfo = document.getElementById('automatic-cycles-info');
    
    if (cycleMode === 'manual') {
      manualCycles.style.display = 'block';
      automaticInfo.style.display = 'none';
    } else {
      manualCycles.style.display = 'none';
      automaticInfo.style.display = 'block';
    }
  }
  
  // This function is moved to global scope after this function definition
  
  /**
   * Show load from leads modal
   */
  function showLoadFromLeadsModal() {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'vespa-modal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;';
    
    modal.innerHTML = `
      <div class="vespa-modal-content" style="background: white; padding: 30px; border-radius: 8px; max-width: 800px; width: 90%; max-height: 80vh; overflow-y: auto;">
        <h3 style="margin: 0 0 20px 0; color: #007bff;">Load Customer Data from Lead</h3>
        <p style="margin: 0 0 20px 0; color: #666;">Select a lead to populate the customer form:</p>
        
        <div id="leads-loading" style="text-align: center; padding: 40px;">
          <div class="spinner-border" style="width: 3rem; height: 3rem; border: 0.25em solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spinner-border .75s linear infinite;"></div>
          <p style="margin-top: 10px;">Loading leads...</p>
        </div>
        
        <div id="leads-list" style="display: none;"></div>
        
        <div style="margin-top: 20px; text-align: right;">
          <button type="button" class="vespa-button secondary" onclick="closeLeadsModal()">Cancel</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Load leads
    loadLeads();
  }
  
  /**
   * Close the leads modal
   */
  function closeLeadsModal() {
    const modal = document.querySelector('.vespa-modal');
    if (modal) modal.remove();
  }
  
  /**
   * Load leads from API
   */
  async function loadLeads() {
    try {
      debugLog("Loading leads from API", null, 'info');
      debugLog("API URL being used:", `${API_BASE_URL}leads/list?converted=false`, 'info');
      
      const response = await $.ajax({
        url: `${API_BASE_URL}leads/list?converted=false`,
        type: 'GET',
        xhrFields: { withCredentials: true }
      });
      
      debugLog("Leads API response:", response);
      debugLog("Number of leads received:", response.leads ? response.leads.length : 0, 'info');
      
      const loadingDiv = document.getElementById('leads-loading');
      const listDiv = document.getElementById('leads-list');
      
      if (loadingDiv) loadingDiv.style.display = 'none';
      if (listDiv) {
        listDiv.style.display = 'block';
        
        if (response.success && response.leads && response.leads.length > 0) {
          let leadsHtml = '';
          // Store leads data globally for filtering
          window.leadsData = response.leads;
          
          // Log first lead to see field structure
          if (response.leads.length > 0) {
            debugLog("First lead data structure:", response.leads[0], 'info');
            // Log all field names to see what's available
            debugLog("All field names in first lead:", Object.keys(response.leads[0]), 'info');
            // Specifically log email field to debug [object Object] issue
            debugLog("First lead email field (field_3440):", response.leads[0].field_3440, 'info');
            debugLog("Type of email field:", typeof response.leads[0].field_3440, 'info');
            if (typeof response.leads[0].field_3440 === 'object') {
              debugLog("Email object keys:", Object.keys(response.leads[0].field_3440), 'info');
              debugLog("Email object values:", response.leads[0].field_3440, 'info');
            }
            // Also log phone, address, and logo URL fields
            if (response.leads[0].field_3442 || response.leads[0].field_3442_raw) {
              debugLog("Phone field (field_3442) type:", typeof response.leads[0].field_3442, 'info');
              if (typeof response.leads[0].field_3442 === 'object') {
                debugLog("Phone object:", response.leads[0].field_3442, 'info');
              }
              // Check for _raw version
              if (response.leads[0].field_3442_raw) {
                debugLog("Phone field_raw (field_3442_raw):", response.leads[0].field_3442_raw, 'info');
              }
            }
            if (response.leads[0].field_3441 || response.leads[0].field_3441_raw) {
              debugLog("Address field (field_3441) type:", typeof response.leads[0].field_3441, 'info');
              if (typeof response.leads[0].field_3441 === 'object') {
                debugLog("Address object:", response.leads[0].field_3441, 'info');
              }
              // Check for _raw version
              if (response.leads[0].field_3441_raw) {
                debugLog("Address field_raw (field_3441_raw):", response.leads[0].field_3441_raw, 'info');
              }
            }
            if (response.leads[0].field_3444 || response.leads[0].field_3444_raw) {
              debugLog("Logo URL field (field_3444) type:", typeof response.leads[0].field_3444, 'info');
              if (typeof response.leads[0].field_3444 === 'object') {
                debugLog("Logo URL object:", response.leads[0].field_3444, 'info');
              }
              // Check for _raw version
              if (response.leads[0].field_3444_raw) {
                debugLog("Logo URL field_raw (field_3444_raw):", response.leads[0].field_3444_raw, 'info');
              }
            }
          }
          
          response.leads.forEach(lead => {
            // Handle both raw and processed contact name formats
            let contactName = '';
            if (lead.field_3530_raw && typeof lead.field_3530_raw === 'object') {
              contactName = `${lead.field_3530_raw.first || ''} ${lead.field_3530_raw.last || ''}`.trim();
            } else if (lead.field_3530 && typeof lead.field_3530 === 'object') {
              contactName = `${lead.field_3530.first || ''} ${lead.field_3530.last || ''}`.trim();
            } else {
              contactName = lead.field_3530 || 'No name';
            }
            
            const product = lead.field_3531 || 'Not specified';
            const accounts = lead.field_3532 || 'N/A';
            const converted = lead.field_3447 === 'Yes';
            
            // Extract email properly from object or string
            let email = 'No email';
            // Check _raw version first
            if (lead.field_3440_raw) {
              email = lead.field_3440_raw;
            } else if (lead.field_3440) {
              if (typeof lead.field_3440 === 'string') {
                email = lead.field_3440;
              } else if (typeof lead.field_3440 === 'object') {
                // Try different possible object structures
                email = lead.field_3440.email || 
                        lead.field_3440.email_raw ||
                        lead.field_3440.raw || 
                        lead.field_3440.value ||
                        lead.field_3440.formatted ||
                        lead.field_3440.field_3440 || // Sometimes Knack nests the field name
                        JSON.stringify(lead.field_3440);
              }
            }
            
            leadsHtml += `
              <div class="lead-item" data-lead-id="${lead.id}" 
                style="background: #f8f9fa; padding: 15px; margin-bottom: 10px; border-radius: 4px; cursor: pointer; border: 1px solid #ddd; transition: all 0.2s;" 
                onmouseover="this.style.backgroundColor='#e9ecef'; this.style.borderColor='#007bff';" 
                onmouseout="this.style.backgroundColor='#f8f9fa'; this.style.borderColor='#ddd';">
                
                <div style="display: flex; justify-content: space-between; align-items: start;">
                  <div style="flex: 1;">
                    <h4 style="margin: 0 0 5px 0; color: #007bff;">${lead.field_3439 || 'Unknown Organization'}</h4>
                    <p style="margin: 0; color: #666; font-size: 14px;">
                      <strong>Contact:</strong> ${contactName} | 
                      <strong>Email:</strong> ${email} | 
                      <strong>Product:</strong> ${product}
                      ${product !== 'Training' ? ` | <strong>Accounts:</strong> ${accounts}` : ''}
                    </p>
                    <p style="margin: 5px 0 0 0; color: #999; font-size: 12px;">
                      Lead Date: ${lead.field_3443 ? new Date(lead.field_3443).toLocaleDateString() : 'Unknown'}
                    </p>
                  </div>
                  <div style="text-align: right;">
                    ${converted ? 
                      '<span style="background: #d4edda; color: #155724; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Converted</span>' : 
                      '<span style="background: #fff3cd; color: #856404; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Open</span>'
                    }
                  </div>
                </div>
                
                ${lead.field_3445 ? `<p style="margin: 10px 0 0 0; font-size: 14px; color: #777;"><em>${lead.field_3445}</em></p>` : ''}
              </div>
            `;
          });
          listDiv.innerHTML = leadsHtml;
          
          // Add click event listeners to lead items using event delegation
          listDiv.addEventListener('click', function(e) {
            const leadItem = e.target.closest('.lead-item');
            if (leadItem) {
              const leadId = leadItem.getAttribute('data-lead-id');
              if (leadId) {
                debugLog("Lead item clicked, ID:", leadId);
                // Call loadLeadData directly instead of going through window.selectLead
                if (typeof loadLeadData === 'function') {
                  loadLeadData(leadId);
                } else if (typeof window.loadLeadData === 'function') {
                  window.loadLeadData(leadId);
                } else {
                  debugLog("loadLeadData function not found!", null, 'error');
                }
              }
            }
          });
        } else {
          listDiv.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No unconverted leads found.</p>';
        }
      }
    } catch (error) {
      debugLog("Error loading leads:", error, 'error');
      debugLog("Error details:", {
        status: error.status,
        statusText: error.statusText,
        responseText: error.responseText,
        message: error.message
      }, 'error');
      
      const loadingDiv = document.getElementById('leads-loading');
      const listDiv = document.getElementById('leads-list');
      
      if (loadingDiv) loadingDiv.style.display = 'none';
      if (listDiv) {
        listDiv.style.display = 'block';
        
        let errorMessage = 'Error loading leads. Please try again.';
        if (error.status === 404) {
          errorMessage = 'Leads endpoint not found. Please check API configuration.';
        } else if (error.status === 500) {
          errorMessage = 'Server error loading leads. Please try again later.';
        } else if (error.responseJSON && error.responseJSON.message) {
          errorMessage = error.responseJSON.message;
        }
        
        listDiv.innerHTML = `<p style="text-align: center; color: #dc3545; padding: 40px;">${errorMessage}</p>`;
      }
    }
  }
  
  /**
   * Load data from selected lead
   */
  async function loadLeadData(leadId) {
    try {
      debugLog("Loading lead data for ID:", leadId);
      
      // Get the specific lead data
      const response = await $.ajax({
        url: `${API_BASE_URL}leads/${leadId}`,
        type: 'GET',
        xhrFields: { withCredentials: true }
      });
      
      debugLog("Lead data response:", response);
      
      if (response.success && response.lead) {
        const lead = response.lead;
        
        // Close modal first
        closeLeadsModal();
        
        // Make sure we're on the customer creation flow
        const flowTypeSelect = document.getElementById('flow-type');
        if (flowTypeSelect) {
          flowTypeSelect.value = 'new-invoice-email';
          handleFlowTypeChange();
        }
        
        // Populate form fields
        const form = document.getElementById('new-customer-form');
        if (form) {
          // Declare variables at the top for scope
          let email = '', phone = '', address = '', logoUrl = '';
          let firstName = '', lastName = '';
          
          // Organization info - field_3439 → form.orgName
          if (form.orgName) form.orgName.value = lead.field_3439 || '';
          
          // Handle contact name - field_3530 → adminName
          if (lead.field_3530_raw && typeof lead.field_3530_raw === 'object') {
            firstName = lead.field_3530_raw.first || '';
            lastName = lead.field_3530_raw.last || '';
          } else if (lead.field_3530 && typeof lead.field_3530 === 'object') {
            firstName = lead.field_3530.first || '';
            lastName = lead.field_3530.last || '';
          }
          
          // Admin contact info - combine first and last name into adminName field
          if (form.adminName) {
            form.adminName.value = `${firstName} ${lastName}`.trim();
          }
          
          // Email - field_3440 → adminEmail (handle if it's an object)
          if (form.adminEmail) {
            // Check for _raw version first (when using format=raw)
            if (lead.field_3440_raw) {
              email = lead.field_3440_raw;
              debugLog("Using field_3440_raw for email:", email, 'info');
            } else if (lead.field_3440) {
              if (typeof lead.field_3440 === 'string') {
                email = lead.field_3440;
              } else if (typeof lead.field_3440 === 'object') {
                email = lead.field_3440.email || 
                        lead.field_3440.email_raw ||
                        lead.field_3440.raw || 
                        lead.field_3440.value ||
                        lead.field_3440.formatted ||
                        lead.field_3440.field_3440 || 
                        '';
              }
            }
            form.adminEmail.value = email;
            debugLog("Setting admin email to:", email, 'info');
          }
          
          // Phone - field_3442 → phone (handle if it's an object)
          if (form.phone) {
            // Check for _raw version first (when using format=raw)
            if (lead.field_3442_raw) {
              phone = lead.field_3442_raw;
              debugLog("Using field_3442_raw for phone:", phone, 'info');
            } else if (lead.field_3442) {
              if (typeof lead.field_3442 === 'string') {
                phone = lead.field_3442;
              } else if (typeof lead.field_3442 === 'object') {
                debugLog("Phone object structure:", lead.field_3442, 'info');
                debugLog("Phone object keys:", Object.keys(lead.field_3442), 'info');
                phone = lead.field_3442.phone || 
                        lead.field_3442.phone_raw ||
                        lead.field_3442.number ||
                        lead.field_3442.full ||
                        lead.field_3442.raw || 
                        lead.field_3442.value ||
                        lead.field_3442.formatted ||
                        lead.field_3442.field_3442 || 
                        JSON.stringify(lead.field_3442); // Show structure if nothing else works
              }
            }
            form.phone.value = phone;
            debugLog("Setting phone to:", phone, 'info');
          }
          
          // Logo URL - field_3444 → logoUrl (handle if it's an object)
          if (form.logoUrl) {
            // Check for _raw version first (when using format=raw)
            if (lead.field_3444_raw) {
              logoUrl = lead.field_3444_raw;
              debugLog("Using field_3444_raw for logo URL:", logoUrl, 'info');
            } else if (lead.field_3444) {
              if (typeof lead.field_3444 === 'string') {
                logoUrl = lead.field_3444;
              } else if (typeof lead.field_3444 === 'object') {
                debugLog("Logo URL object structure:", lead.field_3444, 'info');
                debugLog("Logo URL object keys:", Object.keys(lead.field_3444), 'info');
                logoUrl = lead.field_3444.url || 
                         lead.field_3444.url_raw ||
                         lead.field_3444.href ||
                         lead.field_3444.link ||
                         lead.field_3444.raw || 
                         lead.field_3444.value ||
                         lead.field_3444.formatted ||
                         lead.field_3444.field_3444 || 
                         JSON.stringify(lead.field_3444); // Show structure if nothing else works
              }
            }
            form.logoUrl.value = logoUrl;
            debugLog("Setting logo URL to:", logoUrl, 'info');
          }
          
          // Address - field_3441 → address (handle if it's an object)
          if (form.address) {
            // Check for _raw version first (when using format=raw)
            if (lead.field_3441_raw) {
              // Raw address might still be an object with components
              if (typeof lead.field_3441_raw === 'string') {
                address = lead.field_3441_raw;
                debugLog("Using field_3441_raw for address (string):", address, 'info');
              } else if (typeof lead.field_3441_raw === 'object') {
                debugLog("field_3441_raw is an object:", lead.field_3441_raw, 'info');
                // Try to build from components
                const parts = [];
                if (lead.field_3441_raw.street) parts.push(lead.field_3441_raw.street);
                if (lead.field_3441_raw.street2) parts.push(lead.field_3441_raw.street2);
                if (lead.field_3441_raw.city) parts.push(lead.field_3441_raw.city);
                if (lead.field_3441_raw.state) parts.push(lead.field_3441_raw.state);
                if (lead.field_3441_raw.zip) parts.push(lead.field_3441_raw.zip);
                address = parts.join(', ');
              }
            } else if (lead.field_3441) {
              if (typeof lead.field_3441 === 'string') {
                address = lead.field_3441;
              } else if (typeof lead.field_3441 === 'object') {
                // Address might be a complex object with street, city, state, etc.
                debugLog("Address object structure:", lead.field_3441, 'info');
                debugLog("Address object keys:", Object.keys(lead.field_3441), 'info');
                
                // Try different Knack address formats
                if (lead.field_3441.street || lead.field_3441.street1 || lead.field_3441.address || lead.field_3441.city) {
                  // Build address from components
                  const parts = [];
                  // Street address (different possible field names)
                  const street = lead.field_3441.street || lead.field_3441.street1 || lead.field_3441.address || lead.field_3441.line1;
                  if (street) parts.push(street);
                  
                  // Street 2
                  const street2 = lead.field_3441.street2 || lead.field_3441.line2;
                  if (street2) parts.push(street2);
                  
                  // City
                  if (lead.field_3441.city) parts.push(lead.field_3441.city);
                  
                  // State/Province
                  const state = lead.field_3441.state || lead.field_3441.province;
                  if (state) parts.push(state);
                  
                  // Zip/Postal code
                  const zip = lead.field_3441.zip || lead.field_3441.postal_code || lead.field_3441.postalcode;
                  if (zip) parts.push(zip);
                  
                  // Country
                  if (lead.field_3441.country) parts.push(lead.field_3441.country);
                  
                  address = parts.join(', ');
                } else if (lead.field_3441.formatted) {
                  // Sometimes Knack provides a pre-formatted address
                  address = lead.field_3441.formatted;
                } else {
                  // Try generic object properties or just stringify it for debugging
                  address = lead.field_3441.address || 
                           lead.field_3441.address_raw ||
                           lead.field_3441.raw || 
                           lead.field_3441.value ||
                           lead.field_3441.full ||
                           JSON.stringify(lead.field_3441); // Last resort to see what's in there
                }
              }
            }
            form.address.value = address;
            debugLog("Setting address to:", address, 'info');
          }
          
          // Pre-populate invoice URL from estimate link if available
          if (form.invoiceUrl && lead.field_3446) {
            form.invoiceUrl.value = lead.field_3446;
          }
          
          // Notes - field_3445 → could map to PO number or finance notes
          // Check if notes contain a PO number pattern
          if (lead.field_3445) {
            const notes = lead.field_3445;
            // Look for PO number pattern in notes (e.g., "PO: 12345" or "PO#12345")
            const poMatch = notes.match(/PO[:#\s-]*(\S+)/i);
            if (poMatch && form.poNumber) {
              form.poNumber.value = poMatch[1];
            }
            // You could also add the full notes to a notes field if you have one
          }
          
          // Product - field_3531 → accountType
          if (lead.field_3531 && form.accountType) {
            // Set account type based on product
            if (lead.field_3531 === 'Coaching Portal' || lead.field_3531.toLowerCase().includes('coaching')) {
              form.accountType.value = 'COACHING PORTAL';
            } else if (lead.field_3531 === 'Resource Portal' || lead.field_3531.toLowerCase().includes('resource')) {
              form.accountType.value = 'RESOURCE PORTAL';
            }
            // Trigger account type change to show/hide relevant fields
            handleAccountTypeChange();
          }
          
          // Number of accounts - field_3532 → quantity
          if (form.quantity && lead.field_3532) {
            form.quantity.value = lead.field_3532;
          }
          
          debugLog("Lead data mapped to form fields", {
            orgName: lead.field_3439,
            contact: `${firstName} ${lastName}`,
            email: email, // Use the extracted value
            phone: phone, // Use the extracted value
            address: address, // Use the extracted value
            logoUrl: logoUrl, // Use the extracted value
            product: lead.field_3531,
            accounts: lead.field_3532,
            notes: lead.field_3445,
            estimateLink: lead.field_3446
          }, 'info');
          
          // Log raw lead data for debugging field structures
          debugLog("Raw lead data structure:", lead, 'info');
          
          // Store lead ID for conversion tracking
          window.convertedLeadId = leadId;
          
          // Show success message
          showSuccess(`Lead "${lead.field_3439}" loaded successfully. Please complete the remaining fields.`);
          
          // Scroll to top of form
          window.scrollTo(0, 0);
          
          // Trigger calculateTotal after a delay to ensure values are loaded
          setTimeout(() => {
            if (typeof calculateTotal === 'function' || typeof window.calculateTotal === 'function') {
              (window.calculateTotal || calculateTotal)();
            }
          }, 100);
        }
      } else {
        throw new Error('Invalid response format or lead not found');
      }
    } catch (error) {
      debugLog("Error loading lead data:", error, 'error');
      showError('Failed to load lead data. Please try again.');
    }
  }
  
  /**
   * Handle product change in lead form
   */
  function handleProductChange() {
    const productSelect = document.getElementById('lead-product');
    const accountsContainer = document.getElementById('lead-accounts-container');
    const accountTypeLabel = document.getElementById('account-type-label');
    const accountTypeHelp = document.getElementById('account-type-help');
    const accountsInput = document.getElementById('lead-accounts');
    
    if (!productSelect || !accountsContainer) return;
    
    const selectedProduct = productSelect.value;
    
    if (selectedProduct === 'Coaching Portal') {
      accountsContainer.style.display = 'block';
      accountTypeLabel.textContent = 'Student Accounts';
      accountTypeHelp.textContent = 'Number of student accounts needed for the coaching portal';
      accountsInput.required = true;
    } else if (selectedProduct === 'Resource Portal') {
      accountsContainer.style.display = 'block';
      accountTypeLabel.textContent = 'Staff Accounts';
      accountTypeHelp.textContent = 'Number of staff accounts needed for the resource portal';
      accountsInput.required = true;
    } else if (selectedProduct === 'Training') {
      accountsContainer.style.display = 'none';
      accountsInput.required = false;
      accountsInput.value = '';
    } else {
      accountsContainer.style.display = 'none';
      accountsInput.required = false;
    }
  }
  
  /**
   * Show the lead form
   */
  function showLeadForm() {
    const leadFormContainer = document.getElementById('lead-form-container');
    if (!leadFormContainer) return;
    
    leadFormContainer.style.display = 'block';
    leadFormContainer.innerHTML = `
      <div class="lead-form-section">
        <h3 style="color: #28a745; margin-bottom: 20px;">Lead Information</h3>
        
        <div class="vespa-form-group" style="margin-bottom: 20px;">
          <label for="lead-date" style="display: block; font-weight: bold; margin-bottom: 5px;">
            Date of Lead <span style="color: red;">*</span>
          </label>
          <input type="date" id="lead-date" name="leadDate" required 
            value="${new Date().toISOString().split('T')[0]}"
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 20px;">
          <label for="lead-org-name" style="display: block; font-weight: bold; margin-bottom: 5px;">
            Organization Name <span style="color: red;">*</span>
          </label>
          <input type="text" id="lead-org-name" name="leadOrgName" required 
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
            placeholder="e.g., Springfield Academy">
        </div>
        
        <div class="vespa-form-row" style="display: grid; grid-template-columns: auto 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div class="vespa-form-group">
            <label for="lead-contact-prefix" style="display: block; font-weight: bold; margin-bottom: 5px;">
              Prefix
            </label>
            <select id="lead-contact-prefix" name="leadContactPrefix" 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
              <option value="">--</option>
              <option value="Mr">Mr</option>
              <option value="Mrs">Mrs</option>
              <option value="Ms">Ms</option>
              <option value="Dr">Dr</option>
              <option value="Prof">Prof</option>
            </select>
          </div>
          
          <div class="vespa-form-group">
            <label for="lead-contact-firstname" style="display: block; font-weight: bold; margin-bottom: 5px;">
              First Name <span style="color: red;">*</span>
            </label>
            <input type="text" id="lead-contact-firstname" name="leadContactFirstname" required 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          </div>
          
          <div class="vespa-form-group">
            <label for="lead-contact-lastname" style="display: block; font-weight: bold; margin-bottom: 5px;">
              Last Name <span style="color: red;">*</span>
            </label>
            <input type="text" id="lead-contact-lastname" name="leadContactLastname" required 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          </div>
        </div>
        
        <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
          <div class="vespa-form-group">
            <label for="lead-email" style="display: block; font-weight: bold; margin-bottom: 5px;">
              Email <span style="color: red;">*</span>
            </label>
            <input type="email" id="lead-email" name="leadEmail" required 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
              placeholder="contact@school.edu">
          </div>
          
          <div class="vespa-form-group">
            <label for="lead-telephone" style="display: block; font-weight: bold; margin-bottom: 5px;">
              Telephone
            </label>
            <input type="tel" id="lead-telephone" name="leadTelephone" 
              style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
              placeholder="+44 20 1234 5678">
          </div>
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 20px;">
          <label for="lead-logo-url" style="display: block; font-weight: bold; margin-bottom: 5px;">
            Logo URL
          </label>
          <input type="url" id="lead-logo-url" name="leadLogoUrl" 
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
            placeholder="https://example.com/logo.png">
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 20px;">
          <label for="lead-product" style="display: block; font-weight: bold; margin-bottom: 5px;">
            Product Interest <span style="color: red;">*</span>
          </label>
          <select id="lead-product" name="leadProduct" required onchange="handleProductChange()"
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <option value="">-- Select Product --</option>
            <option value="Coaching Portal">Coaching Portal</option>
            <option value="Resource Portal">Resource Portal</option>
            <option value="Training">Training</option>
          </select>
        </div>
        
        <div id="lead-accounts-container" class="vespa-form-group" style="margin-bottom: 20px; display: none;">
          <label for="lead-accounts" style="display: block; font-weight: bold; margin-bottom: 5px;">
            Number of <span id="account-type-label">Accounts</span> <span style="color: red;">*</span>
          </label>
          <input type="number" id="lead-accounts" name="leadAccounts" min="1" 
            placeholder="Enter number of accounts"
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          <small id="account-type-help" style="color: #666; display: block; margin-top: 5px;"></small>
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 20px;">
          <label for="lead-estimate-link" style="display: block; font-weight: bold; margin-bottom: 5px;">
            Estimate/Proposal Link <span style="color: red;">*</span>
          </label>
          <input type="url" id="lead-estimate-link" name="leadEstimateLink" required
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
            placeholder="https://quickbooks.intuit.com/estimate/...">
          <div class="help-text" style="font-size: 12px; color: #666; margin-top: 5px;">
            Enter the QuickBooks estimate or proposal URL to include in the email
          </div>
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 20px;">
          <label for="lead-notes" style="display: block; font-weight: bold; margin-bottom: 5px;">
            Notes
          </label>
          <textarea id="lead-notes" name="leadNotes" rows="4"
            style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"
            placeholder="Any additional notes about this lead..."></textarea>
        </div>
        
        <div class="vespa-form-group" style="margin-bottom: 20px; background: #f8f9fa; padding: 15px; border-radius: 4px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="send-lead-email" name="sendLeadEmail" value="true" checked
              style="margin-right: 10px; width: 18px; height: 18px;">
            <span style="font-weight: bold;">Send proposal email immediately</span>
          </label>
          <div class="help-text" style="font-size: 12px; color: #666; margin-top: 5px; margin-left: 28px;">
            Send the proposal email to the lead contact upon creation
          </div>
        </div>
      </div>
    `;
    
    // Update form submit button text
    const submitBtn = document.getElementById('create-customer-btn');
    if (submitBtn) {
      submitBtn.textContent = 'Create Lead & Send Proposal';
    }
  }

  /**
   * Show modal to load from existing leads
   */
  window.showLoadFromLeadsModal = function() {
    debugLog("Opening Load from Leads modal", null, 'info');
    
    // Create modal structure first
    const modalContent = `
      <div class="vespa-leads-modal">
        <div class="vespa-lead-search" style="margin-bottom: 20px;">
          <input type="text" id="lead-search-input" placeholder="Search leads by name, email, or organization..." 
            style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px;"
            onkeyup="filterLeads()">
        </div>
        
        <div id="leads-loading" style="text-align: center; padding: 40px;">
          <div class="vespa-spinner"></div>
          <p>Loading leads...</p>
        </div>
        
        <div id="leads-list" style="display: none; max-height: 400px; overflow-y: auto;">
          <!-- Leads will be populated here -->
        </div>
        
        <div class="vespa-modal-actions" style="margin-top: 20px; text-align: right;">
          <button class="vespa-button secondary" onclick="closeModal()">Cancel</button>
        </div>
      </div>
    `;
    
    showModal('Select Lead to Convert', modalContent);
    
    // Now load the leads using the existing loadLeads function
    loadLeads();
  }
  
  /**
   * Filter leads based on search input
   */
  window.filterLeads = function() {
    const searchTerm = document.getElementById('lead-search-input').value.toLowerCase();
    const leadItems = document.querySelectorAll('.lead-item');
    
    leadItems.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(searchTerm) ? 'block' : 'none';
    });
  }
  
  /**
   * Select a lead and populate the customer form
   */
  window.selectLead = function(leadId) {
    debugLog("Lead selected:", leadId);
    // Use the existing loadLeadData function
    loadLeadData(leadId);
  }

  /**
   * Calculate automatic cycle dates based on order date
   */
  function calculateAutomaticCycles(orderDate) {
    const cycles = [];
    const order = new Date(orderDate);
    const month = order.getMonth(); // 0-11
    const year = order.getFullYear();
    
    // Helper function to get nearest Monday
    function getNearestMonday(date) {
      const d = new Date(date);
      const day = d.getDay();
      const diff = day === 0 ? 1 : (day === 1 ? 0 : 8 - day);
      d.setDate(d.getDate() + diff);
      return d;
    }
    
    // Helper function to add weeks to date
    function addWeeks(date, weeks) {
      const d = new Date(date);
      d.setDate(d.getDate() + (weeks * 7));
      return d;
    }
    
    // Early orders (June 1 - Sept 1)
    if ((month === 5 && order.getDate() >= 1) || month === 6 || month === 7 || (month === 8 && order.getDate() === 1)) {
      // Cycle 1: Nearest Monday to Sept 1
      const sept1 = new Date(year, 8, 1);
      const cycle1Start = getNearestMonday(sept1);
      const cycle1End = addWeeks(cycle1Start, 4); // 4 weeks
      
      // Cycle 2: Nearest Monday to Jan 1
      const jan1 = new Date(year + 1, 0, 1);
      const cycle2Start = getNearestMonday(jan1);
      const cycle2End = addWeeks(cycle2Start, 4);
      
      // Cycle 3: Nearest Monday to May 1
      const may1 = new Date(year + 1, 4, 1);
      const cycle3Start = getNearestMonday(may1);
      const cycle3End = addWeeks(cycle3Start, 4);
      
      cycles.push(
        { number: 1, start: cycle1Start, end: cycle1End },
        { number: 2, start: cycle2Start, end: cycle2End },
        { number: 3, start: cycle3Start, end: cycle3End }
      );
    }
    // Late orders (Oct 1 - Feb 1)
    else if ((month >= 9) || (month === 0) || (month === 1 && order.getDate() === 1)) {
      // Cycle 1: 1 week after order date
      const cycle1Start = addWeeks(order, 1);
      const cycle1End = addWeeks(cycle1Start, 3); // 3 weeks
      
      // Calculate remaining time until June 1
      const june1 = new Date(month >= 9 ? year + 1 : year, 5, 1);
      const daysUntilJune = Math.floor((june1 - cycle1End) / (1000 * 60 * 60 * 24));
      const weeksPerCycle = Math.floor(daysUntilJune / (2 * 7)) - 1; // Divide by 2 cycles, leave buffer
      
      const cycle2Start = addWeeks(cycle1End, 1);
      const cycle2End = addWeeks(cycle2Start, Math.min(weeksPerCycle, 3));
      
      const cycle3Start = addWeeks(cycle2End, 1);
      const cycle3End = addWeeks(cycle3Start, Math.min(weeksPerCycle, 3));
      
      cycles.push(
        { number: 1, start: cycle1Start, end: cycle1End },
        { number: 2, start: cycle2Start, end: cycle2End },
        { number: 3, start: cycle3Start, end: cycle3End }
      );
    }
    // Holiday orders (Feb 1 - May 1)
    else {
      // Cycles 1 & 2 complete before June 1
      const cycle1Start = addWeeks(order, 1);
      const cycle1End = addWeeks(cycle1Start, 2);
      
      const cycle2Start = addWeeks(cycle1End, 1);
      const cycle2End = addWeeks(cycle2Start, 2);
      
      // Cycle 3: Sept 1
      const sept1 = new Date(year, 8, 1);
      const cycle3Start = getNearestMonday(sept1);
      const cycle3End = addWeeks(cycle3Start, 4);
      
      cycles.push(
        { number: 1, start: cycle1Start, end: cycle1End },
        { number: 2, start: cycle2Start, end: cycle2End },
        { number: 3, start: cycle3Start, end: cycle3End }
      );
    }
    
    return cycles;
  }
  
  /**
   * Handle new customer form submission
   */
  async function handleNewCustomerSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitBtn = document.getElementById('create-customer-btn');
    const statusDiv = document.getElementById('creation-status');
    
    // Check if form exists
    if (!form) {
      showError('Form not found. Please refresh and try again.');
      return;
    }
    
    // Get flow type
    const flowType = form.flowType?.value;
    
    // Handle lead creation
    if (flowType === 'new-lead') {
      await handleLeadCreation(form);
      return;
    }
    
    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';
    
    // Get form data
    debugLog("Form elements:", {
      flowType: form.flowType,
      orgName: form.orgName,
      hasAllElements: !!(form.flowType && form.orgName && form.adminEmail)
    });
    
    // Validate required elements exist
    if (!form.flowType || !form.flowType.value) {
      showError('Please select an action type.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Customer Account';
      return;
    }
    
    const formData = {
      // Flow info
      flowType: form.flowType.value,
      
      // Organization info
      orgName: form.orgName.value.trim(),
      centreNumber: form.centreNumber.value.trim(),
      address: form.address.value.trim(),
      phone: form.phone.value.trim(),
      logoUrl: form.logoUrl.value.trim(),
      
      // Admin info
      adminName: form.adminName.value.trim(),
      adminEmail: form.adminEmail.value.trim(),
      
      // Account config
      accountType: form.accountType.value,
      accountLevel: form.accountLevel.value,
      resourceSize: form.resourceSize.value,
      
      // Order details
      financeContact: form.financeContact.value.trim(),
      financeEmail: form.financeEmail.value.trim(),
      poNumber: form.poNumber.value.trim(),
      quantity: parseInt(form.quantity.value),
      rate: parseFloat(form.rate.value),
      discount: parseFloat(form.discount.value) || 0,
      vatChargeable: form.vatChargeable.value,
      invoiceUrl: form.invoiceUrl.value.trim(),
      bccAdmin: form.bccAdmin && form.bccAdmin.checked || false,
      
      // Cycles (if COACHING PORTAL)
      cycleMode: form.accountType.value === 'COACHING PORTAL' ? form.cycleMode.value : null,
      cycles: []
    };
    
    // Calculate total
    const subtotal = formData.quantity * formData.rate;
    const discountAmount = subtotal * (formData.discount / 100);
    const afterDiscount = subtotal - discountAmount;
    const vatAmount = formData.vatChargeable === 'Yes' ? afterDiscount * 0.20 : 0;
    formData.total = afterDiscount + vatAmount;
    
    // Handle cycles
    if (formData.accountType === 'COACHING PORTAL') {
      if (formData.cycleMode === 'manual') {
        // Get manual cycle dates
        formData.cycles = [
          {
            number: 1,
            start: form.cycle1Start.value,
            end: form.cycle1End.value
          },
          {
            number: 2,
            start: form.cycle2Start.value,
            end: form.cycle2End.value
          },
          {
            number: 3,
            start: form.cycle3Start.value,
            end: form.cycle3End.value
          }
        ];
      } else {
        // Calculate automatic cycles
        formData.cycles = calculateAutomaticCycles(new Date());
      }
    }
    
    debugLog("Submitting new customer data:", formData);
    
    try {
      // Call the API to create the customer and admin account
      const response = await $.ajax({
        url: `${API_BASE_URL}account/create-customer`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(formData),
        xhrFields: { withCredentials: true }
      });
      
      debugLog("Customer creation response:", response);
      
      if (response.success) {
        // Check if this was converted from a lead
        if (window.convertedLeadId) {
          try {
            // Mark the lead as converted
            await $.ajax({
              url: `${API_BASE_URL}leads/${window.convertedLeadId}/convert`,
              type: 'PUT',
              xhrFields: { withCredentials: true }
            });
            debugLog("Lead marked as converted", { leadId: window.convertedLeadId });
            window.convertedLeadId = null; // Clear the flag
          } catch (error) {
            debugLog("Error marking lead as converted:", error, 'warn');
            // Don't fail the whole process if lead conversion update fails
          }
        }
        
        // Show success message
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#d4edda';
        statusDiv.style.color = '#155724';
        statusDiv.innerHTML = `
          <h3>✅ Customer Account Created Successfully!</h3>
          <p><strong>Organization:</strong> ${formData.orgName}</p>
          <p><strong>Customer ID:</strong> ${response.customerId}</p>
          <p><strong>Admin Account:</strong> ${formData.adminEmail}</p>
          <p><strong>Temporary Password:</strong> <code>${response.temporaryPassword}</code></p>
          <div style="margin-top: 20px;">
            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Share the login credentials with the administrator</li>
              <li>They should log in and change their password</li>
              <li>Create staff accounts before adding students</li>
              <li>Configure QuickBooks integration if needed</li>
            </ol>
          </div>
          <button class="vespa-button primary" onclick="backToUploadWizard()" style="margin-top: 20px;">
            Create Another Account
          </button>
        `;
        
        // Clear the form
        form.reset();
        
        // Hide the form
        form.style.display = 'none';
      } else {
        throw new Error(response.message || 'Failed to create customer account');
      }
      
    } catch (error) {
      debugLog("Error creating customer:", error, 'error');
      
      // Show error message
      statusDiv.style.display = 'block';
      statusDiv.style.background = '#f8d7da';
      statusDiv.style.color = '#721c24';
      
      let errorMessage = error.responseJSON?.message || error.message || 'An unexpected error occurred';
      let errorContent = `<h3>❌ Error Creating Account</h3><p>${errorMessage}</p>`;
      
      // Add helpful tips for common errors
      if (errorMessage.includes('already registered as a staff admin')) {
        errorContent += `
          <div style="margin-top: 15px; padding: 10px; background: #fff3cd; color: #856404; border-radius: 4px;">
            <strong>💡 Tip:</strong> You can either:
            <ul style="margin: 10px 0 0 20px;">
              <li>Use a different email address for this new customer</li>
              <li>Use the "Update current user" flow to modify the existing customer</li>
              <li>Contact support if this staff admin should manage multiple customers</li>
            </ul>
          </div>
        `;
      }
      
      errorContent += `
        <button class="vespa-button secondary" onclick="document.getElementById('creation-status').style.display='none'; document.getElementById('new-customer-form').style.display='block';" style="margin-top: 20px;">
          Try Again
        </button>
      `;
      
      statusDiv.innerHTML = errorContent;
    } finally {
      // Re-enable submit button
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Customer Account';
    }
  }

  /**
   * Handle lead creation
   */
  async function handleLeadCreation(form) {
    const submitBtn = document.getElementById('create-customer-btn');
    const statusDiv = document.getElementById('creation-status');
    
    // Disable submit button
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Lead...';
    
    try {
      // Collect lead data
      const leadData = {
        field_3443: form.leadDate?.value || new Date().toISOString().split('T')[0], // Date of lead
        field_3439: form.leadOrgName?.value.trim(), // Organization name
        field_3530: { // Contact name (Person field)
          prefix: form.leadContactPrefix?.value || '',
          first: form.leadContactFirstname?.value.trim(),
          last: form.leadContactLastname?.value.trim()
        },
        field_3440: form.leadEmail?.value.trim(), // Email
        field_3442: form.leadTelephone?.value.trim() || '', // Telephone
        field_3444: form.leadLogoUrl?.value.trim() || '', // Logo URL
        field_3531: form.leadProduct?.value, // Product interest
        field_3532: form.leadAccounts?.value || '', // Number of accounts
        field_3448: 'Yes', // Estimate Sent
        field_3446: form.leadEstimateLink?.value.trim(), // Estimate Link
        field_3445: form.leadNotes?.value.trim() || '', // Notes
        field_3447: 'No' // Converted (default to No)
      };
      
      debugLog("Creating lead with data:", leadData);
      
      // Call API to create lead
      const response = await $.ajax({
        url: `${API_BASE_URL}leads/create`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(leadData),
        xhrFields: { withCredentials: true }
      });
      
      if (response.success) {
        debugLog("Lead created successfully:", response);
        
        // Send proposal email if checkbox is checked
        if (form.sendLeadEmail?.checked) {
          try {
            const emailResponse = await $.ajax({
              url: `${API_BASE_URL}leads/send-proposal`,
              type: 'POST',
              contentType: 'application/json',
              data: JSON.stringify({
                leadId: response.leadId,
                leadData: leadData
              }),
              xhrFields: { withCredentials: true }
            });
            
            debugLog("Proposal email sent:", emailResponse);
          } catch (emailError) {
            debugLog("Error sending proposal email:", emailError, 'error');
            showError('Lead created but failed to send proposal email. You can send it manually later.');
          }
        }
        
        // Show success message
        statusDiv.style.display = 'block';
        statusDiv.style.background = '#d4edda';
        statusDiv.style.color = '#155724';
        statusDiv.innerHTML = `
          <h3>✅ Lead Created Successfully!</h3>
          <p><strong>Organization:</strong> ${leadData.field_3439}</p>
          <p><strong>Contact:</strong> ${leadData.field_3530.first} ${leadData.field_3530.last}</p>
          <p><strong>Email:</strong> ${leadData.field_3440}</p>
          ${form.sendLeadEmail?.checked ? '<p><strong>Status:</strong> Proposal email sent!</p>' : ''}
          <div style="margin-top: 20px;">
            <button class="vespa-button primary" onclick="resetLeadForm()">Create Another Lead</button>
            <button class="vespa-button secondary" onclick="backToUploadWizard()">Back to Main Menu</button>
          </div>
        `;
        
        // Hide the form
        form.style.display = 'none';
        
      } else {
        throw new Error(response.message || 'Failed to create lead');
      }
      
    } catch (error) {
      debugLog("Error creating lead:", error, 'error');
      showError(`Failed to create lead: ${error.responseJSON?.message || error.message || 'Unknown error'}`);
    } finally {
      // Re-enable submit button
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Lead & Send Proposal';
    }
  }
  
  /**
   * Reset lead form
   */
  window.resetLeadForm = function() {
    const form = document.getElementById('new-customer-form');
    const statusDiv = document.getElementById('creation-status');
    
    if (form) {
      form.reset();
      form.style.display = 'block';
      
      // Set flow type back to new-lead
      const flowTypeSelect = document.getElementById('flow-type');
      if (flowTypeSelect) {
        flowTypeSelect.value = 'new-lead';
        handleFlowTypeChange();
      }
    }
    
    if (statusDiv) {
      statusDiv.style.display = 'none';
    }
  }

  /**
   * Show the KS5 Workflow interface
   */
  function showKS5WorkflowInterface() {
    debugLog("Loading KS5 Workflow interface", null, 'info');
    
    // Get the main container (where the wizard is)
    const mainContainer = document.querySelector(VESPA_UPLOAD_CONFIG.elementSelector);
    if (!mainContainer) {
      showError('Unable to find main container. Please refresh and try again.');
      return;
    }
    
    // Hide the wizard interface
    const wizardContainer = document.getElementById('vespa-upload-wizard');
    if (wizardContainer) wizardContainer.style.display = 'none';
    
    // Create a new container for the KS5 workflow
    const ks5Container = document.createElement('div');
    ks5Container.id = 'vespa-ks5-workflow';
    ks5Container.innerHTML = `
      <div class="vespa-ks5-workflow-container" style="padding: 20px;">
        <div class="vespa-workflow-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px;">
          <h2>Key Stage 5 Workflow</h2>
          <button class="vespa-button secondary" data-action="backToUploadWizard">← Back to Upload System</button>
        </div>
        
        <div class="vespa-workflow-steps" style="display: grid; gap: 20px;">
          <div class="vespa-workflow-step" style="background: #f8f9fa; padding: 20px; border-radius: 8px; border-left: 4px solid #007bff;">
            <h3 style="color: #007bff; margin-bottom: 15px;">📊 Step 1: Calculate GCSE Prior Attainment</h3>
            <p style="margin-bottom: 15px;">First, calculate your students' prior attainment scores based on their GCSE results. This step is optional but recommended for accurate MEG calculations.</p>
            
            <div class="vespa-step-content">
              <div class="vespa-info-box" style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 12px; margin-bottom: 15px;">
                <strong>What you need:</strong>
                <ul style="margin: 5px 0 0 20px;">
                  <li>CSV file with student identifiers (Name, UPN, Email)</li>
                  <li>GCSE grades in columns (any number of subjects)</li>
                  <li>Grades should be numeric (1-9) format</li>
                </ul>
              </div>
              
              <div class="vespa-workflow-actions" style="display: flex; gap: 10px;">
                <button class="vespa-button secondary" data-action="downloadGCSETemplate">
                  📥 Download GCSE Template
                </button>
                <button class="vespa-button primary" data-action="showGCSEPriorAttainmentCalculator">
                  🧮 Launch Prior Attainment Calculator
                </button>
              </div>
            </div>
          </div>
          
          <div class="vespa-workflow-step" style="background: #f0f7ff; padding: 20px; border-radius: 8px; border-left: 4px solid #28a745;">
            <h3 style="color: #28a745; margin-bottom: 15px;">📚 Step 2: Upload KS5 Subject Data</h3>
            <p style="margin-bottom: 15px;">Upload your A-Level/Level 3 subject choices along with the prior attainment scores calculated in Step 1.</p>
            
            <div class="vespa-step-content">
              <div class="vespa-info-box" style="background: #e8f5e9; border-left: 4px solid #28a745; padding: 12px; margin-bottom: 15px;">
                <strong>What you need:</strong>
                <ul style="margin: 5px 0 0 20px;">
                  <li>Student identifiers (UPN, Student_Email)</li>
                  <li>GCSE_Prior_Attainment score from Step 1</li>
                  <li>A-Level/Level 3 subjects (sub1, sub2, etc.)</li>
                </ul>
              </div>
              
              <div class="vespa-workflow-actions" style="display: flex; gap: 10px;">
                <button class="vespa-button secondary" data-action="downloadKS5Template">
                  📥 Download KS5 Template
                </button>
                <button class="vespa-button primary" data-action="proceedToKS5Upload">
                  📤 Upload KS5 Data
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div class="vespa-workflow-tips" style="margin-top: 30px; padding: 20px; background: #fff3cd; border-radius: 8px;">
          <h4 style="color: #856404; margin-bottom: 10px;">💡 Tips for Success:</h4>
          <ul style="margin: 0; padding-left: 20px;">
            <li>Complete Step 1 first to get accurate prior attainment scores</li>
            <li>You can manually add prior attainment if you already have the data</li>
            <li>The system will calculate MEGs based on the prior attainment and selected percentile</li>
            <li>Make sure student identifiers match exactly between files</li>
          </ul>
        </div>
      </div>
    `;
    
    // Append the KS5 container to the main container
    mainContainer.appendChild(ks5Container);
    
    // Add event listeners after HTML is created
    setTimeout(() => {
      // Back button
      const backBtn = ks5Container.querySelector('button[data-action="backToUploadWizard"]');
      if (backBtn) {
        backBtn.addEventListener('click', backToUploadWizard);
      }
      
      // GCSE Template button
      const gcseTemplateBtn = ks5Container.querySelector('button[data-action="downloadGCSETemplate"]');
      if (gcseTemplateBtn) {
        gcseTemplateBtn.addEventListener('click', downloadGCSETemplate);
      }
      
      // GCSE Calculator button
      const gcseCalcBtn = ks5Container.querySelector('button[data-action="showGCSEPriorAttainmentCalculator"]');
      if (gcseCalcBtn) {
        gcseCalcBtn.addEventListener('click', showGCSEPriorAttainmentCalculator);
      }
      
      // KS5 Template button
      const ks5TemplateBtn = ks5Container.querySelector('button[data-action="downloadKS5Template"]');
      if (ks5TemplateBtn) {
        ks5TemplateBtn.addEventListener('click', downloadKS5Template);
      }
      
      // Proceed to KS5 Upload button
      const proceedBtn = ks5Container.querySelector('button[data-action="proceedToKS5Upload"]');
      if (proceedBtn) {
        proceedBtn.addEventListener('click', proceedToKS5Upload);
      }
      
      debugLog("KS5 workflow event listeners attached", null, 'success');
    }, 100);
  }
  
  /**
   * Download GCSE template
   */
  function downloadGCSETemplate() {
    const template = `Name,UPN,Email,English,Maths,Science,History,Geography,French,Spanish,Art,Music,PE
John Smith,A123456,jsmith@school.edu,7,8,7-7,6,7,5,,,8,6
Jane Doe,A123457,jdoe@school.edu,8,7,8-8,7,6,,4,7,,5`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gcse_template.csv';
    a.click();
    
    showSuccess('GCSE template downloaded!');
  }
  
  /**
   * Download KS5 template
   */
  function downloadKS5Template() {
    const template = `UPN,Student_Email,GCSE_Prior_Attainment,sub1,sub2,sub3,sub4,sub5
A123456,jsmith@school.edu,7.2,Physics,Chemistry,Maths,Further Maths,
A123457,jdoe@school.edu,6.8,English Literature,History,Psychology,,`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ks5_template.csv';
    a.click();
    
    showSuccess('KS5 template downloaded!');
  }
  
  /**
   * Proceed to KS5 upload
   */
  function proceedToKS5Upload() {
    // Reset to main wizard
    const wizardContainer = document.getElementById('vespa-upload-wizard');
    if (wizardContainer) wizardContainer.style.display = 'block';
    
    // Remove the KS5 workflow container
    const ks5Container = document.getElementById('vespa-ks5-workflow');
    if (ks5Container) ks5Container.remove();
    
    // Clear the content div
    const contentDiv = document.querySelector('.vespa-upload-content');
    if (contentDiv) contentDiv.innerHTML = '';
    
    // Set upload type to KS5 and start from step 1
    uploadType = 'student-ks5';
    currentStep = 1;
    
    // Move directly to file upload step
    currentStep = 2; // Skip type selection
    renderStep(currentStep);
  }

  /**
   * GCSE Prior Attainment Calculator (Client-side)
   * Calculates average GCSE scores for students based on numeric grades (9-1)
   */

  /**
   * Convert a single numeric grade string to base points and entry weight.
   * Handles:
   *  - Numeric grades 9–1 (e.g., "9","7","1") → points = grade, weight = 1
   *  - Short-course suffix "/SC" or "-SC" (e.g., "5-SC") → weight 0.5
   *  - Double-award combined grades with hyphen (e.g., "8-7") → sum of both grades, weight = 2
   * @param {string} rawGrade
   * @returns {{ points: number, weight: number }}
   */
  function parseGrade(rawGrade) {
    let grade = String(rawGrade).trim();
    let weight = 1;

    // Detect short-course (e.g. "4/SC" or "4-SC")
    if (/[-\/]SC$/i.test(grade)) {
      weight = 0.5;
      grade = grade.replace(/[-\/]SC$/i, '');
    }

    // Detect double-award hyphen grades (e.g. "8-7")
    if (/^\d-\d$/.test(grade)) {
      const [g1, g2] = grade.split('-').map(Number);
      return { points: g1 + g2, weight: 2 };
    }

    // Numeric 9–1
    const num = Number(grade);
    if (!isNaN(num) && num >= 1 && num <= 9) {
      return { points: num, weight };
    }

    // Unrecognized or U grade
    return { points: 0, weight };
  }

  /**
   * Calculate the prior attainment score for an array of numeric grade strings
   * @param {string[]} grades
   * @returns {number} Average score (0–9)
   */
  function calculatePriorAttainment(grades) {
    let totalPoints = 0;
    let totalWeight = 0;

    grades.forEach(raw => {
      const { points, weight } = parseGrade(raw);
      totalPoints += points * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? +(totalPoints / totalWeight).toFixed(2) : 0;
  }

  /**
   * Process GCSE CSV data and calculate prior attainment for each student
   * @param {Array<Object>} csvData - Parsed CSV data
   * @returns {Array<Object>} CSV data with prior attainment scores added
   */
  function processGCSEPriorAttainment(csvData) {
    return csvData.map(row => {
      // Extract student info fields
      const studentInfo = {};
      const grades = [];
      
      // Common student identifier fields to preserve
      const studentFields = ['Name', 'Firstname', 'Lastname', 'UPN', 'ULN', 'Email', 'Student Email', 'Student_Email'];
      
      // Separate student info from grades
      Object.keys(row).forEach(key => {
        const value = row[key];
        if (studentFields.some(field => key.toLowerCase() === field.toLowerCase())) {
          studentInfo[key] = value;
        } else if (value && String(value).trim()) {
          // This is likely a grade column
          grades.push(value);
        }
      });
      
      // Calculate prior attainment
      const priorAttainment = calculatePriorAttainment(grades);
      
      // Return combined data
      return {
        ...studentInfo,
        GCSE_Prior_Attainment: priorAttainment,
        Grade_Count: grades.length
      };
    });
  }

  /**
   * Show the GCSE Prior Attainment Calculator interface
   */
  function showGCSEPriorAttainmentCalculator() {
    const modalContent = `
      <div class="vespa-prior-attainment-calculator">
        <h3>GCSE Prior Attainment Calculator</h3>
        <p>Upload a CSV file containing student GCSE grades to calculate their prior attainment scores.</p>
        
        <div class="vespa-calculator-info">
          <h4>How it works:</h4>
          <ul>
            <li>Upload a CSV with student names/IDs and their GCSE grades (1-9)</li>
            <li>The calculator averages all numeric grades for each student</li>
            <li>Handles double awards (e.g., "8-7") and short courses (e.g., "5-SC")</li>
            <li>Download results with calculated prior attainment scores</li>
          </ul>
        </div>
        
        <div class="vespa-file-upload-section">
          <input type="file" id="gcse-calc-file" accept=".csv" style="display: none;">
          <button class="vespa-button primary" onclick="document.getElementById('gcse-calc-file').click()">
            📤 Select GCSE Results CSV
          </button>
          <div id="gcse-file-info" style="margin-top: 10px; display: none;">
            <strong>Selected:</strong> <span id="gcse-file-name"></span>
          </div>
        </div>
        
        <div id="gcse-preview-section" style="display: none; margin-top: 20px;">
          <h4>Preview Results:</h4>
          <div class="vespa-preview-table" style="max-height: 300px; overflow-y: auto;">
            <table id="gcse-preview-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Grades Count</th>
                  <th>Prior Attainment Score</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
        
        <div class="vespa-modal-actions" style="margin-top: 20px;">
          <button class="vespa-button secondary" onclick="closeModal()">Cancel</button>
          <button id="download-results-btn" class="vespa-button primary" style="display: none;" onclick="downloadPriorAttainmentResults()">
            📥 Download Results
          </button>
        </div>
      </div>
    `;
    
    showModal('GCSE Prior Attainment Calculator', modalContent);
    
    // Add file input handler
    document.getElementById('gcse-calc-file').addEventListener('change', handleGCSEFileUpload);
  }

  // Store calculated results globally for download
  let calculatedPriorAttainmentData = null;

  /**
   * Handle GCSE file upload for prior attainment calculation
   */
  async function handleGCSEFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Update UI
    document.getElementById('gcse-file-name').textContent = file.name;
    document.getElementById('gcse-file-info').style.display = 'block';
    
    try {
      // Parse CSV
      const csvData = await parseCSVFile(file);
      debugLog(`Parsed ${csvData.length} rows from GCSE file`, null, 'info');
      
      // Calculate prior attainment
      calculatedPriorAttainmentData = processGCSEPriorAttainment(csvData);
      
      // Show preview
      displayGCSEPreview(calculatedPriorAttainmentData);
      
      // Show download button
      document.getElementById('download-results-btn').style.display = 'inline-block';
      
    } catch (error) {
      debugLog('Error processing GCSE file:', error, 'error');
      showError('Failed to process GCSE file: ' + error.message);
    }
  }

  /**
   * Display preview of calculated prior attainment scores
   */
  function displayGCSEPreview(data) {
    const tbody = document.querySelector('#gcse-preview-table tbody');
    tbody.innerHTML = '';
    
    // Show first 10 results
    data.slice(0, 10).forEach(student => {
      const row = document.createElement('tr');
      
      // Get student identifier (try various field names)
      const studentName = student.Name || student.Firstname || student.UPN || student.Email || 'Unknown';
      
      row.innerHTML = `
        <td>${studentName}</td>
        <td>${student.Grade_Count}</td>
        <td><strong>${student.GCSE_Prior_Attainment}</strong></td>
      `;
      
      tbody.appendChild(row);
    });
    
    // Add summary row if more than 10
    if (data.length > 10) {
      const summaryRow = document.createElement('tr');
      summaryRow.innerHTML = `
        <td colspan="3" style="text-align: center; font-style: italic;">
          ... and ${data.length - 10} more students
        </td>
      `;
      tbody.appendChild(summaryRow);
    }
    
    document.getElementById('gcse-preview-section').style.display = 'block';
  }

  /**
   * Download the calculated prior attainment results as CSV
   */
  function downloadPriorAttainmentResults() {
    if (!calculatedPriorAttainmentData || calculatedPriorAttainmentData.length === 0) {
      showError('No data to download');
      return;
    }
    
    // Convert to CSV format
    const headers = Object.keys(calculatedPriorAttainmentData[0]);
    const csvContent = [
      headers.join(','),
      ...calculatedPriorAttainmentData.map(row => 
        headers.map(header => {
          const value = row[header] || '';
          // Escape values containing commas
          return String(value).includes(',') ? `"${value}"` : value;
        }).join(',')
      )
    ].join('\n');
    
    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gcse_prior_attainment_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    
    showSuccess('Prior attainment results downloaded successfully!');
    
    // Close modal after short delay
    setTimeout(() => {
      closeModal();
      // Reset data
      calculatedPriorAttainmentData = null;
    }, 1500);
  }

  /**
   * Load the renewal management module
   */
  async function loadRenewalModule() {
    try {
      debugLog("Loading renewal management module", null, 'info');
      
      // Check if already loaded
      if (window.VESPARenewals && window.VESPARenewals.show) {
        debugLog("Renewal module already loaded, showing interface", null, 'info');
        window.VESPARenewals.show();
        return;
      }
      
      // Show loading indicator
      showModal('Loading Renewal System', '<div style="text-align: center; padding: 20px;">Loading renewal management system...</div>');
      
      // Load the renewal module from your CDN
      // You'll need to update this URL to match where you host your renewals.js file
      const scriptUrl = 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-upload-bridge@main/src/renewals1p.js';
      
      try {
        await loadScript(scriptUrl);
        debugLog("Renewal script loaded from CDN", null, 'success');
      } catch (error) {
        debugLog("Failed to load from CDN, trying local file", error, 'warn');
        // Fallback to local file if CDN fails
        await loadScript('/renewals.js');
      }
      
      // Wait a bit for initialization
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Close loading modal
      closeModal();
      
      // Check if module loaded successfully
      if (window.VESPARenewals && window.VESPARenewals.show) {
        debugLog("Renewal module loaded successfully", null, 'success');
        window.VESPARenewals.show();
      } else {
        throw new Error('Renewal module failed to initialize');
      }
      
    } catch (error) {
      debugLog('Error loading renewal module:', error, 'error');
      closeModal();
      showError('Failed to load renewal management system. Please refresh and try again.');
      
      // Reset to step 1
      currentStep = 1;
      uploadType = null;
      renderStep(1);
    }
  }

  /**
   * Load the account management module
   */
  async function loadAccountManagementModule() {
    try {
      debugLog("Loading account management module", null, 'info');
      
      // Ensure userContext is available for regular users
      if (!userContext || !userContext.userId) {
        debugLog("User context not ready, fetching...", null, 'info');
        userContext = await fetchUserContext();
        
        if (!userContext || !userContext.userId) {
          showError('Unable to load user information. Please refresh the page and try again.');
          return;
        }
      }
      
      // Set the API URL for the module to use
      window.API_BASE_URL = API_BASE_URL;
      window.DEBUG_MODE = DEBUG_MODE;
      
      // Pass the school context to the module
      window.selectedSchool = selectedSchool;
      window.userContext = userContext;
      
      // Also check for emulation state
      const emulationState = getEmulationState();
      if (emulationState && emulationState.school && !selectedSchool) {
        window.selectedSchool = {
          ...emulationState.school,
          emulatedAdmins: emulationState.admins
        };
      }
      
      // For regular users, customerId might not be available from Knack attributes
      // But the backend can determine it from the session, so we'll proceed anyway
      if (!window.selectedSchool && (!userContext || !userContext.customerId)) {
        debugLog("CustomerId not found in user context for regular user, proceeding anyway as backend can use session", null, 'warn');
        // Don't block regular staff admins - the backend knows their customer from session
      }
      
      debugLog("Context passed to Account Management module", {
        selectedSchool: window.selectedSchool,
        userContext: window.userContext,
        hasCustomerId: !!(userContext && userContext.customerId),
        note: !userContext?.customerId ? 'CustomerId will be determined by backend session' : 'CustomerId available'
      });
      
      // Check if already loaded
      if (window.VESPAAccountManagement && window.VESPAAccountManagement.show) {
        debugLog("Account Management module already loaded, showing interface", null, 'info');
        window.VESPAAccountManagement.show();
        return;
      }
      
      // Show loading indicator
      showModal('Loading Account Management', '<div style="text-align: center; padding: 20px;"><div class="vespa-spinner"></div><p>Loading account management system...</p></div>');
      
      // Load the account management module from CDN
      // Update this to match your actual file version
      const scriptUrl = 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-upload-bridge@main/src/accountManagement2x.js';
      
      try {
        await loadScript(scriptUrl);
        debugLog("Account Management script loaded from CDN", null, 'success');
      } catch (error) {
        debugLog("Failed to load from CDN, trying local file", error, 'warn');
        // Fallback to local file if CDN fails
        await loadScript('/accountManagement.js');
      }
      
      // Wait for module to initialize - check periodically
      let initCheckCount = 0;
      const maxInitChecks = 30; // 30 * 200ms = 6 seconds max wait
      
      const checkInit = async () => {
        while (initCheckCount < maxInitChecks) {
          initCheckCount++;
          
          // Check if basic structure exists (module sets this immediately)
          if (window.VESPAAccountManagement && window.VESPAAccountManagement.show) {
            debugLog(`Account Management module structure detected after ${initCheckCount} checks`, null, 'info');
            
            // The module is at least partially loaded, we can proceed
            // The module's show() method will handle waiting for full initialization
            closeModal();
            
            debugLog("Account Management module loaded successfully", null, 'success');
            
            // Hide the wizard
            const wizard = document.getElementById('vespa-upload-wizard');
            if (wizard) wizard.style.display = 'none';
            
            // Show the account management interface
            // The module's show() method handles initialization state internally
            setTimeout(() => {
              debugLog("Calling VESPAAccountManagement.show()", null, 'info');
              window.VESPAAccountManagement.show();
              
              // Debug the state
              if (window.VESPAAccountManagement.debug) {
                window.VESPAAccountManagement.debug();
              }
            }, 100);
            
            return; // Success - exit the function
          }
          
          // Wait before next check
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        // If we get here, initialization timed out
        throw new Error('Account Management module failed to initialize after 6 seconds');
      };
      
      await checkInit();
      
    } catch (error) {
      debugLog('Error loading account management module:', error, 'error');
      closeModal();
      showError('Failed to load account management system. Please refresh and try again.');
      
      // Reset to step 1
      currentStep = 1;
      uploadType = null;
      renderStep(1);
    }
  }



    
    

