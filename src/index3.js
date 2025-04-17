/**
 * VESPA Upload Bridge - Configuration
 * 
 * This file contains global configuration variables, state management,
 * and initialization setup for the VESPA Upload System.
 */

// Global configuration variable - will be set by MultiAppLoader
let VESPA_UPLOAD_CONFIG = null;

// Constants
// FIXED: Make sure we define the API URL with the correct /api suffix
let API_BASE_URL = 'https://vespa-upload-api-07e11c285370.herokuapp.com/api'; 
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
    const configUrl = VESPA_UPLOAD_CONFIG.apiUrl;
    
    // FIXED: Ensure the URL has the /api/ suffix
    const apiUrl = configUrl.endsWith('/api') ? configUrl : 
                  (configUrl.includes('/api/') ? configUrl : `${configUrl}/api`);
    
    debugLog("Using API URL from config", apiUrl);
    return apiUrl;
  }
  
  // Second priority: Use the window object if available
  if (window.VESPA_UPLOAD_CONFIG && window.VESPA_UPLOAD_CONFIG.apiUrl) {
    const windowUrl = window.VESPA_UPLOAD_CONFIG.apiUrl;
    
    // FIXED: Ensure the URL has the /api/ suffix
    const apiUrl = windowUrl.endsWith('/api') ? windowUrl : 
                  (windowUrl.includes('/api/') ? windowUrl : `${windowUrl}/api`);
    
    debugLog("Using API URL from window config", apiUrl);
    return apiUrl;
  }
  
  // Last resort: Use the hardcoded URL (which is already fixed to include /api)
  debugLog("Using default API URL", API_BASE_URL);
  return API_BASE_URL;
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
    
    // FIXED: Make sure API_BASE_URL is properly formatted for templates endpoint
    // Ensure the URL has the /api/ prefix
    const apiBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : 
                   (API_BASE_URL.includes('/api/') ? API_BASE_URL : `${API_BASE_URL}/api`);
    
    // Set up the API endpoint URL
    const templateUrl = `${apiBase}/templates/${templateType}`;
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
    
    // ADDED: More detailed error handling with URL information
    let statusMessage = document.getElementById('download-status-message');
    if (statusMessage) {
      statusMessage.innerHTML = `
        <span style="color:#c62828">❌ Error: Could not download template</span><br>
        <span>Check browser console for details</span>
      `;
      statusMessage.style.backgroundColor = '#ffebee';
    }
    
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
  
  // FIXED: Ensure the API base URL is properly formatted
  const apiBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : 
                 (API_BASE_URL.includes('/api/') ? API_BASE_URL : `${API_BASE_URL}/api`);
  
  // Determine the correct endpoint based on upload type
  const endpoint = uploadType === 'staff' ? 'staff' : 'students';
  const validationUrl = `${apiBase}/${endpoint}/validate`;
  
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
  
  // FIXED: Ensure the API base URL is properly formatted
  const apiBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : 
                 (API_BASE_URL.includes('/api/') ? API_BASE_URL : `${API_BASE_URL}/api`);
  
  // Determine the correct endpoint
  const endpoint = uploadType === 'staff' ? 'staff' : 'students';
  const processUrl = `${apiBase}/${endpoint}/process`;
  
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
   * Makes an API call to search for schools based on the search term
   * @param {string} searchTerm - The search term
   */
  function searchSchools(searchTerm) {
    console.log('[VESPA Upload] Searching for schools:', searchTerm);
    
    // Update UI to show search in progress
    const schoolSelect = document.getElementById('school-select');
    if (!schoolSelect) return;
    
    // Clear existing options
    schoolSelect.innerHTML = '<option value="">-- Loading schools... --</option>';
    
    // FIXED: Ensure proper API URL formatting
    const apiBase = API_BASE_URL.endsWith('/api') ? API_BASE_URL : 
                   (API_BASE_URL.includes('/api/') ? API_BASE_URL : `${API_BASE_URL}/api`);
    
    // Create the search URL
    const searchUrl = `${apiBase}/schools/search?term=${encodeURIComponent(searchTerm)}`;
    
    console.log('[VESPA Upload] School search URL:', searchUrl);
    
    // Make the API request
    fetch(searchUrl)
      .then(handleApiResponse)
      .then(result => {
        console.log('[VESPA Upload] School search results:', result);
        
        // Reset select options
        schoolSelect.innerHTML = '<option value="">-- Select a school --</option>';
        
        // Check if we have results
        if (result.schools && result.schools.length > 0) {
          // Add each school to the select
          result.schools.forEach(school => {
            const option = document.createElement('option');
            option.value = school.id;
            option.text = school.name;
            option.dataset.email = school.adminEmail || school.email || '';
            option.dataset.type = school.accountType || '';
            schoolSelect.appendChild(option);
          });
          
          showSuccess(`Found ${result.schools.length} schools matching "${searchTerm}"`);
        } else {
          // No schools found
          showError(`No schools found matching "${searchTerm}"`);
        }
      })
      .catch(error => {
        console.error('[VESPA Upload] School search error:', error);
        
        // Show error message
        schoolSelect.innerHTML = '<option value="">-- Select a school --</option>';
        showError(`School search failed: ${error.message}`);
        
        // Fallback to mock data for testing if real API fails
        if (DEBUG_MODE) {
          console.log('[VESPA Upload] DEBUG MODE: Using mock data as fallback');
          
          // Mock data for testing
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
          
          showSuccess('Using test data (API error detected)');
        }
      });
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
    `;
    
    // Add the style element to the document
    document.head.appendChild(styleElement);
  }
  
  // === IMPORTANT: Expose functions to global scope ===
  // This is critical for the system to be able to call our functions
  window.initializeUploadBridge = initializeUploadBridge;
  window.showTemplateModal = showTemplateModal;
  window.closeModal = closeModal;
  
  // FIXED: Add the downloadTemplate function to match the function name expected by index2b.js
  window.downloadTemplate = function(type) {
    console.log('[VESPA Upload] downloadTemplate called with type:', type);
    const originalUploadType = uploadType;
    uploadType = type;
    downloadTemplateFile();
    uploadType = originalUploadType;
  };
  
  // Add an initialization complete flag
  window.VESPA_UPLOAD_BRIDGE_INITIALIZED = true;
  
  // Log initialization completion
  debugLog("VESPA Upload Bridge script loaded and ready");
  
      
