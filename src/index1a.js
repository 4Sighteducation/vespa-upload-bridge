/**
 * VESPA Upload Bridge
 * 
 * This script provides the frontend integration for the VESPA Upload System.
 * It creates a multi-step wizard interface for uploading staff and student data
 * to the Knack database through the VESPA Upload API.
 */

// Global configuration variable - will be set by MultiAppLoader
let VESPA_UPLOAD_CONFIG = null;

// Constants
const API_BASE_URL = 'https://vespa-upload-api.herokuapp.com/api';
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

/**
 * Main initialization function that will be called by the loader
 */
function initializeUploadBridge() {
  debugLog("VESPA Upload Bridge initializing...");
  
  // Add CSS styles
  addStyles();
  
  // Add a visual indicator that the script is loaded
  addDebugIndicator();
  
  // Start polling for the upload container
  startPolling();
}

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
 * Add a small debug indicator to the page
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
  `;
  indicator.textContent = 'Upload Bridge Loaded';
  indicator.addEventListener('click', function() {
    // Log debug info when clicked
    debugLog("Debug indicator clicked", {
      'uploadContainer': document.querySelector(VESPA_UPLOAD_CONFIG.elementSelector) ? 'Found' : 'Not found',
      'config': VESPA_UPLOAD_CONFIG,
      'currentStep': currentStep,
      'uploadType': uploadType
    });
  });
  document.body.appendChild(indicator);
}

/**
 * Poll for the necessary DOM elements
 */
function startPolling() {
  debugLog("Starting to poll for upload container...");
  let checkCount = 0;
  
  const checkInterval = setInterval(function() {
    // Check if config is available
    if (!VESPA_UPLOAD_CONFIG) {
      debugLog("No configuration available yet");
      checkCount++;
      if (checkCount >= MAX_CHECKS) {
        clearInterval(checkInterval);
        console.error("[VESPA Upload] No configuration received after maximum attempts");
      }
      return;
    }
    
    // Check if the container exists
    const uploadContainer = document.querySelector(VESPA_UPLOAD_CONFIG.elementSelector);
    if (uploadContainer) {
      // Element found, clear the interval
      clearInterval(checkInterval);
      debugLog("Upload container found", { 
        selector: VESPA_UPLOAD_CONFIG.elementSelector
      });
      
      // Initialize the upload interface
      initializeUploadInterface(uploadContainer);
    } else {
      checkCount++;
      if (checkCount >= MAX_CHECKS) {
        clearInterval(checkInterval);
        console.error("[VESPA Upload] Could not find upload container after maximum attempts");
      }
    }
  }, CHECK_INTERVAL);
}

/**
 * Initialize the upload interface
 * @param {HTMLElement} container - The container element
 */
function initializeUploadInterface(container) {
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
 */
function nextStep() {
  const isSuperUser = VESPA_UPLOAD_CONFIG.userRole === 'Super User';
  const maxSteps = isSuperUser ? 6 : 5;
  
  // Validate current step
  if (!validateCurrentStep()) {
    return;
  }
  
  if (currentStep < maxSteps) {
    currentStep++;
    renderStep(currentStep);
  }
}

/**
 * Validate the current step
 * @returns {boolean} Whether the step is valid
 */
function validateCurrentStep() {
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
  contentDiv.prepend(errorDiv);
  
  // Remove after 5 seconds
  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

/**
 * Render the current step
 * @param {number} step - The step number to render
 */
function renderStep(step) {
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
  
  prevButton.style.display = step > 1 ? 'block' : 'none';
  
  const isSuperUser = VESPA_UPLOAD_CONFIG.userRole === 'Super User';
  const maxSteps = isSuperUser ? 6 : 5;
  
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
  
  // Render step content
  const contentDiv = document.querySelector('.vespa-upload-content');
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
      break;
    case 4:
      contentDiv.innerHTML = renderValidationStep();
      break;
    case 5:
      contentDiv.innerHTML = renderProcessingStep();
      break;
    case 6:
      contentDiv.innerHTML = renderResultsStep();
      break;
  }
}

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
    
    <script>
      // Add event listeners
      document.getElementById('search-button').addEventListener('click', function() {
        const searchTerm = document.getElementById('school-search').value;
        // TODO: Implement school search API call
        // This would be mocked for now
        
        // For demonstration, populate with dummy data
        const schoolSelect = document.getElementById('school-select');
        schoolSelect.innerHTML = '';
        
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
      });
      
      document.getElementById('school-select').addEventListener('change', function() {
        const selected = this.options[this.selectedIndex];
        if (selected.value) {
          document.getElementById('school-details').style.display = 'block';
          document.getElementById('school-name').textContent = selected.text;
          document.getElementById('admin-email').textContent = selected.dataset.email;
          document.getElementById('account-type').textContent = selected.dataset.type;
        } else {
          document.getElementById('school-details').style.display = 'none';
        }
      });
    </script>
  `;
}

/**
 * Render the upload CSV step
 * @returns {string} HTML for the step
 */
function renderUploadCsvStep() {
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
        <button id="download-template" class="vespa-button secondary">Download ${uploadType === 'staff' ? 'Staff' : 'Student'} Template</button>
      </div>
    </div>
    
    <div class="vespa-info-box">
      <div class="vespa-info-icon">ℹ️</div>
      <div class="vespa-info-content">
        <strong>CSV Format Requirements:</strong>
        ${uploadType === 'staff' ? `
          <ul>
            <li><strong>Required fields:</strong> Title, First Name, Last Name, Email Address, Staff Type</li>
            <li><strong>Staff Type codes:</strong> admin (Staff Admin), tut (Tutor), sub (Subject Teacher), hoy (Head of Year), hod (Head of Dept), gen (General Staff)</li>
            <li>Multiple staff types can be assigned using comma-separated values (e.g., "admin,tut")</li>
          </ul>
        ` : `
          <ul>
            <li><strong>Required fields:</strong> Lastname, Student Email, Group, Year Gp, Level, Tutor</li>
            <li><strong>Level values:</strong> Must be either "Level 2" or "Level 3"</li>
            <li><strong>Tutor field:</strong> Must contain valid email address(es) of existing tutors</li>
            <li>Optional GCSE data can be included to calculate prior attainment and expected grades</li>
          </ul>
        `}
      </div>
    </div>
    
    <script>
      // Add event listeners
      document.getElementById('download-template').addEventListener('click', function() {
        // TODO: Implement template download
        alert('Template download functionality will be implemented here');
      });
    </script>
  `;
}

/**
 * Render the validation step
 * @returns {string} HTML for the step
 */
function renderValidationStep() {
  // For now, we'll just render a placeholder
  // In a real implementation, this would call the API to validate the file
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
                ${uploadType === 'staff' ? `
                  <th>Title</th>
                  <th>First Name</th>
                  <th>Last Name</th>
                  <th>Email Address</th>
                  <th>Staff Type</th>
                ` : `
                  <th>Lastname</th>
                  <th>Firstname</th>
                  <th>Student Email</th>
                  <th>Group</th>
                  <th>Year Gp</th>
                  <th>Level</th>
                  <th>Tutor</th>
                `}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="${uploadType === 'staff' ? 6 : 8}" class="vespa-placeholder">File preview will appear here after validation</td>
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
  `;
}

/**
 * Render the processing step
 * @returns {string} HTML for the step
 */
function renderProcessingStep() {
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
          ${validationResults ? `
          <div class="vespa-summary-item">
            <div class="vespa-summary-label">Validation Status:</div>
            <div class="vespa-summary-value">
              <span class="vespa-validation-badge ${validationResults.isValid ? 'success' : 'error'}">
                ${validationResults.isValid ? 'Valid' : 'Has Errors'}
              </span>
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
            <label for="send-notifications">Send welcome emails to new users</label>
          </div>
          
          ${uploadType === 'student' ? `
          <div class="vespa-checkbox-group">
            <input type="checkbox" id="run-calculators" checked>
            <label for="run-calculators">Run ALPS calculators for GCSE data (if present)</label>
          </div>
          ` : ''}
          
          <div class="vespa-input-group">
            <label for="notification-email">Send results to email:</label>
            <input type="email" id="notification-email" value="${VESPA_UPLOAD_CONFIG.userEmail || ''}">
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
  `;
}

/**
 * Render the results step
 * @returns {string} HTML for the step
 */
function renderResultsStep() {
  // We'll render a placeholder for now
  // In a real implementation, this would show actual processing results
  return `
    <h2>Upload Results</h2>
    
    <div class="vespa-results-container">
      <div class="vespa-results-status success">
        <div class="vespa-status-icon">✅</div>
        <div class="vespa-status-text">Upload Completed Successfully</div>
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
            <div class="vespa-summary-value">10</div>
          </div>
          <div class="vespa-summary-item">
            <div class="vespa-summary-label">Successfully Processed:</div>
            <div class="vespa-summary-value">9</div>
          </div>
          <div class="vespa-summary-item">
            <div class="vespa-summary-label">Errors:</div>
            <div class="vespa-summary-value">1</div>
          </div>
          <div class="vespa-summary-item">
            <div class="vespa-summary-label">New Records Created:</div>
            <div class="vespa-summary-value">7</div>
          </div>
          <div class="vespa-summary-item">
            <div class="vespa-summary-label">Records Updated:</div>
            <div class="vespa-summary-value">2</div>
          </div>
          ${uploadType === 'student' && processingResults?.alpsCalculations ? `
          <div class="vespa-summary-item">
            <div class="vespa-summary-label">ALPS Calculations:</div>
            <div class="vespa-summary-value">Completed</div>
          </div>
          ` : ''}
        </div>
      </div>
      
      <div class="vespa-results-actions">
        <button class="vespa-button secondary" id="download-results">Download Results CSV</button>
        <button class="vespa-button primary" id="start-new-upload">Start New Upload</button>
      </div>
      
      <div class="vespa-results-details">
        <h3>Error Details</h3>
        <div class="vespa-errors-container">
          <div class="vespa-error-item">
            <div class="vespa-error-title">Row 5: Missing required field</div>
            <div class="vespa-error-details">
              <div class="vespa-error-field">Field: Email Address</div>
              <div class="vespa-error-message">This field is required and cannot be empty.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <script>
      // Add event listeners
      document.getElementById('download-results').addEventListener('click', function() {
        // TODO: Implement results download
        alert('Results download functionality will be implemented here');
      });
      
      document.getElementById('start-new-upload').addEventListener('click', function() {
        // Reset the wizard and go back to step 1
        currentStep = 1;
        uploadType = null;
        validationResults = null;
        processingResults = null;
        selectedSchool = null;
        isProcessing = false;
        
        renderStep(1);
      });
    </script>
  `;
}

/**
 * Add CSS styles to the page
 */
function addStyles() {
  const styleElement = document.createElement('style');
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
    
    /* Step-specific styles */
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
    
    /* Error details */
    .vespa-errors-container {
      margin-top: 16px;
    }
    
    .vespa-error-item {
      background: #f8f9fa;
      border-left: 4px solid #f44336;
      padding: 12px 16px;
      margin-bottom: 8px;
    }
    
    .vespa-error-title {
      font-weight: bold;
      margin-bottom: 8px;
    }
    
    .vespa-error-details {
      padding-left: 16px;
      font-size: 14px;
    }
    
    .vespa-error-field {
      font-weight: bold;
      margin-bottom: 4px;
    }
  `;
  document.head.appendChild(styleElement);
}

// Expose initializer to global scope for the Multi-App Loader
window.initializeUploadBridge = initializeUploadBridge;
