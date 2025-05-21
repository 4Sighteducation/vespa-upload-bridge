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

// State management
let currentStep = 1;
let uploadType = null; // 'staff' or 'student'
let validationResults = null;
let processingResults = null;
let selectedSchool = null; // For super user mode
let isProcessing = false;
let activeModal = null; // Track the active modal
let selectedFile = null; // Store the selected file between steps
let userContext = null;  // NEW: Store user context data

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
  linkElement.href = 'https://cdn.jsdelivr.net/gh/4Sighteducation/vespa-upload-bridge@main/src/index2b.css';
  
  document.head.appendChild(linkElement);
  debugLog("Dynamically linked external CSS: " + linkElement.href, null, 'info');
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
  
  const isSuperUser = VESPA_UPLOAD_CONFIG.userRole === 'Super User';
  
  switch (currentStep) {
    case 1: // Select upload type
      uploadType = document.querySelector('input[name="upload-type"]:checked')?.value;
      if (!uploadType) {
        showError('Please select an upload type.');
        return false;
      }
      return true;
      
    case 2: // Select school (super user only) or Upload CSV
      if (isSuperUser) {
        selectedSchool = document.getElementById('school-select')?.value;
        if (!selectedSchool) {
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
  if (!VESPA_UPLOAD_CONFIG || !Knack) {
    return null;
  }

  try {
    // Extract user information from Knack global object
    let context = {
      userId: null,
      userName: null,
      userEmail: null,
      userRole: VESPA_UPLOAD_CONFIG.userRole || null,
      schoolId: null,
      customerId: null
    };

    // Get current user ID from Knack if available
    if (Knack && Knack.getUserAttributes) {
      const userAttrs = Knack.getUserAttributes();
      if (userAttrs) {
        context.userId = userAttrs.id;
        context.userName = userAttrs.name;
        context.userEmail = userAttrs.email;
        
        // Try to get the customer and school ID from custom fields if available
        context.schoolId = userAttrs.values?.field_126 || null;
        context.customerId = userAttrs.values?.field_122 || null;
      }
    }

    debugLog("User context fetched", context);
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
    debugLog(`Is Super User: ${VESPA_UPLOAD_CONFIG.userRole === 'Super User'}`, null, 'info');
  } else {
    debugLog("No configuration available yet!", null, 'warn');
  }
  
  // Set the API URL based on config or fallback
  API_BASE_URL = determineApiUrl();
  // Fetch user context information
fetchUserContext().then(context => {
  userContext = context;
  debugLog("User context set:", userContext);
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
  const isSuperUser = VESPA_UPLOAD_CONFIG.userRole === 'Super User';
  
  // Create the wizard container
  const wizardHTML = `
    <div id="vespa-upload-wizard" class="vespa-upload-wizard">
      <div class="vespa-upload-header">
        <h1>VESPA Data Upload</h1>
        <p>Upload staff and student data to your VESPA account</p>
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
  
  // Render the first step
  renderStep(currentStep);
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
const isSuperUser = VESPA_UPLOAD_CONFIG.userRole === 'Super User';
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
    if (step === maxSteps) {
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
    return `
      <h2>Select Upload Type</h2>
      <p>Choose the type of data you want to upload.</p>
      
      <div class="vespa-upload-options">
        <div class="vespa-upload-option">
          <input type="radio" id="upload-staff" name="upload-type" value="staff">
          <label for="upload-staff">
            <div class="vespa-option-icon">👥</div>
            <div class="vespa-option-title">Staff Upload</div>
            <div class="vespa-option-description">Upload staff data to create or update staff accounts.</div>
          </label>
        </div>
        
        <div class="vespa-upload-option">
          <input type="radio" id="upload-student" name="upload-type" value="student">
          <label for="upload-student">
            <div class="vespa-option-icon">🎓</div>
            <div class="vespa-option-title">Student Upload</div>
            <div class="vespa-option-description">Upload student data to create or update student accounts.</div>
          </label>
        </div>
      </div>
      
      <div class="vespa-info-box">
        <div class="vespa-info-icon">ℹ️</div>
        <div class="vespa-info-content">
          <strong>Important:</strong> Staff accounts must be created before student accounts.
          Make sure to upload your staff data first if you haven't already.
        </div>
      </div>
    `;
  }
  
  /**
   * Render the select school step (super user only)
   * @returns {string} HTML for the step
   */
  function renderSelectSchoolStep() {
    return `
      <h2>Select School</h2>
      <p>Choose the school you want to upload data for.</p>
      
      <div class="vespa-school-search">
        <input type="text" id="school-search" placeholder="Search for a school...">
        <select id="school-select">
          <option value="">-- Select a school --</option>
          <!-- Schools will be dynamically populated -->
        </select>
        <button id="search-button" class="vespa-button secondary">Search</button>
      </div>
      
      <div id="school-details" class="vespa-school-details" style="display: none;">
        <h3>Selected School</h3>
        <div class="vespa-school-info">
          <div class="vespa-info-row">
            <div class="vespa-info-label">School Name:</div>
            <div class="vespa-info-value" id="school-name"></div>
          </div>
          <div class="vespa-info-row">
            <div class="vespa-info-label">Admin Email:</div>
            <div class="vespa-info-value" id="admin-email"></div>
          </div>
          <div class="vespa-info-row">
            <div class="vespa-info-label">Account Type:</div>
            <div class="vespa-info-value" id="account-type"></div>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Render the upload CSV step
   * @returns {string} HTML for the step
   */
  function renderUploadCsvStep() {
    // Create the button text and requirements outside the template string
    const buttonText = (uploadType === 'staff') ? 'Staff' : 'Student';
    
    let requirementsHtml = '';
    if (uploadType === 'staff') {
      requirementsHtml = `
        <ul>
          <li><strong>Required fields:</strong> Title, First Name, Last Name, Email Address, Staff Type</li>
          <li><strong>Staff Type codes:</strong> admin (Staff Admin), tut (Tutor), sub (Subject Teacher), hoy (Head of Year), hod (Head of Dept), gen (General Staff)</li>
          <li>Multiple staff types can be assigned using comma-separated values (e.g., "admin,tut")</li>
        </ul>
      `;
    } else {
      requirementsHtml = `
        <ul>
          <li><strong>Required fields:</strong> Lastname, Student Email, Group, Year Gp, Level, Tutor</li>
          <li><strong>Level values:</strong> Must be either "Level 2" or "Level 3"</li>
          <li><strong>Tutor field:</strong> Must contain valid email address(es) of existing tutors</li>
          <li>Optional GCSE data can be included to calculate prior attainment and expected grades</li>
        </ul>
      `;
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
    let colSpan = 6;
    
    if (uploadType === 'staff') {
      tableHeaders = `
        <th>Title</th>
        <th>First Name</th>
        <th>Last Name</th>
        <th>Email Address</th>
        <th>Staff Type</th>
      `;
      colSpan = 6;
    } else {
      tableHeaders = `
        <th>Lastname</th>
        <th>Firstname</th>
        <th>Student Email</th>
        <th>Group</th>
        <th>Year Gp</th>
        <th>Level</th>
        <th>Tutor</th>
      `;
      colSpan = 8;
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
    
    // Create the calculator options HTML outside the template literal
    let calculatorOptionsHtml = '';
    if (uploadType === 'student') {
      calculatorOptionsHtml = `
        <div class="vespa-checkbox-group">
          <input type="checkbox" id="run-calculators" checked>
          <label for="run-calculators">Run ALPS calculators for GCSE data (if present)</label>
        </div>
      `;
    }
    
    return `
      <h2>Process Upload</h2>
      <p>Your data is ready to be processed. Click "Process" to continue.</p>
      
      <div class="vespa-processing-container">
        <div class="vespa-processing-status">
          <div class="vespa-status-icon">⏳</div>
          <div class="vespa-status-text">Ready to process</div>
        </div>
        
        <div class="vespa-processing-summary">
          <h3>Summary</h3>
          <div class="vespa-summary-details">
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Upload Type:</div>
              <div class="vespa-summary-value">${uploadType === 'staff' ? 'Staff' : 'Student'} Upload</div>
            </div>
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Total Records:</div>
              <div class="vespa-summary-value" id="total-records-summary">0</div>
            </div>
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Valid Records:</div>
              <div class="vespa-summary-value" id="valid-records-summary">0</div>
            </div>
            ${validationStatusHtml}
          </div>
        </div>
        
        <div class="vespa-processing-options">
          <h3>Processing Options</h3>
          <div class="vespa-options-form">
            <div class="vespa-checkbox-group">
              <input type="checkbox" id="send-notifications" checked>
              <label for="send-notifications">Send welcome emails to new users</label>
            </div>
            
            ${calculatorOptionsHtml}
            
            <div class="vespa-input-group">
              <label for="notification-email">Send results to email:</label>
              <input type="email" id="notification-email" value="${userEmail}">
            </div>
          </div>
        </div>
      </div>
      
      <div class="vespa-info-box warning">
        <div class="vespa-info-icon">⚠️</div>
        <div class="vespa-info-content">
          <strong>Warning:</strong> This process may take several minutes depending on the number of records.
          Do not close this page until the process is complete.
        </div>
      </div>
      
      <div class="vespa-button-container">
        <button id="process-button" class="vespa-button primary">Process Data</button>
      </div>
    `;
  }
  
  /**
   * Render the results step
   * @returns {string} HTML for the step
   */
  function renderResultsStep() {
    let statusText = 'Processing Complete';
    let statusClass = 'info'; // Default to info
    let statusIcon = 'ℹ️';
    let summaryHtml = '<p>Your upload is being processed in the background. You will receive an email with the detailed results shortly.</p>';

    if (processingResults) {
        if (processingResults.status === 'queued') {
            statusText = 'Upload Queued for Background Processing';
            statusClass = 'success';
            statusIcon = '✅';
            summaryHtml = `
                <p>Your data upload (Job ID: <strong>${processingResults.jobId || 'N/A'}</strong>) has been successfully queued.</p>
                <p>It will be processed in the background. You will receive a confirmation email with the detailed results once it's complete.</p>
                <p>You can safely close this window.</p>
            `;
        } else if (processingResults.status === 'submission_failed') {
            statusText = 'Upload Submission Failed';
            statusClass = 'error';
            statusIcon = '❌';
            summaryHtml = `
                <p>There was an error submitting your upload for processing.</p>
                <p><strong>Error:</strong> ${processingResults.message || 'Unknown submission error.'}</p>
                <p>Please try submitting the upload again. If the problem persists, contact support.</p>
            `;
        } else {
            // This case would be if we somehow got here with old, non-queued results structure
            // For now, keep a simplified message for unexpected states.
            statusText = processingResults.overallSuccess ? 'Upload Processed (Details in Email)' : 'Upload Processed with Issues (Details in Email)';
            statusClass = processingResults.overallSuccess ? 'success' : 'warning';
            statusIcon = processingResults.overallSuccess ? '✅' : '⚠️';
            summaryHtml = `<p>The upload process has finished. Please check your email for a detailed summary of the results.</p>`;
        }
    }
    
    return `
      <h2>Upload Status</h2>
      
      <div class="vespa-results-container">
        <div class="vespa-results-status ${statusClass}">
          <div class="vespa-status-icon">${statusIcon}</div>
          <div class="vespa-status-text">${statusText}</div>
        </div>
        
        <div class="vespa-results-summary centered-summary">
          ${summaryHtml}
        </div>
        
        <div class="vespa-results-actions">
          <!-- Download results button might be removed or disabled as results are emailed -->
          <!-- <button class="vespa-button secondary" id="download-results" style="display: none;">Download Results CSV</button> -->
          <button class="vespa-button primary" id="start-new-upload">Start New Upload</button>
        </div>
        
      </div>
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
 * This function has been fixed to use the correct endpoint
 */
/**
 * Download a template file
 * This function has been fixed to use the correct endpoint
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
    
    // Get the current upload type with fallback
    const type = uploadType || 'staff';
    
    // Use the correct template type
    const templateType = type === 'staff' ? 'staff' : 'student';
    debugLog(`Using template type: ${templateType}`);
    
    // Update UI during download
    const downloadButton = document.getElementById('download-template');
    let originalText = '';
    if (downloadButton) {
      originalText = downloadButton.textContent;
      downloadButton.textContent = 'Opening Template...';
      downloadButton.disabled = true;
    }
    
    // EXPLICIT URL CONSTRUCTION - avoid string concatenation issues
    // Make sure we have /api/ in the path
    let baseUrl = API_BASE_URL;
    debugLog(`Starting with base URL: ${baseUrl}`);
    
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    if (!baseUrl.includes('/api/')) {
      // If it doesn't have /api/ but has /api at the end, add the trailing slash
      if (baseUrl.endsWith('/api')) {
        baseUrl += '/';
      } 
      // If it doesn't have /api at all, add it
      else if (!baseUrl.endsWith('/api/')) {
        baseUrl = baseUrl.replace(/\/+$/, '') + '/api/';
      }
    }
    
    const templateUrl = `${baseUrl}templates/${templateType}`;
    debugLog(`Template URL constructed: ${templateUrl}`, null, 'info');
    
    statusMessage.textContent = 'Opening download...';
    
    // Direct approach: Open in new tab (most reliable cross-browser)
    window.open(templateUrl, '_blank');
    
    // Show success message
    setTimeout(() => {
      statusMessage.innerHTML = `
        <span style="color:#2e7d32">✓ Template ready!</span> 
        If download doesn't start automatically, 
        <a href="${templateUrl}" target="_blank" style="font-weight:bold">click here</a>
      `;
      statusMessage.style.backgroundColor = '#e8f5e9';
      
      // Reset button
      if (downloadButton) {
        downloadButton.textContent = originalText;
        downloadButton.disabled = false;
      }
    }, 1000);
    
  } catch (error) {
    debugLog("Error in template download", error, 'error');
    showError(`Template download failed: ${error.message}`);
    
    // Reset button if error
    const downloadButton = document.getElementById('download-template');
    if (downloadButton) {
      downloadButton.textContent = `Download ${uploadType === 'staff' ? 'Staff' : 'Student'} Template`;
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
  function parseCSVFile(file) {
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
   * @returns {Object} Validation results object
   */
  function validateLocally(csvData) {
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
    
    debugLog(`Validating ${csvData.length} rows locally`, null, 'info');
    
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
      } else if (uploadType === 'student') {
        // Required fields for students
        const requiredFields = ['Lastname', 'Student Email', 'Group', 'Year Gp', 'Level', 'Tutor'];
        
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
      }
    });
    
    // Return the validation results
    return results;
  }

  /**
   * Validate the CSV data
   * This function replaces the previous validation approach that had issues
   */
  function validateCsvData() {
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
    
    // Parse the CSV file
    parseCSVFile(file)
      .then(csvData => {
        // First validate locally to catch common errors
        const localValidation = validateLocally(csvData);
        
        // If we have local validation errors, show those without making API call
        if (!localValidation.isValid) {
          debugLog(`Local validation found ${localValidation.errors.length} errors`, localValidation.errors, 'warn');
          
          // Store the validation results
          validationResults = {
            ...localValidation,
            csvData: csvData,
            source: 'local'
          };
          
          // Display results in UI
          displayValidationResults(validationResults);
          
          // Update status
          updateValidationStatus(`Validation completed with ${localValidation.errors.length} errors`, 'error');
          
          // Show a message that we're using local validation
          showError(`Found ${localValidation.errors.length} validation issues. Fix these before sending to API.`);
          
          return Promise.reject(new Error('Local validation failed'));
        }
        
        // No local errors - proceed with API validation
        debugLog("Local validation passed, proceeding with API validation");
        
        // Determine the correct endpoint based on upload type
        const endpoint = uploadType === 'staff' ? 'staff' : 'students';
        
        // EXPLICIT URL CONSTRUCTION - now with more logging and safety
        let baseUrl = API_BASE_URL;
        debugLog(`API Base URL (original): "${baseUrl}"`, null, 'info');
        
        if (!baseUrl.endsWith('/')) {
          baseUrl += '/';
          debugLog(`Added trailing slash: "${baseUrl}"`, null, 'info');
        }
        
        if (!baseUrl.includes('/api/')) {
          // If it doesn't have /api/ but has /api at the end, add the trailing slash
          if (baseUrl.endsWith('/api')) {
            baseUrl += '/';
            debugLog(`Added trailing slash after /api: "${baseUrl}"`, null, 'info');
          } 
          // If it doesn't have /api at all, add it
          else if (!baseUrl.endsWith('/api/')) {
            const originalUrl = baseUrl;
            baseUrl = baseUrl.replace(/\/+$/, '') + '/api/';
            debugLog(`Added /api/ path: "${originalUrl}" -> "${baseUrl}"`, null, 'info');
          }
        }
        
        const validationUrl = `${baseUrl}${endpoint}/validate`;
        debugLog(`Final validation URL: "${validationUrl}"`, null, 'info');
        
        // Create a formatted log of all CSV data being sent
        let logOutput = '=== CSV DATA BEING SENT TO API ===\n';
        csvData.forEach((row, idx) => {
          logOutput += `Row ${idx+1}: ${JSON.stringify(row)}\n`;
        });
        logOutput += '==============================';
        console.log(logOutput);
        
        // Send the parsed CSV data as JSON with detailed request logging
        debugLog(`Sending API validation request to ${validationUrl}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          bodyLength: JSON.stringify({ csvData }).length,
          rowCount: csvData.length
        }, 'info');
        
        return fetch(validationUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({ csvData })
        });
      })
  .then(response => {
    debugLog(`Validation response status: ${response.status} ${response.statusText}`);
    // Always try to get response body for better error details
    return response.json().then(data => {
      if (!response.ok) {
        // If we have error details in the response, use them
        const errorMessage = data?.message || data?.error || `API error: ${response.status}`;
        throw new Error(errorMessage);
      }
      return data;
    }).catch(err => {
      if (!response.ok) {
        // If we couldn't parse JSON but response is not OK
        throw new Error(`API responded with status: ${response.status}`);
      }
      // If we couldn't parse JSON but response is OK (should not happen)
      throw new Error(`Could not parse response: ${err.message}`);
    });
  })
  .then(result => {
    debugLog("Validation result received:", result, 'success');
    
    // Store the validation results in the global variable
    validationResults = result;
    
    // Display the results in the UI
    displayValidationResults(result);
    
    // Update the validation status
    const statusType = result.isValid ? 'success' : 'error';
    const statusMessage = result.isValid ? 
      'Validation successful' : 
      `Validation completed with ${result.errors?.length || 0} errors`;
    updateValidationStatus(statusMessage, statusType);
  })
  .catch(error => {
    debugLog("Validation error:", error, 'error');
    
    // Show error message
    updateValidationStatus(`Validation failed: ${error.message}`, 'error');
    showError(`CSV validation failed: ${error.message}`);
    
    // Reset validation results
    validationResults = null;
  });
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
        validRecordsEl.textContent = results.isValid ? 
          (results.total || results.csvData?.length || 0) : 
          ((results.total || results.csvData?.length || 0) - (results.errors?.length || 0));
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
        validRecordsSummary.textContent = results.isValid ? 
          (results.total || results.csvData?.length || 0) : 
          ((results.total || results.csvData?.length || 0) - (results.errors?.length || 0));
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
      const fields = uploadType === 'staff' ? 
        ['Title', 'First Name', 'Last Name', 'Email Address', 'Staff Type'] : 
        ['Lastname', 'Firstname', 'Student Email', 'Group', 'Year Gp', 'Level', 'Tutor'];
      
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
            </ul>
            Row ${index + 1} in the preview table may contain the issue.`;
        }
        
        let errorContent = `
          <div class="vespa-error-title">Row ${errorRow || index + 1}: ${errorType}</div>
          <div class="vespa-error-details">
        `;
        
        if (errorField) {
          errorContent += `<div class="vespa-error-field">Field: ${errorField}</div>`;
        }
        
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
    
    // Filter data to ensure only rows with essential information are sent for processing
    // This mirrors the initial filtering that was in the backend's Phase 1
    const filteredData = validationResults.csvData.filter(row => {
        const email = row && row['Email Address'] ? row['Email Address'].trim() : '';
        const firstName = row && row['First Name'] ? row['First Name'].trim() : '';
        const lastName = row && row['Last Name'] ? row['Last Name'].trim() : '';
        const staffType = row && row['Staff Type'] ? row['Staff Type'].trim() : '';
        // Ensure core fields for creating/identifying a user are present
        return email && (firstName || lastName) && staffType;
    });

    if (filteredData.length === 0) {
      showError('No valid data rows to process after filtering. Please check your CSV content for Email, Name, and Staff Type.');
      debugLog("ProcessUploadData: No valid data after initial client-side filtering.", validationResults.csvData, 'warn');
      return;
    }
    
    // Get processing options
    const sendNotifications = document.getElementById('send-notifications')?.checked ?? true;
    const notificationEmail = document.getElementById('notification-email')?.value || userContext?.userEmail || '';
    
    const currentProcessingOptions = {
      sendNotifications: sendNotifications,
      notificationEmail: notificationEmail
      // runCalculators is not relevant for staff, will be handled for students
    };

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
    
    const uploaderContextForAPI = {
        userId: userContext?.userId || null,
        userEmail: userContext?.userEmail || null, // Added uploader email for notifications from worker
        schoolId: selectedSchool?.schoolId || userContext?.schoolId || null, 
        customerId: selectedSchool?.customerId || userContext?.customerId || null,
        userRole: userContext?.userRole || null 
    };

    debugLog("Data to be sent to /api/staff/process (enqueue):", {
      csvData: filteredData,
      options: currentProcessingOptions,
      context: uploaderContextForAPI
    });
    
    try {
      const constructedUrl = `${API_BASE_URL}staff/process`;
      debugLog("API call to enqueue job: POST " + constructedUrl);

      const response = await $.ajax({
          url: constructedUrl, 
          type: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({
              csvData: filteredData, 
              options: currentProcessingOptions,
              context: uploaderContextForAPI
          }),
          xhrFields: { withCredentials: true }
      });

      debugLog("Job Enqueue Response:", response, 'success');

      if (response.success && response.jobId) {
        // Job successfully queued
        updateStatusDisplay(`Upload accepted (Job ID: ${response.jobId}). It is now processing in the background. You will receive an email summary. This window can be closed.`, 'success', false);
        showSuccess("Your upload has been queued successfully! You'll receive an email with the results.");
        
        // Update the global processingResults to reflect queuing, not final results
        processingResults = {
            jobId: response.jobId,
            status: 'queued',
            message: response.message,
            total: filteredData.length // Reflect the number of rows submitted
        };
        
        // Disable further actions on this step, maybe show a button to start a new upload on results page
        if (processButton) {
            processButton.textContent = 'Processing in Background';
            processButton.disabled = true; 
        }
        // Go to results page, which will now show a simplified message
        setTimeout(() => {
            currentStep++; 
            renderStep(currentStep);
        }, 2500); // Give user time to read message

      } else {
        // Job enqueueing failed
        throw new Error(response.message || 'Failed to queue the upload job. Please try again.');
      }

    } catch (error) {
      const errorMessage = error.responseJSON?.message || error.responseText || error.message || "An unknown error occurred while submitting your upload.";
      debugLog("Error Enqueuing Job:", { error, errorMessage }, 'error');
      updateStatusDisplay(`Submission failed: ${errorMessage}`, 'error', false);
      showError(`Failed to submit your upload: ${errorMessage}`);
      
      processingResults = { // Store error state
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
      // Optionally, still go to results step to show this submission failure
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
    
    const isSuperUser = VESPA_UPLOAD_CONFIG.userRole === 'Super User';
    const maxSteps = isSuperUser ? 6 : 5;
    
    // Validate current step
    if (!validateCurrentStep()) {
      return;
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
  const isSuperUser = VESPA_UPLOAD_CONFIG?.userRole === 'Super User';
  const contentStep = !isSuperUser && currentStep > 1 ? currentStep + 1 : currentStep;
  
  debugLog(`Binding events for content step ${contentStep}, isSuperUser: ${isSuperUser}`);
  
  switch (contentStep) {
    case 1: // Select upload type
      // No special event binding needed
      debugLog("Step 1: No special bindings required");
      break;
      
    case 2: // Select school
      const searchButton = document.getElementById('search-button');
      const schoolSelect = document.getElementById('school-select');
      
      if (searchButton) {
        debugLog("Found search button, attaching event");
        searchButton.addEventListener('click', () => {
          const searchTerm = document.getElementById('school-search')?.value || '';
          debugLog(`Search button clicked with term: ${searchTerm}`);
          searchSchools(searchTerm);
        });
      }
      
      if (schoolSelect) {
        debugLog("Found school select, attaching event");
        schoolSelect.addEventListener('change', () => {
          const selected = schoolSelect.options[schoolSelect.selectedIndex];
          debugLog(`School selected: ${selected.text}`);
          if (selected.value) {
            document.getElementById('school-details').style.display = 'block';
            document.getElementById('school-name').textContent = selected.text;
            document.getElementById('admin-email').textContent = selected.dataset.email || 'N/A';
            document.getElementById('account-type').textContent = selected.dataset.type || 'N/A';
          } else {
            document.getElementById('school-details').style.display = 'none';
          }
        });
      }
      break;
      
    case 3: // Upload CSV
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
          if (validationResults && validationResults.isValid) {
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
  
  // === IMPORTANT: Expose functions to global scope ===
  // This is critical for the system to be able to call our functions
  window.initializeUploadBridge = initializeUploadBridge;
  window.showTemplateModal = showTemplateModal;
  window.downloadTemplate = downloadTemplateFile;
  window.showModal = showModal;
  window.closeModal = closeModal;
  
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
    if (currentStep === 4 && !VESPA_UPLOAD_CONFIG.userRole === 'Super User') { // Processing step for regular user
      statusDiv = document.querySelector('.vespa-processing-status');
    } else if (currentStep === 5 && VESPA_UPLOAD_CONFIG.userRole === 'Super User') { // Processing step for super user
      statusDiv = document.querySelector('.vespa-processing-status');
    } else {
       // Fallback or if we need a more generic status update location later
      statusDiv = document.getElementById('general-status-display'); 
      if (!statusDiv) {
          // Create one if it doesn't exist, perhaps at the top of .vespa-upload-content
          const contentArea = document.querySelector('.vespa-upload-content');
          if (contentArea) {
              statusDiv = document.createElement('div');
              statusDiv.id = 'general-status-display';
              statusDiv.className = 'vespa-status-display-generic'; // Add a class for styling
              contentArea.prepend(statusDiv);
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
    statusDiv.classList.add('vespa-processing-status'); // Keep base class
    if(document.getElementById('general-status-display') === statusDiv) statusDiv.classList.add('vespa-status-display-generic');


    if (className) {
      statusDiv.classList.add(className);
    }
    debugLog(`Status display updated: ${message}`, {type, showSpinner}, 'info');
  }
