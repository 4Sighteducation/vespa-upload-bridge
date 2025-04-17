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

/**
 * Debug logging helper
 * @param {string} title - Log title
 * @param {any} data - Optional data to log
 */
function debugLog(title, data) {
  if (!DEBUG_MODE) return;
  
  console.log(`%c[VESPA Upload] ${title}`, 'color: #007bff; font-weight: bold;');
  if (data !== undefined) {
    console.log(data);
  }
}

/**
 * Function to get the API URL - tries multiple sources
 * @returns {string} The determined API URL
 */
function determineApiUrl() {
  // First priority: Use the URL from VESPA_UPLOAD_CONFIG if available
  if (VESPA_UPLOAD_CONFIG && VESPA_UPLOAD_CONFIG.apiUrl) {
    debugLog("Using API URL from config", VESPA_UPLOAD_CONFIG.apiUrl);
    return VESPA_UPLOAD_CONFIG.apiUrl;
  }
  
  // Second priority: Use the window object if available
  if (window.VESPA_UPLOAD_CONFIG && window.VESPA_UPLOAD_CONFIG.apiUrl) {
    debugLog("Using API URL from window config", window.VESPA_UPLOAD_CONFIG.apiUrl);
    return window.VESPA_UPLOAD_CONFIG.apiUrl;
  }
  
  // Last resort: Use the hardcoded URL
  debugLog("Using default API URL", API_BASE_URL);
  return API_BASE_URL;
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
  // Function implementation is in the styles file
  // This is just a placeholder to maintain proper function ordering
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
 * VESPA Upload Bridge - UI Core
 * 
 * This file contains core UI functions and initialization code
 * for the VESPA Upload System.
 */

/**
 * Main initialization function that will be called by the loader
 */
function initializeUploadBridge() {
  debugLog("VESPA Upload Bridge initializing...");
  
  // IMPORTANT: Directly get the config from window object at the start
  // and log it to see what's available
  VESPA_UPLOAD_CONFIG = window.VESPA_UPLOAD_CONFIG;
  debugLog("Configuration received:", VESPA_UPLOAD_CONFIG);
  
  // Set the API URL based on config or fallback
  API_BASE_URL = determineApiUrl();
  debugLog("Using API URL:", API_BASE_URL);
  
  // Test API connectivity immediately to help debug
  fetch(API_BASE_URL)
    .then(response => {
      if (response.ok) {
        return response.json();
      }
      throw new Error(`API responded with status: ${response.status}`);
    })
    .then(data => {
      debugLog("API connection successful:", data);
    })
    .catch(error => {
      console.error("[VESPA Upload] API connection failed:", error);
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
    return;
  }
  
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
  
  // Update buttons
  const prevButton = document.getElementById('vespa-prev-button');
  const nextButton = document.getElementById('vespa-next-button');
  
  if (prevButton) prevButton.style.display = step > 1 ? 'block' : 'none';
  
  const isSuperUser = VESPA_UPLOAD_CONFIG.userRole === 'Super User';
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
    // Create the ALPS calculations HTML outside the template literal
    let alpsCalculationsHtml = '';
    if (uploadType === 'student' && processingResults && processingResults.alpsCalculationsPerformed) {
      alpsCalculationsHtml = `
        <div class="vespa-summary-item">
          <div class="vespa-summary-label">ALPS Calculations:</div>
          <div class="vespa-summary-value">${processingResults.alpsCalculationsPerformed} completed</div>
        </div>
      `;
    }
    
    // Determine status class based on processing results
    const statusClass = processingResults && processingResults.errors && processingResults.errors.length > 0 ? 'warning' : 'success';
    const statusIcon = statusClass === 'success' ? '✅' : '⚠️';
    const statusText = statusClass === 'success' ? 'Upload Completed Successfully' : 'Upload Completed with Warnings';
    
    // Only show these fields if we have actual results
    const totalRecords = processingResults ? processingResults.total || 0 : 0;
    const successCount = processingResults ? processingResults.successful || 0 : 0;
    const errorCount = processingResults && processingResults.errors ? processingResults.errors.length : 0;
    const createdCount = processingResults ? processingResults.created || 0 : 0;
    const updatedCount = processingResults ? processingResults.updated || 0 : 0;
    
    return `
      <h2>Upload Results</h2>
      
      <div class="vespa-results-container">
        <div class="vespa-results-status ${statusClass}">
          <div class="vespa-status-icon">${statusIcon}</div>
          <div class="vespa-status-text">${statusText}</div>
        </div>
        
        <div class="vespa-results-summary">
          <h3>Summary</h3>
          <div class="vespa-summary-details">
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Upload Type:</div>
              <div class="vespa-summary-value">${uploadType === 'staff' ? 'Staff' : 'Student'} Upload</div>
            </div>
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Total Records:</div>
              <div class="vespa-summary-value">${totalRecords}</div>
            </div>
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Successfully Processed:</div>
              <div class="vespa-summary-value">${successCount}</div>
            </div>
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Errors:</div>
              <div class="vespa-summary-value">${errorCount}</div>
            </div>
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">New Records Created:</div>
              <div class="vespa-summary-value">${createdCount}</div>
            </div>
            <div class="vespa-summary-item">
              <div class="vespa-summary-label">Records Updated:</div>
              <div class="vespa-summary-value">${updatedCount}</div>
            </div>
            ${alpsCalculationsHtml}
          </div>
        </div>
        
        <div class="vespa-results-actions">
          <button class="vespa-button secondary" id="download-results">Download Results CSV</button>
          <button class="vespa-button primary" id="start-new-upload">Start New Upload</button>
        </div>
        
        ${errorCount > 0 ? `
        <div class="vespa-results-details">
          <h3>Error Details</h3>
          <div class="vespa-errors-container" id="results-errors">
            <!-- Error details will be populated here -->
          </div>
        </div>
        ` : ''}
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
function downloadTemplateFile() {
    console.log('[VESPA Upload] Template download initiated');
    
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
      
      // FIXED: Use the correct endpoint (student instead of student-full)
      const templateType = type === 'staff' ? 'staff' : 'student';
      console.log('[VESPA Upload] Using correct template type:', templateType);
      
      // Update UI during download
      const downloadButton = document.getElementById('download-template');
      let originalText = '';
      if (downloadButton) {
        originalText = downloadButton.textContent;
        downloadButton.textContent = 'Opening Template...';
        downloadButton.disabled = true;
      }
      
      // Set up the API endpoint URL
      const templateUrl = `${API_BASE_URL}/templates/${templateType}`;
      console.log('[VESPA Upload] Template URL:', templateUrl);
      
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
      console.error('[VESPA Upload] Error in template download:', error);
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
   * Validate the CSV data
   * This function replaces the previous validation approach that had issues
   */
  function validateCsvData() {
    console.log('[VESPA Upload] Starting CSV validation');
    
    // Get the file input element
    const fileInput = document.getElementById('csv-file');
    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      showError('Please select a CSV file first');
      return;
    }
    
    const file = fileInput.files[0];
    
    // Update UI to show validation in progress
    updateValidationStatus('Validating data...', 'processing');
    
    // Prepare the file for upload
    const formData = new FormData();
    formData.append('file', file);
    
    // Determine the correct endpoint based on upload type
    const endpoint = uploadType === 'staff' ? 'staff' : 'students';
    const validationUrl = `${API_BASE_URL}/${endpoint}/validate`;
    
    console.log('[VESPA Upload] Validation URL:', validationUrl);
    
    // Make the API request
    fetch(validationUrl, {
      method: 'POST',
      body: formData
    })
    .then(handleApiResponse)
    .then(result => {
      console.log('[VESPA Upload] Validation result:', result);
      
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
      console.error('[VESPA Upload] Validation error:', error);
      
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
    
    // Show the validation results section
    const resultsDiv = document.querySelector('.vespa-validation-results');
    if (resultsDiv) {
      resultsDiv.style.display = 'block';
    }
    
    // Update counts
    document.getElementById('total-records').textContent = results.total || results.csvData?.length || 0;
    document.getElementById('valid-records').textContent = results.isValid ? 
      (results.total || results.csvData?.length || 0) : 
      ((results.total || results.csvData?.length || 0) - (results.errors?.length || 0));
    document.getElementById('error-count').textContent = results.errors?.length || 0;
    
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
    
    // Display CSV preview
    displayCsvPreview(results.csvData || []);
    
    // Display errors
    displayValidationErrors(results.errors || []);
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
      errors.forEach(error => {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'vespa-error-item';
        
        let errorContent = `
          <div class="vespa-error-title">Row ${error.row || 'Unknown'}: ${error.type || 'Validation Error'}</div>
          <div class="vespa-error-details">
        `;
        
        if (error.field) {
          errorContent += `<div class="vespa-error-field">Field: ${error.field}</div>`;
        }
        
        errorContent += `<div class="vespa-error-message">${error.message || error.error || 'Unknown error'}</div>`;
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
  function processUploadData() {
    console.log('[VESPA Upload] Starting data processing');
    
    // Safety checks
    if (!validationResults) {
      showError('Please validate your data first');
      return;
    }
    
    // Get processing options
    const sendNotifications = document.getElementById('send-notifications')?.checked ?? true;
    const runCalculators = document.getElementById('run-calculators')?.checked ?? true;
    const notificationEmail = document.getElementById('notification-email')?.value || '';
    
    // Update UI to show processing in progress
    const statusDiv = document.querySelector('.vespa-processing-status');
    if (statusDiv) {
      statusDiv.innerHTML = `
        <div class="vespa-status-icon">⏳</div>
        <div class="vespa-status-text">Processing data...</div>
      `;
    }
    
    // Disable process button
    const processButton = document.getElementById('process-button');
    if (processButton) {
      processButton.disabled = true;
      processButton.textContent = 'Processing...';
    }
    
    // Set processing flag
    isProcessing = true;
    
    // Prepare the request data
    const requestData = {
      csvData: validationResults.csvData,
      options: {
        sendNotifications: sendNotifications,
        runCalculators: runCalculators,
        notificationEmail: notificationEmail
      }
    };
    
    // Determine the correct endpoint
    const endpoint = uploadType === 'staff' ? 'staff' : 'students';
    const processUrl = `${API_BASE_URL}/${endpoint}/process`;
    
    console.log('[VESPA Upload] Process URL:', processUrl);
    console.log('[VESPA Upload] Process options:', requestData.options);
    
    // Make the API request
    fetch(processUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    })
    .then(handleApiResponse)
    .then(result => {
      console.log('[VESPA Upload] Processing result:', result);
      
      // Store the results
      processingResults = result;
      
      // Update UI to show success
      if (statusDiv) {
        statusDiv.innerHTML = `
          <div class="vespa-status-icon">✅</div>
          <div class="vespa-status-text">Processing completed</div>
        `;
      }
      
      // Reset processing flag
      isProcessing = false;
      
      // Move to results step
      setTimeout(() => {
        currentStep++;
        renderStep(currentStep);
      }, 1000);
    })
    .catch(error => {
      console.error('[VESPA Upload] Processing error:', error);
      
      // Show error in UI
      if (statusDiv) {
        statusDiv.innerHTML = `
          <div class="vespa-status-icon">❌</div>
          <div class="vespa-status-text">Processing failed</div>
        `;
      }
      
      showError(`Processing failed: ${error.message}`);
      
      // Reset processing flag
      isProcessing = false;
      
      // Re-enable process button
      if (processButton) {
        processButton.disabled = false;
        processButton.textContent = 'Try Again';
      }
    });
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
    // Determine which step we're on
    const isSuperUser = VESPA_UPLOAD_CONFIG?.userRole === 'Super User';
    const contentStep = !isSuperUser && currentStep > 1 ? currentStep + 1 : currentStep;
    
    switch (contentStep) {
      case 1: // Select upload type
        // No special event binding needed
        break;
        
      case 2: // Select school
        const searchButton = document.getElementById('search-button');
        const schoolSelect = document.getElementById('school-select');
        
        if (searchButton) {
          searchButton.addEventListener('click', () => {
            const searchTerm = document.getElementById('school-search')?.value || '';
            searchSchools(searchTerm);
          });
        }
        
        if (schoolSelect) {
          schoolSelect.addEventListener('change', () => {
            const selected = schoolSelect.options[schoolSelect.selectedIndex];
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
          downloadBtn.addEventListener('click', (e) => {
            e.preventDefault();
            downloadTemplateFile();
          });
        }
        
        if (fileInput) {
          fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
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
        break;
        
      case 4: // Validate Data
        const validateButton = document.getElementById('validate-button');
        if (validateButton) {
          validateButton.addEventListener('click', (e) => {
            e.preventDefault();
            validateCsvData();
          });
        }
        break;
        
      case 5: // Process Upload
        const processButton = document.getElementById('process-button');
        if (processButton) {
          processButton.addEventListener('click', (e) => {
            e.preventDefault();
            processUploadData();
          });
        }
        break;
        
      case 6: // Results
        const downloadResultsBtn = document.getElementById('download-results');
        const newUploadBtn = document.getElementById('start-new-upload');
        
        if (downloadResultsBtn) {
          downloadResultsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            downloadResults();
          });
        }
        
        if (newUploadBtn) {
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
   * Add CSS styles for the wizard
   * This is an extensive function that adds all the CSS styles to the page
   */
  function addStyles() {
    // Create a style element
    const styleElement = document.createElement('style');
    
    // Add the styles
    styleElement.textContent = `
      /* VESPA Upload Wizard Styles */
      .vespa-upload-wizard {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        max-width: 900px;
        margin: 0 auto;
        background: #fff;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        padding: 24px;
        color: #333;
      }
      
      .vespa-upload-header {
        text-align: center;
        margin-bottom: 24px;
      }
      
      .vespa-upload-header h1 {
        color: #007bff;
        margin: 0 0 8px 0;
        font-size: 28px;
      }
      
      .vespa-upload-steps {
        display: flex;
        justify-content: space-between;
        margin-bottom: 32px;
        position: relative;
      }
      
      .vespa-upload-steps::before {
        content: '';
        position: absolute;
        top: 24px;
        left: 0;
        right: 0;
        height: 2px;
        background: #e0e0e0;
        z-index: 1;
      }
      
      .vespa-step {
        display: flex;
        flex-direction: column;
        align-items: center;
        position: relative;
        z-index: 2;
      }
      
      .vespa-step-number {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #e0e0e0;
        color: #666;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        margin-bottom: 8px;
        transition: all 0.3s;
      }
      
      .vespa-step.active .vespa-step-number {
        background: #007bff;
        color: #fff;
      }
      
      .vespa-step.completed .vespa-step-number {
        background: #28a745;
        color: #fff;
      }
      
      .vespa-step-title {
        font-size: 14px;
        color: #666;
        text-align: center;
      }
      
      .vespa-step.active .vespa-step-title {
        color: #007bff;
        font-weight: bold;
      }
      
      .vespa-step.completed .vespa-step-title {
        color: #28a745;
      }
      
      .vespa-upload-content {
        min-height: 400px;
        margin-bottom: 24px;
      }
      
      .vespa-upload-content h2 {
        color: #007bff;
        margin: 0 0 16px 0;
      }
      
      .vespa-upload-actions {
        display: flex;
        justify-content: space-between;
        padding-top: 16px;
        border-top: 1px solid #e0e0e0;
      }
      
      .vespa-button {
        padding: 10px 20px;
        border-radius: 4px;
        border: none;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .vespa-button.primary {
        background: #007bff;
        color: #fff;
      }
      
      .vespa-button.primary:hover {
        background: #0069d9;
      }
      
      .vespa-button.secondary {
        background: #f8f9fa;
        color: #212529;
        border: 1px solid #ddd;
      }
      
      .vespa-button.secondary:hover {
        background: #e2e6ea;
      }
      
      .vespa-button-container {
        margin-top: 20px;
        text-align: center;
      }
      
      /* Error and info boxes */
      .vespa-error {
        background: #fff5f5;
        border-left: 4px solid #f44336;
        padding: 12px 16px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
      }
      
      .vespa-error-icon {
        margin-right: 12px;
        font-size: 20px;
      }
      
      .vespa-info-box {
        background: #f8f9fa;
        border-radius: 4px;
        padding: 16px;
        margin: 16px 0;
        display: flex;
      }
      
      .vespa-info-box.warning {
        background: #fff3cd;
        border-left: 4px solid #ffc107;
      }
      
      .vespa-info-icon {
        margin-right: 12px;
        font-size: 24px;
      }
      
      /* Success messages */
      .vespa-success {
        background: #d4edda;
        border-left: 4px solid #28a745;
        padding: 12px 16px;
        margin-bottom: 16px;
        display: flex;
        align-items: center;
      }
      
      .vespa-success-icon {
        margin-right: 12px;
        font-size: 20px;
      }
      
      /* Upload options */
      .vespa-upload-options {
        display: flex;
        gap: 16px;
        margin: 24px 0;
      }
      
      .vespa-upload-option {
        flex: 1;
        position: relative;
      }
      
      .vespa-upload-option input[type="radio"] {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }
      
      .vespa-upload-option label {
        display: block;
        padding: 16px;
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .vespa-upload-option input[type="radio"]:checked + label {
        border-color: #007bff;
        background: #f0f7ff;
      }
      
      .vespa-option-icon {
        font-size: 32px;
        margin-bottom: 8px;
        text-align: center;
      }
      
      .vespa-option-title {
        font-weight: bold;
        margin-bottom: 8px;
        text-align: center;
      }
      
      .vespa-option-description {
        font-size: 14px;
        color: #666;
      }
      
      /* File upload styles */
      .vespa-file-input {
        position: relative;
        margin-bottom: 24px;
      }
      
      .vespa-file-input input[type="file"] {
        position: absolute;
        width: 100%;
        height: 100%;
        opacity: 0;
        cursor: pointer;
      }
      
      .vespa-file-input label {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
        border: 2px dashed #ccc;
        border-radius: 8px;
        background: #f8f9fa;
        transition: all 0.2s;
      }
      
      .vespa-file-input:hover label {
        background: #e9ecef;
        border-color: #adb5bd;
      }
      
      .vespa-file-icon {
        font-size: 48px;
        margin-bottom: 16px;
      }
      
      .vespa-file-text {
        text-align: center;
        color: #666;
      }
      
      /* Table styles */
      .vespa-preview-table {
        width: 100%;
        overflow-x: auto;
      }
      
      .vespa-preview-table table {
        width: 100%;
        border-collapse: collapse;
      }
      
      .vespa-preview-table th,
      .vespa-preview-table td {
        padding: 8px 12px;
        border: 1px solid #ddd;
        text-align: left;
      }
      
      .vespa-preview-table th {
        background: #f2f2f2;
        font-weight: bold;
      }
      
      .vespa-preview-table .vespa-placeholder {
        text-align: center;
        color: #999;
        padding: 32px;
      }
      
      /* Results styles */
      .vespa-results-status {
        display: flex;
        align-items: center;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 24px;
      }
      
      .vespa-results-status.success {
        background: #d4edda;
        color: #155724;
      }
      
      .vespa-results-status.warning {
        background: #fff3cd;
        color: #856404;
      }
      
      .vespa-results-status.error {
        background: #f8d7da;
        color: #721c24;
      }
      
      .vespa-status-icon {
        font-size: 32px;
        margin-right: 16px;
      }
      
      .vespa-status-text {
        font-weight: bold;
      }
      
      .vespa-summary-details {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      
      .vespa-summary-item {
        background: #f8f9fa;
        padding: 12px;
        border-radius: 4px;
      }
      
      .vespa-summary-label {
        font-weight: bold;
        margin-bottom: 4px;
      }
      
      .vespa-validation-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
      }
      
      .vespa-validation-badge.success {
        background: #d4edda;
        color: #155724;
      }
      
      .vespa-validation-badge.error {
        background: #f8d7da;
        color: #721c24;
      }
      
      /* Modal styles */
      .vespa-modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: fadeIn 0.3s ease;
      }
      
      .vespa-modal {
        background-color: #fff;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        width: 90%;
        max-width: 800px;
        max-height: 90vh;
        overflow-y: auto;
        animation: zoomIn 0.3s ease;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes zoomIn {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }
      
      .vespa-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid #e0e0e0;
      }
      
      .vespa-modal-title {
        font-size: 18px;
        font-weight: 600;
        color: #2c3e50;
        margin: 0;
      }
      
      .vespa-modal-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #6c757d;
        line-height: 1;
      }
      
      .vespa-modal-body {
        padding: 20px;
      }
      
      .vespa-modal-footer {
        padding: 12px 20px;
        border-top: 1px solid #e0e0e0;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      
      /* Template modal specific styles */
      .vespa-templates-container {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
      }
      
      .vespa-template-card {
        flex: 1;
        min-width: 300px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 20px;
        background-color: #fff;
      }
      
      .vespa-template-card h3 {
        margin-top: 0;
        color: #2c3e50;
        border-bottom: 1px solid #e0e0e0;
        padding-bottom: 10px;
      }
      
      .vespa-template-preview {
        margin-bottom: 15px;
        overflow-x: auto;
      }
      
      .vespa-template-preview table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      
      .vespa-template-preview th,
      .vespa-template-preview td {
        padding: 6px 8px;
        border: 1px solid #e0e0e0;
        text-align: left;
      }
      
      .vespa-template-preview th {
        background-color: #f8f9fa;
        font-weight: 500;
      }
      
      .vespa-template-info {
        margin-bottom: 15px;
      }
      
      .vespa-template-info ul {
        padding-left: 20px;
        margin: 10px 0;
      }
      
      .vespa-template-info li {
        margin-bottom: 5px;
        font-size: 14px;
      }
      
      /* Debug panel styles */
      #vespa-upload-debug-indicator {
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
      }
      
      #vespa-debug-panel {
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
      }
      
      /* School selection styles */
      .vespa-school-search {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 20px;
      }
      
      .vespa-school-search input {
        flex: 1;
        min-width: 200px;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      
      .vespa-school-search select {
        flex: 2;
        min-width: 250px;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      
      .vespa-school-details {
        margin-top: 20px;
        padding: 15px;
        background: #f8f9fa;
        border-radius: 4px;
      }
      
      .vespa-info-row {
        display: flex;
        margin-bottom: 8px;
      }
      
      .vespa-info-label {
        width: 120px;
        font-weight: bold;
      }
      
      /* Checkbox and input styles */
      .vespa-checkbox-group {
        margin-bottom: 12px;
      }
      
      .vespa-input-group {
        margin-bottom: 12px;
      }
      
      .vespa-input-group label {
        display: block;
        margin-bottom: 4px;
        font-weight: 500;
      }
      
      .vespa-input-group input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 4px;
      }
      
      /* Validation results specific styles */
      .vespa-validation-container {
        margin-bottom: 24px;
      }
      
      .vespa-validation-status {
        display: flex;
        align-items: center;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 16px;
        background: #f8f9fa;
      }
      
      .vespa-validation-status.processing {
        background: #e0f7fa;
        color: #0288d1;
      }
      
      .vespa-validation-status.success {
        background: #d4edda;
        color: #155724;
      }
      
      .vespa-validation-status.error {
        background: #f8d7da;
        color: #721c24;
      }
      
      .vespa-validation-preview {
        margin-top: 24px;
      }
      
      .vespa-validation-preview h3 {
        margin-bottom: 12px;
      }
      
      .vespa-results-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 24px;
      }
      
      .vespa-result-item {
        background: #f8f9fa;
        padding: 12px;
        border-radius: 4px;
        min-width: 150px;
      }
      
      .vespa-result-label {
        font-weight: bold;
        margin-bottom: 4px;
      }
      
      .vespa-result-value {
        font-size: 18px;
      }
      
      .vespa-errors-container {
        margin-top: 16px;
      }
      
      .vespa-error-item {
        background: #f8f9fa;
        border-left: 4px solid #f44336;
        padding: 12px 16px;
        margin-bottom: 8px;
      }
    `;
    
    // Add the style element to the document
    document.head.appendChild(styleElement);
  }
  
  // === IMPORTANT: Expose functions to global scope ===
  // This is critical for the system to be able to call our functions
  window.initializeUploadBridge = initializeUploadBridge;
  window.showTemplateModal = showTemplateModal;
  window.downloadTemplate = downloadTemplate;
  window.showModal = showModal;
  window.closeModal = closeModal;
  
  // Add an initialization complete flag
  window.VESPA_UPLOAD_BRIDGE_INITIALIZED = true;
  
  // Log initialization completion
  debugLog("VESPA Upload Bridge script loaded and ready")
      
