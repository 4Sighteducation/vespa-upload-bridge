/**
 * VESPA Account Management Module
 * Version 1.1 - Fixed AJAX and UI issues
 * 
 * This module provides comprehensive account management functionality
 * for staff and student accounts in the VESPA system.
 */

(function() {
  'use strict';

  // Module configuration
  const MODULE_NAME = 'VESPAAccountManagement';
  const API_BASE_URL = window.API_BASE_URL || 'https://vespa-upload-api-07e11c285370.herokuapp.com/api/';

  // Role mappings - profile IDs to role names
  const ROLE_PROFILES = {
    'profile_5': 'Staff Admin',
    'profile_6': 'Student',
    'profile_7': 'Tutor',
    'profile_8': 'General Staff',
    'profile_18': 'Head of Year',
    'profile_25': 'Head of Dept',
    'profile_78': 'Subject Teacher'
  };

  // Reverse mapping for easy lookup
  const PROFILE_IDS = Object.entries(ROLE_PROFILES).reduce((acc, [id, name]) => {
    acc[name] = id;
    return acc;
  }, {});

  // Module state
  let isInitialized = false;
  let currentView = 'staff'; // 'staff' or 'student'
  let selectedAccounts = new Set();
  let staffData = [];
  let studentData = [];
  let currentFilters = {};
  let staffDataTable = null;
  let studentDataTable = null;
  
  // VESPA Activities configuration
  const VESPA_CATEGORIES = {
    VISION: { name: 'Vision', color: '#ff8f00' },
    EFFORT: { name: 'Effort', color: '#86b4f0' },
    SYSTEMS: { name: 'Systems', color: '#72cb44' },
    PRACTICE: { name: 'Practice', color: '#7f31a4' },
    ATTITUDE: { name: 'Attitude', color: '#f032e6' }
  };

  /**
   * Initialize the Account Management module
   */
  function initialize() {
    if (isInitialized) {
      debugLog('Account Management module already initialized');
      return;
    }

    debugLog('Initializing Account Management module');
    isInitialized = true;

    // Add module styles
    addModuleStyles();
    
    // Load DataTables CSS and JS
    loadDataTablesAssets();

    // Make public API available - only include functions that actually exist
    window[MODULE_NAME] = {
      // Main functions
      show: showAccountManagement,
      hide: hideAccountManagement,
      refresh: refreshData,
      
      // Selection functions
      toggleSelectAll: toggleSelectAll,
      toggleTableSelectAll: toggleTableSelectAll,
      toggleRowSelection: toggleRowSelection,
      
      // Action functions
      resetPasswords: resetPasswords,
      resendWelcomeEmails: resendWelcomeEmails,
      deleteAccounts: deleteAccounts,
      confirmDelete: confirmDelete,
      
      // Staff/Student management functions
      updateStaffRoles: updateStaffRoles,
      viewLinkedAccounts: viewLinkedAccounts,
      updateLinkedStaff: updateLinkedStaff,
      editStudentActivities: editStudentActivities,
      saveActivities: saveActivities,
      reallocateStudent: reallocateStudent,
      
      // Modal functions
      showModal: showModal,
      closeModal: closeModal,
      closeSuccessModal: closeSuccessModal,
      
      // Utility functions
      showError: showError,
      showSuccess: showSuccess,
      getSelectedAccountIds: getSelectedAccountIds
    };

    debugLog('Account Management module initialized');
  }

  /**
   * Load DataTables assets
   */
  function loadDataTablesAssets() {
    // Add DataTables CSS
    if (!document.getElementById('datatables-css')) {
      const dtCSS = document.createElement('link');
      dtCSS.id = 'datatables-css';
      dtCSS.rel = 'stylesheet';
      dtCSS.href = 'https://cdn.datatables.net/1.13.6/css/jquery.dataTables.min.css';
      document.head.appendChild(dtCSS);
    }
    
    // Add DataTables Buttons CSS
    if (!document.getElementById('datatables-buttons-css')) {
      const dtButtonsCSS = document.createElement('link');
      dtButtonsCSS.id = 'datatables-buttons-css';
      dtButtonsCSS.rel = 'stylesheet';
      dtButtonsCSS.href = 'https://cdn.datatables.net/buttons/2.4.1/css/buttons.dataTables.min.css';
      document.head.appendChild(dtButtonsCSS);
    }
    
    // Load DataTables JS
    if (typeof $.fn.DataTable === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.datatables.net/1.13.6/js/jquery.dataTables.min.js';
      script.onload = () => {
        // Load DataTables Buttons
        const buttonsScript = document.createElement('script');
        buttonsScript.src = 'https://cdn.datatables.net/buttons/2.4.1/js/dataTables.buttons.min.js';
        document.head.appendChild(buttonsScript);
        
        // Load additional button scripts
        const scripts = [
          'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
          'https://cdn.datatables.net/buttons/2.4.1/js/buttons.html5.min.js',
          'https://cdn.datatables.net/buttons/2.4.1/js/buttons.print.min.js'
        ];
        
        scripts.forEach(src => {
          const s = document.createElement('script');
          s.src = src;
          document.head.appendChild(s);
        });
      };
      document.head.appendChild(script);
    }
  }

  /**
   * Debug logging helper
   */
  function debugLog(message, data = null) {
    if (window.DEBUG_MODE || window.debugLog) {
      const logFn = window.debugLog || console.log;
      logFn(`[Account Management] ${message}`, data);
    }
  }

  /**
   * Show error message
   */
  function showError(message) {
    if (window.showError) {
      window.showError(message);
    } else {
      alert('Error: ' + message);
    }
  }

  /**
   * Show success message
   */
  function showSuccess(message) {
    if (window.showSuccess) {
      window.showSuccess(message);
    } else {
      alert('Success: ' + message);
    }
  }

  /**
   * Show modal dialog
   */
  function showModal(title, content, onClose) {
    if (window.showModal) {
      return window.showModal(title, content, onClose);
    } else {
      // Fallback modal implementation
      const modal = document.createElement('div');
      modal.className = 'vespa-modal-backdrop';
      modal.innerHTML = `
        <div class="vespa-modal">
          <div class="vespa-modal-header">
            <h2 class="vespa-modal-title">${title}</h2>
            <button class="vespa-modal-close">&times;</button>
          </div>
          <div class="vespa-modal-body">${content}</div>
        </div>
      `;
      document.body.appendChild(modal);
      
      modal.querySelector('.vespa-modal-close').addEventListener('click', () => {
        document.body.removeChild(modal);
        if (onClose) onClose();
      });
      
      return { backdrop: modal };
    }
  }

  /**
   * Close modal
   */
  function closeModal() {
    if (window.closeModal) {
      window.closeModal();
    }
  }

  /**
   * Add module-specific styles
   */
  function addModuleStyles() {
    if (document.getElementById('vespa-account-management-styles')) return;

    const styles = `
      .vespa-account-management {
        padding: 20px;
        max-width: 1400px;
        margin: 0 auto;
      }

      .vespa-am-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 2px solid #e0e0e0;
      }

      .vespa-am-tabs {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
      }

      .vespa-am-tab {
        padding: 10px 20px;
        background: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.3s;
      }

      .vespa-am-tab.active {
        background: #007bff;
        color: white;
        border-color: #007bff;
      }

      .vespa-am-filters {
        display: flex;
        gap: 15px;
        margin-bottom: 20px;
        padding: 15px;
        background: #f8f9fa;
        border-radius: 8px;
      }

      .vespa-am-filter-group {
        flex: 1;
      }

      .vespa-am-actions {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        padding: 15px;
        background: #e3f2fd;
        border-radius: 8px;
      }

      .vespa-am-table-container {
        overflow-x: auto;
        border: 1px solid #dee2e6;
        border-radius: 8px;
        padding: 10px;
      }

      .vespa-am-table {
        width: 100%;
        border-collapse: collapse;
      }

      .vespa-am-table th {
        background: #f8f9fa;
        padding: 12px;
        text-align: left;
        font-weight: 600;
        border-bottom: 2px solid #dee2e6;
      }

      .vespa-am-table td {
        padding: 10px 12px;
        border-bottom: 1px solid #e9ecef;
      }

      .vespa-am-table tr:hover {
        background: #f8f9fa;
      }

      .vespa-am-checkbox {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }

      .vespa-am-role-display {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      
      .vespa-am-role-badge {
        display: inline-block;
        padding: 3px 8px;
        background: #e3f2fd;
        color: #1976d2;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
      }

      .vespa-am-link-button {
        padding: 5px 10px;
        background: #6c757d;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        margin: 2px;
      }

      .vespa-am-link-button:hover {
        background: #5a6268;
      }

      .vespa-am-loading {
        text-align: center;
        padding: 40px;
        color: #6c757d;
      }

      .vespa-am-empty {
        text-align: center;
        padding: 60px;
        color: #6c757d;
      }

      .vespa-activity-grid {
        display: grid;
        gap: 20px;
        margin-top: 20px;
      }

      .vespa-activity-category {
        border: 2px solid #e0e0e0;
        border-radius: 8px;
        padding: 15px;
      }

      .vespa-activity-category h4 {
        margin-top: 0;
        margin-bottom: 15px;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .vespa-activity-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px;
        margin-bottom: 5px;
        background: #f8f9fa;
        border-radius: 4px;
      }

      .vespa-activity-checkbox {
        width: 20px;
        height: 20px;
      }

      .vespa-activity-level {
        padding: 2px 8px;
        background: #e9ecef;
        border-radius: 3px;
        font-size: 12px;
        font-weight: 500;
      }

      .vespa-linked-students-list {
        max-height: 400px;
        overflow-y: auto;
      }

      .vespa-student-link-item {
        padding: 10px;
        border: 1px solid #dee2e6;
        border-radius: 4px;
        margin-bottom: 10px;
        background: #ffffff;
      }

      .vespa-student-link-item:hover {
        background: #f8f9fa;
      }

      .vespa-reallocation-controls {
        display: flex;
        gap: 10px;
        margin-top: 10px;
      }
      
      /* DataTables custom styling */
      .dataTables_wrapper {
        padding: 10px 0;
      }
      
      .dataTables_filter {
        margin-bottom: 20px;
      }
      
      .dataTables_filter input {
        padding: 8px 12px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        width: 300px;
      }
      
      table.dataTable thead th {
        background: #f8f9fa !important;
      }
      
      table.dataTable.no-footer {
        border-bottom: 1px solid #dee2e6;
      }
      
      .dt-buttons {
        margin-bottom: 15px;
      }
      
      .dt-button {
        padding: 6px 12px !important;
        background: #6c757d !important;
        color: white !important;
        border: none !important;
        border-radius: 4px !important;
        margin-right: 5px !important;
      }
      
      .dt-button:hover {
        background: #5a6268 !important;
      }
    `;

    const styleSheet = document.createElement('style');
    styleSheet.id = 'vespa-account-management-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  /**
   * Show the Account Management interface
   */
  function showAccountManagement() {
    debugLog('Showing Account Management interface');

    // Hide the main wizard if it exists
    const wizard = document.getElementById('vespa-upload-wizard');
    if (wizard) wizard.style.display = 'none';

    // Get the main container - try multiple selectors
    let container = null;
    
    // First try the VESPA_UPLOAD_CONFIG selector
    if (window.VESPA_UPLOAD_CONFIG?.elementSelector) {
      container = document.querySelector(window.VESPA_UPLOAD_CONFIG.elementSelector);
      debugLog('Trying VESPA_UPLOAD_CONFIG selector:', window.VESPA_UPLOAD_CONFIG.elementSelector);
    }
    
    // Fallback to common Knack containers
    if (!container) {
      const selectors = [
        '#vespa-container',
        '.kn-content',
        '#knack-body',
        '#knack-dist_1',
        '.kn-scene'
      ];
      
      for (const selector of selectors) {
        container = document.querySelector(selector);
        if (container) {
          debugLog('Found container with selector:', selector);
          break;
        }
      }
    }
    
    if (!container) {
      showError('Unable to find container for Account Management');
      debugLog('Error: No container found for Account Management');
      return;
    }

    // Check if account management already exists
    const existingAM = document.getElementById('vespa-account-management');
    if (existingAM) {
      debugLog('Account Management already exists, removing old instance');
      existingAM.remove();
    }

    // Create the account management interface
    const amContainer = document.createElement('div');
    amContainer.id = 'vespa-account-management';
    amContainer.className = 'vespa-account-management';
    
    try {
      amContainer.innerHTML = createMainInterface();
      debugLog('Created main interface HTML');
    } catch (error) {
      debugLog('Error creating interface HTML:', error);
      showError('Failed to create Account Management interface');
      return;
    }

    // Append to container
    container.appendChild(amContainer);
    debugLog('Appended Account Management to container');

    // Bind events
    try {
      bindInterfaceEvents();
      debugLog('Bound interface events');
    } catch (error) {
      debugLog('Error binding events:', error);
    }

    // Load initial data
    debugLog('Loading initial staff data');
    loadAccountData('staff');
  }

  /**
   * Hide the Account Management interface
   */
  function hideAccountManagement() {
    const amContainer = document.getElementById('vespa-account-management');
    if (amContainer) {
      amContainer.remove();
    }

    // Show the wizard again if it exists
    const wizard = document.getElementById('vespa-upload-wizard');
    if (wizard) wizard.style.display = 'block';
  }

  /**
   * Create the main interface HTML
   */
  function createMainInterface() {
    return `
      <div class="vespa-am-header">
        <h2>Account Management</h2>
        <button class="vespa-button secondary" onclick="window.VESPAAccountManagement.hide()">
          ← Back to Upload System
        </button>
      </div>

      <div class="vespa-am-tabs">
        <button class="vespa-am-tab active" data-view="staff">
          👥 Staff Management
        </button>
        <button class="vespa-am-tab" data-view="student">
          🎓 Student Management
        </button>
      </div>

      <div class="vespa-am-filters">
        <div class="vespa-am-filter-group">
          <label>Search:</label>
          <input type="text" id="am-search" placeholder="Search by name or email..." 
            style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
        </div>
        <div class="vespa-am-filter-group">
          <label>Year Group:</label>
          <select id="am-filter-year" style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
            <option value="">All Years</option>
            <option value="9">Year 9</option>
            <option value="10">Year 10</option>
            <option value="11">Year 11</option>
            <option value="12">Year 12</option>
            <option value="13">Year 13</option>
          </select>
        </div>
        <div class="vespa-am-filter-group">
          <label>Group:</label>
          <input type="text" id="am-filter-group" placeholder="e.g., 12A" 
            style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;">
        </div>
      </div>

      <div class="vespa-am-actions">
        <button class="vespa-button secondary" onclick="window.VESPAAccountManagement.toggleSelectAll()">
          <input type="checkbox" id="am-select-all" style="margin-right: 5px;">
          Select All
        </button>
        <button class="vespa-button primary" onclick="window.VESPAAccountManagement.resetPasswords()">
          🔑 Reset Password(s)
        </button>
        <button class="vespa-button primary" onclick="window.VESPAAccountManagement.resendWelcomeEmails()">
          ✉️ Resend Welcome Email(s)
        </button>
        <button class="vespa-button secondary" onclick="window.VESPAAccountManagement.deleteAccounts()" 
          style="background: #dc3545; color: white;">
          🗑️ Delete Selected
        </button>
      </div>

      <div id="vespa-am-content">
        <div class="vespa-am-loading">
          <div class="vespa-spinner"></div>
          <p>Loading account data...</p>
        </div>
      </div>
    `;
  }

  /**
   * Bind interface events
   */
  function bindInterfaceEvents() {
    // Tab switching
    document.querySelectorAll('.vespa-am-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        const view = e.target.dataset.view;
        switchView(view);
      });
    });

    // Search and filters
    document.getElementById('am-search').addEventListener('input', debounce(applyFilters, 300));
    document.getElementById('am-filter-year').addEventListener('change', applyFilters);
    document.getElementById('am-filter-group').addEventListener('input', debounce(applyFilters, 300));

    // Select all checkbox event
    document.getElementById('am-select-all').addEventListener('change', function() {
      toggleSelectAll();
    });
  }

  /**
   * Switch between staff and student views
   */
  function switchView(view) {
    currentView = view;
    selectedAccounts.clear();

    // Update tab styling
    document.querySelectorAll('.vespa-am-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === view);
    });

    // Update filters visibility
    const yearFilter = document.getElementById('am-filter-year').parentElement;
    yearFilter.style.display = view === 'staff' ? 'block' : 'block'; // Both can filter by year

    // Clear filters
    document.getElementById('am-search').value = '';
    document.getElementById('am-filter-year').value = '';
    document.getElementById('am-filter-group').value = '';

    // Load data for the selected view
    loadAccountData(view);
  }

  /**
   * Load account data (staff or students)
   */
  function loadAccountData(type) {
    debugLog(`Loading ${type} accounts`);
    currentView = type;
    
    const customerId = getCustomerId();
    if (!customerId) {
      showError('No customer ID available');
      return;
    }
    
    // Show loading state
    const contentArea = document.getElementById('vespa-am-content');
    contentArea.innerHTML = '<div class="vespa-am-loading"><div class="vespa-spinner"></div><p>Loading accounts...</p></div>';
    
    // Update active tab
    document.querySelectorAll('.vespa-am-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === type);
    });
    
    const endpoint = type === 'staff' ? 'get-staff' : 'get-students';
    
    $.ajax({
      url: `${API_BASE_URL}account/${endpoint}`,
      type: 'GET',
      data: { customerId },
      xhrFields: {
        withCredentials: true
      },
      success: function(response) {
        debugLog(`${type} accounts loaded:`, response);
        
        if (response.success && response.data) {
          displayAccounts(response.data, type);
        } else {
          showError('Failed to load accounts');
        }
      },
      error: function(xhr, status, error) {
        debugLog(`Error loading ${type} accounts:`, error);
        showError(`Failed to load ${type} accounts: ${error}`);
      }
    });
  }

  /**
   * Display accounts in a table
   */
  function displayAccounts(accounts, type) {
    const contentArea = document.getElementById('vespa-am-content');
    
    if (!accounts || accounts.length === 0) {
      contentArea.innerHTML = `
        <div class="vespa-am-empty">
          <p>No ${type} accounts found</p>
        </div>
      `;
      return;
    }
    
    // Store current data
    if (type === 'staff') {
      staffData = accounts;
    } else {
      studentData = accounts;
    }
    
    // Build table based on type
    if (type === 'staff') {
      displayStaffTable(accounts);
    } else {
      displayStudentTable(accounts);
    }
  }

  /**
   * Display staff table
   */
  function displayStaffTable(data) {
    const content = document.getElementById('vespa-am-content');
    
    if (data.length === 0) {
      content.innerHTML = `
        <div class="vespa-am-empty">
          <p>No staff accounts found</p>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="vespa-am-table-container">
        <table id="staff-datatable" class="vespa-am-table display">
          <thead>
            <tr>
              <th style="width: 40px;">
                <input type="checkbox" class="vespa-am-checkbox" id="table-select-all"
                  onchange="window.VESPAAccountManagement.toggleTableSelectAll(this)">
              </th>
              <th>Name</th>
              <th>Email</th>
              <th>Group</th>
              <th>Account ID</th>
              <th>Has Logged In</th>
              <th>User Role(s)</th>
              <th>Last Login</th>
              <th>Features Used</th>
              <th>Login Count</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(staff => createStaffRow(staff)).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Initialize DataTable after a brief delay
    setTimeout(() => {
      if ($.fn.DataTable) {
        staffDataTable = $('#staff-datatable').DataTable({
          pageLength: 25,
          dom: 'Bfrtip',
          buttons: [
            'copy', 'csv', 'excel', 'print'
          ],
          columnDefs: [
            { orderable: false, targets: [0, -1] } // Disable sorting on checkbox and actions columns
          ],
          order: [[1, 'asc']] // Sort by name by default
        });
      }
    }, 100);
  }

  /**
   * Create a staff table row
   */
  function createStaffRow(staff) {
    const hasLoggedIn = staff.field_539 === 'Yes' || staff.field_539 === true ? 'Yes' : 'No';
    const roles = staff.field_73 || [];
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    
    // Convert profile IDs to role names for display
    const roleNames = rolesArray
      .filter(role => role && role !== 'profile_6') // Exclude student role
      .map(profileId => ROLE_PROFILES[profileId] || profileId);
    
    // Create role badges HTML
    const rolesHtml = roleNames.length > 0 
      ? roleNames.map(role => `<span class="vespa-am-role-badge">${role}</span>`).join(' ')
      : '<span style="color: #999;">No roles assigned</span>';
    
    return `
      <tr data-account-id="${staff.id}">
        <td>
          <input type="checkbox" class="vespa-am-checkbox row-checkbox" 
            value="${staff.id}" onchange="window.VESPAAccountManagement.toggleRowSelection(this)">
        </td>
        <td>${staff.field_69?.full || staff.field_69 || 'N/A'}</td>
        <td>${staff.field_70?.email || staff.field_70 || 'N/A'}</td>
        <td>${staff.field_708 || 'N/A'}</td>
        <td>${staff.field_123 || 'N/A'}</td>
        <td>${hasLoggedIn}</td>
        <td>
          <div class="vespa-am-role-display">
            ${rolesHtml}
          </div>
        </td>
        <td>${staff.field_3198 ? formatDate(staff.field_3198) : 'Never'}</td>
        <td>${Array.isArray(staff.field_3202) ? staff.field_3202.join(', ') : (staff.field_3202 || 'None')}</td>
        <td>${staff.field_3208 || '0'}</td>
        <td>
          <button class="vespa-am-link-button" onclick="window.VESPAAccountManagement.viewLinkedAccounts('${staff.id}', 'staff')">
            View Links
          </button>
          <button class="vespa-am-link-button" onclick="window.VESPAAccountManagement.editStaffRoles('${staff.id}')">
            Edit Roles
          </button>
        </td>
      </tr>
    `;
  }

  /**
   * Display student table
   */
  function displayStudentTable(data) {
    const content = document.getElementById('vespa-am-content');
    
    if (data.length === 0) {
      content.innerHTML = `
        <div class="vespa-am-empty">
          <p>No student accounts found</p>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="vespa-am-table-container">
        <table id="student-datatable" class="vespa-am-table display">
          <thead>
            <tr>
              <th style="width: 40px;">
                <input type="checkbox" class="vespa-am-checkbox" id="table-select-all"
                  onchange="window.VESPAAccountManagement.toggleTableSelectAll(this)">
              </th>
              <th>Name</th>
              <th>Email</th>
              <th>Group</th>
              <th>Year</th>
              <th>Account ID</th>
              <th>Has Logged In</th>
              <th>Last Login</th>
              <th>Features Used</th>
              <th>Login Count</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(student => createStudentRow(student)).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Initialize DataTable after a brief delay
    setTimeout(() => {
      if ($.fn.DataTable) {
        studentDataTable = $('#student-datatable').DataTable({
          pageLength: 25,
          dom: 'Bfrtip',
          buttons: [
            'copy', 'csv', 'excel', 'print'
          ],
          columnDefs: [
            { orderable: false, targets: [0, -1] } // Disable sorting on checkbox and actions columns
          ],
          order: [[1, 'asc']] // Sort by name by default
        });
      }
    }, 100);
  }

  /**
   * Create a student table row
   */
  function createStudentRow(student) {
    const hasLoggedIn = student.field_539 === 'Yes' || student.field_539 === true ? 'Yes' : 'No';
    
    return `
      <tr data-account-id="${student.id}">
        <td>
          <input type="checkbox" class="vespa-am-checkbox row-checkbox" 
            value="${student.id}" onchange="window.VESPAAccountManagement.toggleRowSelection(this)">
        </td>
        <td>${student.field_69?.full || student.field_69 || 'N/A'}</td>
        <td>${student.field_70?.email || student.field_70 || 'N/A'}</td>
        <td>${student.field_708 || 'N/A'}</td>
        <td>${student.field_550 || 'N/A'}</td>
        <td>${student.field_123 || 'N/A'}</td>
        <td>${hasLoggedIn}</td>
        <td>${student.field_3198 ? formatDate(student.field_3198) : 'Never'}</td>
        <td>${Array.isArray(student.field_3202) ? student.field_3202.join(', ') : (student.field_3202 || 'None')}</td>
        <td>${student.field_3208 || '0'}</td>
        <td>
          <button class="vespa-am-link-button" onclick="window.VESPAAccountManagement.viewLinkedAccounts('${student.id}', 'student')">
            Manage Links
          </button>
          <button class="vespa-am-link-button" onclick="window.VESPAAccountManagement.editStudentActivities('${student.id}')">
            Activities
          </button>
        </td>
      </tr>
    `;
  }

  /**
   * Filter data based on current filters
   */
  function filterData(data) {
    const searchTerm = document.getElementById('am-search').value.toLowerCase();
    const yearFilter = document.getElementById('am-filter-year').value;
    const groupFilter = document.getElementById('am-filter-group').value.toLowerCase();

    return data.filter(item => {
      // Search filter
      if (searchTerm) {
        const name = (item.field_69 || '').toLowerCase();
        const email = (item.field_70 || '').toLowerCase();
        if (!name.includes(searchTerm) && !email.includes(searchTerm)) {
          return false;
        }
      }

      // Year filter
      if (yearFilter && item.field_550 !== yearFilter) {
        return false;
      }

      // Group filter
      if (groupFilter && !(item.field_708 || '').toLowerCase().includes(groupFilter)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Apply filters to the current view
   */
  function applyFilters() {
    if (currentView === 'staff') {
      displayStaffTable(staffData);
    } else {
      displayStudentTable(studentData);
    }
  }

  /**
   * Toggle select all checkbox
   */
  function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('am-select-all');
    const tableSelectAll = document.getElementById('table-select-all');
    
    if (selectAllCheckbox.checked) {
      // Select all visible rows
      document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = true;
        selectedAccounts.add(cb.value);
      });
      if (tableSelectAll) tableSelectAll.checked = true;
    } else {
      // Deselect all
      document.querySelectorAll('.row-checkbox').forEach(cb => {
        cb.checked = false;
      });
      selectedAccounts.clear();
      if (tableSelectAll) tableSelectAll.checked = false;
    }
  }

  /**
   * Toggle table select all
   */
  function toggleTableSelectAll(checkbox) {
    document.querySelectorAll('.row-checkbox').forEach(cb => {
      cb.checked = checkbox.checked;
      if (checkbox.checked) {
        selectedAccounts.add(cb.value);
      } else {
        selectedAccounts.delete(cb.value);
      }
    });
    document.getElementById('am-select-all').checked = checkbox.checked;
  }

  /**
   * Toggle individual row selection
   */
  function toggleRowSelection(checkbox) {
    if (checkbox.checked) {
      selectedAccounts.add(checkbox.value);
    } else {
      selectedAccounts.delete(checkbox.value);
    }
    
    // Update select all checkboxes
    const allChecked = document.querySelectorAll('.row-checkbox:checked').length === 
                      document.querySelectorAll('.row-checkbox').length;
    document.getElementById('am-select-all').checked = allChecked;
    const tableSelectAll = document.getElementById('table-select-all');
    if (tableSelectAll) tableSelectAll.checked = allChecked;
  }

  /**
   * Handle password reset for selected accounts
   */
  function resetPasswords() {
    const selectedIds = getSelectedAccountIds();
    if (selectedIds.length === 0) {
      showError('Please select at least one account');
      return;
    }
    
    // Confirm action
    if (!confirm(`Reset passwords for ${selectedIds.length} account(s)?`)) {
      return;
    }
    
    // Show loading state
    showLoadingModal('Resetting passwords...');
    
    $.ajax({
      url: `${API_BASE_URL}account/reset-passwords`,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        accountIds: selectedIds,
        accountType: currentView
      }),
      xhrFields: {
        withCredentials: true
      },
      success: function(response) {
        closeLoadingModal();
        
        if (response.success) {
          showSuccessModal(`Successfully reset ${response.successCount} password(s)`, function() {
            loadAccountData(currentView);
          });
        } else {
          const errorMsg = response.errors && response.errors.length > 0 
            ? `Failed to reset some passwords: ${response.errors.join(', ')}`
            : 'Failed to reset passwords';
          showError(errorMsg);
        }
      },
      error: function(xhr, status, error) {
        closeLoadingModal();
        showError(`Failed to reset passwords: ${error}`);
      }
    });
  }

  /**
   * Handle resending welcome emails
   */
  function resendWelcomeEmails() {
    const selectedIds = getSelectedAccountIds();
    if (selectedIds.length === 0) {
      showError('Please select at least one account');
      return;
    }
    
    // Confirm action
    if (!confirm(`Resend welcome emails to ${selectedIds.length} account(s)?`)) {
      return;
    }
    
    // Show loading state
    showLoadingModal('Sending welcome emails...');
    
    $.ajax({
      url: `${API_BASE_URL}account/resend-welcome-emails`,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        accountIds: selectedIds,
        accountType: currentView
      }),
      xhrFields: {
        withCredentials: true
      },
      success: function(response) {
        closeLoadingModal();
        
        if (response.success) {
          showSuccessModal(`Successfully sent ${response.successCount} welcome email(s)`, function() {
            // No need to reload, just show success
          });
        } else {
          const errorMsg = response.errors && response.errors.length > 0 
            ? `Failed to send some emails: ${response.errors.join(', ')}`
            : 'Failed to send welcome emails';
          showError(errorMsg);
        }
      },
      error: function(xhr, status, error) {
        closeLoadingModal();
        showError(`Failed to send welcome emails: ${error}`);
      }
    });
  }

  /**
   * Handle account deletion
   */
  function deleteAccounts() {
    const selectedIds = getSelectedAccountIds();
    if (selectedIds.length === 0) {
      showError('Please select at least one account');
      return;
    }
    
    // Create confirmation modal
    const confirmModal = `
      <div class="vespa-am-delete-confirm">
        <h3>Confirm Account Deletion</h3>
        <p>You are about to delete ${selectedIds.length} account(s).</p>
        ${currentView === 'student' ? '<p class="warning">⚠️ This will also delete all related student records (Object_6, Object_10, Object_29).</p>' : ''}
        <p>This action cannot be undone.</p>
        <p>Type <strong>DELETE</strong> to confirm:</p>
        <input type="text" id="delete-confirm-input" placeholder="Type DELETE to confirm">
        <div class="button-group">
          <button onclick="window.VESPAAccountManagement.confirmDelete()" class="danger">Delete Accounts</button>
          <button onclick="window.VESPAAccountManagement.closeModal()">Cancel</button>
        </div>
      </div>
    `;
    
    showModal('Confirm Deletion', confirmModal);
  }

  /**
   * Confirm and execute account deletion
   */
  function confirmDelete() {
    const confirmInput = document.getElementById('delete-confirm-input');
    if (!confirmInput || confirmInput.value !== 'DELETE') {
      showError('Please type DELETE to confirm');
      return;
    }
    
    const selectedIds = getSelectedAccountIds();
    closeModal();
    
    // Show loading state
    showLoadingModal('Deleting accounts...');
    
    $.ajax({
      url: `${API_BASE_URL}account/delete-accounts`,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        accountIds: selectedIds,
        accountType: currentView
      }),
      xhrFields: {
        withCredentials: true
      },
      success: function(response) {
        closeLoadingModal();
        
        if (response.success) {
          showSuccessModal(`Successfully deleted ${response.successCount} account(s)`, function() {
            loadAccountData(currentView);
          });
        } else {
          const errorMsg = response.errors && response.errors.length > 0 
            ? `Failed to delete some accounts: ${response.errors.join(', ')}`
            : 'Failed to delete accounts';
          showError(errorMsg);
        }
      },
      error: function(xhr, status, error) {
        closeLoadingModal();
        showError(`Failed to delete accounts: ${error}`);
      }
    });
  }

  /**
   * Show edit roles modal for staff
   */
  window.VESPAAccountManagement.editStaffRoles = function(staffId) {
    const staff = staffData.find(s => s.id === staffId);
    if (!staff) return;
    
    const currentRoles = Array.isArray(staff.field_73) ? staff.field_73 : (staff.field_73 ? [staff.field_73] : []);
    
    const modalContent = `
      <div style="padding: 20px;">
        <h4>Edit Roles for ${staff.field_69}</h4>
        <p>Select the roles for this staff member:</p>
        
        <div style="margin: 20px 0;">
          <label style="display: block; margin: 10px 0;">
            <input type="checkbox" id="role-profile_5" value="profile_5" ${currentRoles.includes('profile_5') ? 'checked' : ''}>
            Staff Admin
          </label>
          <label style="display: block; margin: 10px 0;">
            <input type="checkbox" id="role-profile_7" value="profile_7" ${currentRoles.includes('profile_7') ? 'checked' : ''}>
            Tutor
          </label>
          <label style="display: block; margin: 10px 0;">
            <input type="checkbox" id="role-profile_18" value="profile_18" ${currentRoles.includes('profile_18') ? 'checked' : ''}>
            Head of Year
          </label>
          <label style="display: block; margin: 10px 0;">
            <input type="checkbox" id="role-profile_25" value="profile_25" ${currentRoles.includes('profile_25') ? 'checked' : ''}>
            Head of Department
          </label>
          <label style="display: block; margin: 10px 0;">
            <input type="checkbox" id="role-profile_78" value="profile_78" ${currentRoles.includes('profile_78') ? 'checked' : ''}>
            Subject Teacher
          </label>
          <label style="display: block; margin: 10px 0;">
            <input type="checkbox" id="role-profile_8" value="profile_8" ${currentRoles.includes('profile_8') ? 'checked' : ''}>
            General Staff
          </label>
        </div>
        
        <div style="text-align: right; margin-top: 20px;">
          <button class="vespa-button secondary" onclick="window.VESPAAccountManagement.closeModal()">Cancel</button>
          <button class="vespa-button primary" onclick="window.VESPAAccountManagement.saveStaffRoles('${staffId}')">Save Roles</button>
        </div>
      </div>
    `;
    
    showModal('Edit Staff Roles', modalContent);
  }

  /**
   * Save staff roles
   */
  window.VESPAAccountManagement.saveStaffRoles = async function(staffId) {
    const newRoles = [];
    document.querySelectorAll('input[id^="role-"]:checked').forEach(cb => {
      newRoles.push(cb.value);
    });
    
    closeModal();
    await updateStaffRoles(staffId, newRoles);
  }

  /**
   * Update staff roles
   */
  async function updateStaffRoles(accountId, newRoles) {
    try {
      // newRoles now contains profile IDs like ['profile_5', 'profile_7']
      // Convert profile IDs to role names for the backend
      const roleNames = newRoles.map(profileId => ROLE_PROFILES[profileId] || profileId).filter(Boolean);
      
      const response = await $.ajax({
        url: `${API_BASE_URL}account/update-staff-roles`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          accountId: accountId,
          roles: roleNames // Send role names to backend
        }),
        xhrFields: { withCredentials: true }
      });

      if (response.success) {
        showSuccess('Staff roles updated successfully');
        // Refresh the data
        loadAccountData(currentView);
      } else {
        throw new Error(response.message || 'Failed to update roles');
      }
    } catch (error) {
      debugLog('Error updating staff roles:', error);
      showError(`Failed to update roles: ${error.message}`);
    }
  }

  /**
   * View linked accounts (students for staff, or staff for students)
   */
  async function viewLinkedAccounts(accountId, accountType) {
    try {
      const endpoint = accountType === 'staff' 
        ? `account/get-linked-students?staffId=${accountId}`
        : `account/get-linked-staff?studentId=${accountId}`;

      const response = await $.ajax({
        url: `${API_BASE_URL}${endpoint}`,
        type: 'GET',
        xhrFields: { withCredentials: true }
      });

      if (response.success) {
        if (accountType === 'staff') {
          showLinkedStudentsModal(accountId, response.students || []);
        } else {
          showLinkedStaffModal(accountId, response.staff || {});
        }
      } else {
        throw new Error(response.message || 'Failed to load linked accounts');
      }
    } catch (error) {
      debugLog('Error loading linked accounts:', error);
      showError(`Failed to load linked accounts: ${error.message}`);
    }
  }

  /**
   * Show modal with linked students for a staff member
   */
  function showLinkedStudentsModal(staffId, students) {
    const modalContent = `
      <div style="padding: 20px;">
        <p>Students linked to this staff member:</p>
        <div class="vespa-linked-students-list">
          ${students.length === 0 ? '<p>No students linked to this staff member.</p>' : ''}
          ${students.map(student => `
            <div class="vespa-student-link-item">
              <div><strong>${student.field_90 || 'Unknown'}</strong> (${student.field_3129 || 'No ULN'})</div>
              <div>Year ${student.field_548 || 'N/A'}, Group: ${student.field_565 || 'N/A'}</div>
              <div>Created: ${student.field_1265 ? new Date(student.field_1265).toLocaleDateString() : 'N/A'}</div>
              <div class="vespa-reallocation-controls">
                <button class="vespa-button secondary" onclick="window.VESPAAccountManagement.reallocateStudent('${student.id}', '${staffId}')">
                  Reallocate Student
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    showModal('Linked Students', modalContent);
  }

  /**
   * Show modal with linked staff for a student
   */
  function showLinkedStaffModal(studentId, staffData) {
    const modalContent = `
      <div style="padding: 20px;">
        <h4>Linked Staff Members</h4>
        
        <div style="margin-bottom: 20px;">
          <label><strong>Tutors:</strong></label>
          <input type="text" id="linked-tutors" value="${staffData.tutors || ''}" 
            style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;"
            placeholder="Enter tutor emails separated by commas">
        </div>
        
        <div style="margin-bottom: 20px;">
          <label><strong>Head of Year:</strong></label>
          <input type="text" id="linked-hoy" value="${staffData.headOfYear || ''}" 
            style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;"
            placeholder="Enter head of year email">
        </div>
        
        <div style="margin-bottom: 20px;">
          <label><strong>Subject Teachers:</strong></label>
          <input type="text" id="linked-teachers" value="${staffData.subjectTeachers || ''}" 
            style="width: 100%; padding: 8px; border: 1px solid #ced4da; border-radius: 4px;"
            placeholder="Enter teacher emails separated by commas">
        </div>
        
        <div style="text-align: right;">
          <button class="vespa-button secondary" onclick="window.closeModal()">Cancel</button>
          <button class="vespa-button primary" onclick="window.VESPAAccountManagement.updateLinkedStaff('${studentId}')" style="margin-left: 10px;">
            Save Changes
          </button>
        </div>
      </div>
    `;

    showModal('Edit Linked Staff', modalContent);
  }

  /**
   * Update linked staff for a student
   */
  async function updateLinkedStaff(studentId) {
    try {
      const tutors = document.getElementById('linked-tutors').value;
      const headOfYear = document.getElementById('linked-hoy').value;
      const subjectTeachers = document.getElementById('linked-teachers').value;

      const response = await $.ajax({
        url: `${API_BASE_URL}account/update-linked-staff`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          studentId: studentId,
          tutors: tutors,
          headOfYear: headOfYear,
          subjectTeachers: subjectTeachers
        }),
        xhrFields: { withCredentials: true }
      });

      if (response.success) {
        showSuccess('Linked staff updated successfully');
        closeModal();
      } else {
        throw new Error(response.message || 'Failed to update linked staff');
      }
    } catch (error) {
      debugLog('Error updating linked staff:', error);
      showError(`Failed to update linked staff: ${error.message}`);
    }
  }

  /**
   * Reallocate a student to different staff
   */
  async function reallocateStudent(studentId, currentStaffId) {
    // This would show a modal to select new staff and reallocate
    showError('Student reallocation feature coming soon');
  }

  /**
   * Edit student activities
   */
  async function editStudentActivities(studentId) {
    try {
      // Load student's current activities
      const response = await $.ajax({
        url: `${API_BASE_URL}account/get-student-activities?studentId=${studentId}`,
        type: 'GET',
        xhrFields: { withCredentials: true }
      });

      if (response.success) {
        showActivitiesModal(studentId, response.activities || [], response.allActivities || []);
      } else {
        throw new Error(response.message || 'Failed to load activities');
      }
    } catch (error) {
      debugLog('Error loading student activities:', error);
      showError(`Failed to load activities: ${error.message}`);
    }
  }

  /**
   * Show activities modal
   */
  function showActivitiesModal(studentId, currentActivities, allActivities) {
    // Group activities by category
    const activitiesByCategory = {};
    Object.keys(VESPA_CATEGORIES).forEach(cat => {
      activitiesByCategory[cat] = [];
    });

    allActivities.forEach(activity => {
      const category = activity.field_1294; // Category field
      if (activitiesByCategory[category]) {
        activitiesByCategory[category].push(activity);
      }
    });

    const modalContent = `
      <div style="padding: 20px;">
        <h4>Edit VESPA Activities</h4>
        <p>Select activities for this student:</p>
        
        <div class="vespa-activity-grid">
          ${Object.entries(VESPA_CATEGORIES).map(([key, config]) => `
            <div class="vespa-activity-category" style="border-color: ${config.color};">
              <h4 style="color: ${config.color};">
                <span style="background: ${config.color}; color: white; padding: 2px 8px; border-radius: 4px;">
                  ${config.name}
                </span>
              </h4>
              ${activitiesByCategory[key].map(activity => `
                <div class="vespa-activity-item">
                  <input type="checkbox" class="vespa-activity-checkbox" 
                    value="${activity.id}" 
                    ${currentActivities.includes(activity.id) ? 'checked' : ''}>
                  <label>${activity.field_1278}</label>
                  <span class="vespa-activity-level">Level ${activity.field_1295}</span>
                </div>
              `).join('')}
            </div>
          `).join('')}
        </div>
        
        <div style="margin-top: 20px; text-align: right;">
          <button class="vespa-button secondary" onclick="window.closeModal()">Cancel</button>
          <button class="vespa-button primary" onclick="window.VESPAAccountManagement.saveActivities('${studentId}')" style="margin-left: 10px;">
            Save Activities
          </button>
        </div>
      </div>
    `;

    showModal('Student Activities', modalContent);
  }

  /**
   * Save student activities
   */
  async function saveActivities(studentId) {
    try {
      const selectedActivities = [];
      document.querySelectorAll('.vespa-activity-checkbox:checked').forEach(cb => {
        selectedActivities.push(cb.value);
      });

      const response = await $.ajax({
        url: `${API_BASE_URL}account/update-student-activities`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          studentId: studentId,
          activities: selectedActivities
        }),
        xhrFields: { withCredentials: true }
      });

      if (response.success) {
        showSuccess('Student activities updated successfully');
        closeModal();
      } else {
        throw new Error(response.message || 'Failed to update activities');
      }
    } catch (error) {
      debugLog('Error updating activities:', error);
      showError(`Failed to update activities: ${error.message}`);
    }
  }

  /**
   * Refresh current data
   */
  function refreshData() {
    loadAccountData(currentView);
  }

  /**
   * Debounce helper
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Format date helper
   */
  function formatDate(dateObj) {
    if (typeof dateObj === 'string') {
      return new Date(dateObj).toLocaleDateString();
    } else if (dateObj && dateObj.date_formatted) {
      return dateObj.date_formatted;
    } else if (dateObj && dateObj.timestamp) {
      return dateObj.timestamp;
    }
    return 'N/A';
  }

  /**
   * Get selected account IDs from the table
   */
  function getSelectedAccountIds() {
    const selectedIds = [];
    document.querySelectorAll('.row-checkbox:checked').forEach(cb => {
      selectedIds.push(cb.value);
    });
    return selectedIds;
  }

  /**
   * Show loading modal
   */
  function showLoadingModal(message) {
    const modal = `
      <div class="vespa-am-loading-modal" style="text-align: center; padding: 20px;">
        <div class="spinner"></div>
        <p>${message}</p>
      </div>
    `;
    showModal('Processing...', modal);
  }

  /**
   * Close loading modal
   */
  function closeLoadingModal() {
    closeModal();
  }

  /**
   * Show success modal
   */
  function showSuccessModal(message, callback) {
    const modal = `
      <div class="vespa-am-success-modal" style="text-align: center; padding: 20px;">
        <div class="success-icon" style="font-size: 48px; color: #28a745;">✓</div>
        <h3>Success!</h3>
        <p>${message}</p>
        <button class="vespa-button primary" onclick="window.VESPAAccountManagement.closeSuccessModal()">OK</button>
      </div>
    `;
    showModal('Success', modal);
    
    // Store callback for when modal is closed
    window.VESPAAccountManagement._successCallback = callback;
  }

  /**
   * Close success modal
   */
  function closeSuccessModal() {
    closeModal();
    if (window.VESPAAccountManagement._successCallback) {
      window.VESPAAccountManagement._successCallback();
      delete window.VESPAAccountManagement._successCallback;
    }
  }

  /**
   * Get the current customer ID from context
   */
  function getCustomerId() {
    // For super users with school selection
    if (window.selectedSchool && window.selectedSchool.id) {
      return window.selectedSchool.id;
    }
    
    // For regular users
    if (window.userContext && window.userContext.customerId) {
      return window.userContext.customerId;
    }
    
    debugLog('No customer ID found in context');
    return null;
  }

  // Initialize the module when the script loads
  initialize();

})();

