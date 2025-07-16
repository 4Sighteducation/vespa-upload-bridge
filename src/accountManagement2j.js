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
  let API_BASE_URL = window.API_BASE_URL || 'https://vespa-upload-api-07e11c285370.herokuapp.com/api/';

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
    
    // Enable debug mode for troubleshooting
    window.DEBUG_MODE = true;

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
      getSelectedAccountIds: getSelectedAccountIds,
      
      // Additional functions that were being added later
      editStaffRoles: editStaffRoles,
      saveStaffRoles: saveStaffRoles,
      syncStaffAdminConnections: syncStaffAdminConnections,
      handleStaffAdminToggle: handleStaffAdminToggle
    };

    debugLog('Account Management module initialized');
  }

  /**
   * Load DataTables assets
   */
  function loadDataTablesAssets() {
    debugLog("Loading DataTables assets...");
    
    // Add modern DataTables CSS
    const dtCss = document.createElement('link');
    dtCss.rel = 'stylesheet';
    dtCss.href = 'https://cdn.datatables.net/1.13.7/css/jquery.dataTables.min.css';
    document.head.appendChild(dtCss);
    debugLog("Added DataTables CSS");
    
    // Add DataTables Buttons CSS
    const buttonsCss = document.createElement('link');
    buttonsCss.rel = 'stylesheet';
    buttonsCss.href = 'https://cdn.datatables.net/buttons/2.4.2/css/buttons.dataTables.min.css';
    document.head.appendChild(buttonsCss);
    debugLog("Added DataTables Buttons CSS");
    
    // Wait a bit for Knack to finish initializing jQuery
    setTimeout(() => {
      debugLog("Attempting to load DataTables scripts after delay...");
      loadDataTablesScripts();
    }, 1000); // 1 second delay to ensure jQuery is ready
  }
  
  function loadDataTablesScripts() {
    // In Knack, jQuery is available as $ globally
    debugLog("Loading DataTables scripts...");
    debugLog("jQuery available as $:", typeof $ !== 'undefined');
    debugLog("jQuery available as jQuery:", typeof jQuery !== 'undefined');
    
    // Ensure jQuery is available globally for DataTables
    if (typeof $ !== 'undefined' && typeof jQuery === 'undefined') {
      window.jQuery = $;
      debugLog("Assigned $ to window.jQuery for DataTables compatibility");
    }
    
    // Ensure jQuery is available
    if (typeof $ === 'undefined' && typeof jQuery === 'undefined') {
      debugLog("jQuery still not available, retrying in 1 second...", null, 'warn');
      setTimeout(loadDataTablesScripts, 1000);
      return;
    }
    
    // Use whichever jQuery reference is available
    const jq = window.jQuery || window.$;
    if (!jq) {
      debugLog("No jQuery reference found!", null, 'error');
      return;
    }
    
    debugLog("jQuery version:", jq.fn ? jq.fn.jquery : "unknown");
    
    // Load DataTables core
    const dtScript = document.createElement('script');
    dtScript.src = 'https://cdn.datatables.net/1.13.7/js/jquery.dataTables.min.js';
    dtScript.onload = () => {
      debugLog("DataTables core loaded successfully");
      
      // Load DataTables Buttons extension
      const buttonsScript = document.createElement('script');
      buttonsScript.src = 'https://cdn.datatables.net/buttons/2.4.2/js/dataTables.buttons.min.js';
      buttonsScript.onload = () => {
        debugLog("DataTables Buttons loaded");
        
        // Load export buttons
        const printScript = document.createElement('script');
        printScript.src = 'https://cdn.datatables.net/buttons/2.4.2/js/buttons.print.min.js';
        printScript.onload = () => {
          debugLog("Print button loaded");
        };
        document.head.appendChild(printScript);
        
        const html5Script = document.createElement('script');
        html5Script.src = 'https://cdn.datatables.net/buttons/2.4.2/js/buttons.html5.min.js';
        html5Script.onload = () => {
          debugLog("HTML5 buttons loaded");
        };
        document.head.appendChild(html5Script);
        
        // Load JSZip for Excel export
        const jszipScript = document.createElement('script');
        jszipScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        jszipScript.onload = () => {
          debugLog("JSZip loaded");
        };
        document.head.appendChild(jszipScript);
      };
      document.head.appendChild(buttonsScript);
    };
    document.head.appendChild(dtScript);
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
      /* Modern, professional Account Management styles */
      .vespa-account-management {
        padding: 20px;
        max-width: 100%;
        margin: 0 auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        color: #2c3e50;
      }
      
      /* Hide DataTables search box since we have our own */
      .dataTables_filter {
        display: none !important;
      }
      
      /* Make sure the length selector stays visible */
      .dataTables_length {
        display: block !important;
        float: left;
      }
      
      /* Clear the wrapper after length selector */
      .dataTables_wrapper::after {
        content: "";
        display: table;
        clear: both;
      }

      .vespa-am-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 1px solid #e1e4e8;
      }

      .vespa-am-header h2 {
        font-size: 24px;
        font-weight: 600;
        color: #1a202c;
        margin: 0;
      }

      .vespa-am-tabs {
        display: flex;
        gap: 0;
        margin-bottom: 24px;
        border-bottom: 1px solid #e1e4e8;
      }

      .vespa-am-tab {
        padding: 12px 24px;
        background: transparent;
        border: none;
        border-bottom: 3px solid transparent;
        cursor: pointer;
        transition: all 0.2s;
        color: #64748b;
        font-weight: 500;
        font-size: 14px;
      }

      .vespa-am-tab:hover {
        color: #1e40af;
        background: #f8fafc;
      }

      .vespa-am-tab.active {
        color: #1e40af;
        border-bottom-color: #1e40af;
        background: transparent;
      }

      .vespa-am-filters {
        display: flex;
        gap: 12px;
        margin-bottom: 20px;
        padding: 16px;
        background: #f8fafc;
        border-radius: 6px;
        border: 1px solid #e1e4e8;
      }

      .vespa-am-filter-group {
        flex: 1;
        min-width: 0;
      }

      .vespa-am-filter-group label {
        display: block;
        font-size: 12px;
        font-weight: 600;
        color: #64748b;
        margin-bottom: 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .vespa-am-filter-group input,
      .vespa-am-filter-group select {
        width: 100%;
        padding: 6px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        font-size: 13px;
        color: #1a202c;
        background: white;
        transition: all 0.2s;
      }

      .vespa-am-filter-group input:focus,
      .vespa-am-filter-group select:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }

      .vespa-am-actions {
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
        padding: 12px;
        background: white;
        border-radius: 6px;
        border: 1px solid #e1e4e8;
        flex-wrap: wrap;
      }

      .vespa-am-actions .vespa-button {
        padding: 6px 12px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 4px;
        transition: all 0.2s;
      }

      .vespa-am-actions .vespa-button.primary {
        background: #3b82f6;
        color: white;
        border: 1px solid #3b82f6;
      }

      .vespa-am-actions .vespa-button.primary:hover {
        background: #2563eb;
        border-color: #2563eb;
      }
      
      /* Different button colors */
      .vespa-am-actions .vespa-button.reset-password {
        background: #f59e0b;
        color: white;
        border: 1px solid #f59e0b;
      }
      
      .vespa-am-actions .vespa-button.reset-password:hover {
        background: #d97706;
        border-color: #d97706;
      }
      
      .vespa-am-actions .vespa-button.resend-email {
        background: #10b981;
        color: white;
        border: 1px solid #10b981;
      }
      
      .vespa-am-actions .vespa-button.resend-email:hover {
        background: #059669;
        border-color: #059669;
      }

      .vespa-am-actions .vespa-button.secondary {
        background: white;
        color: #64748b;
        border: 1px solid #cbd5e1;
      }

      .vespa-am-actions .vespa-button.secondary:hover {
        background: #f8fafc;
        color: #475569;
        border-color: #94a3b8;
      }

      .vespa-am-actions .vespa-button[style*="background: #dc3545"] {
        background: #ef4444 !important;
        border: 1px solid #ef4444;
      }

      .vespa-am-actions .vespa-button[style*="background: #dc3545"]:hover {
        background: #dc2626 !important;
        border-color: #dc2626;
      }

      /* DataTable container */
      .vespa-am-table-container {
        background: white;
        border: 1px solid #e1e4e8;
        border-radius: 6px;
        overflow: hidden;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      }

      /* Override DataTables styles for modern look */
      .vespa-am-table {
        width: 100% !important;
        border-collapse: separate !important;
        border-spacing: 0 !important;
        font-size: 13px !important;
      }

      table.dataTable {
        margin: 0 !important;
      }

      .dataTables_wrapper {
        padding: 16px !important;
      }

      .dataTables_length,
      .dataTables_filter {
        margin-bottom: 16px !important;
      }

      .dataTables_length select,
      .dataTables_filter input {
        padding: 4px 8px !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 4px !important;
        font-size: 13px !important;
      }

      .dataTables_filter input {
        width: 200px !important;
        margin-left: 8px !important;
      }

      /* Table header */
      table.dataTable thead th {
        background: #f8fafc !important;
        padding: 10px 20px 10px 12px !important;
        font-size: 12px !important;
        font-weight: 600 !important;
        color: #64748b !important;
        text-transform: uppercase !important;
        letter-spacing: 0.5px !important;
        border-bottom: 1px solid #e1e4e8 !important;
        cursor: pointer !important;
        position: relative !important;
        white-space: nowrap !important;
      }
      
      /* No sorting on checkbox column */
      table.dataTable thead th.no-sort {
        cursor: default !important;
        padding-right: 12px !important;
      }
      
      table.dataTable thead th.no-sort:after {
        display: none !important;
      }

      table.dataTable thead th:hover {
        background: #f1f5f9 !important;
      }

      /* Sorting indicators with better visibility */
      table.dataTable thead .sorting,
      table.dataTable thead .sorting_asc,
      table.dataTable thead .sorting_desc {
        padding-right: 25px !important;
      }
      
      table.dataTable thead .sorting:after,
      table.dataTable thead .sorting_asc:after,
      table.dataTable thead .sorting_desc:after {
        position: absolute !important;
        right: 8px !important;
        top: 50% !important;
        transform: translateY(-50%) !important;
        font-size: 14px !important;
        opacity: 0.6 !important;
        color: #64748b !important;
      }

      table.dataTable thead .sorting:after {
        content: "⇅" !important;
        color: #94a3b8 !important;
      }

      table.dataTable thead .sorting_asc:after {
        content: "▲" !important;
        opacity: 1 !important;
        color: #3b82f6 !important;
      }

      table.dataTable thead .sorting_desc:after {
        content: "▼" !important;
        opacity: 1 !important;
        color: #3b82f6 !important;
      }

      /* Table body */
      table.dataTable tbody td {
        padding: 8px 12px !important;
        font-size: 13px !important;
        color: #1a202c !important;
        border-bottom: 1px solid #f1f5f9 !important;
        vertical-align: middle !important;
      }

      table.dataTable tbody tr {
        transition: background-color 0.1s !important;
      }

      table.dataTable tbody tr:hover {
        background-color: #f8fafc !important;
      }

      table.dataTable tbody tr:last-child td {
        border-bottom: none !important;
      }

      /* Checkbox styling */
      .vespa-am-checkbox {
        width: 16px !important;
        height: 16px !important;
        cursor: pointer;
        accent-color: #3b82f6;
      }

      /* Role badges */
      .vespa-am-role-display {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      
      .vespa-am-role-badge {
        display: inline-block;
        padding: 2px 8px;
        background: #e0f2fe;
        color: #0369a1;
        border-radius: 3px;
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
      }

      /* Action buttons */
      .vespa-am-link-button {
        padding: 4px 8px;
        background: #64748b;
        color: white;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 500;
        margin: 1px;
        transition: all 0.2s;
        white-space: nowrap;
      }

      .vespa-am-link-button:hover {
        background: #475569;
        transform: translateY(-1px);
      }

      .vespa-am-link-button[style*="background: #17a2b8"] {
        background: #0891b2 !important;
      }

      .vespa-am-link-button[style*="background: #17a2b8"]:hover {
        background: #0e7490 !important;
      }

      /* Empty state */
      .vespa-am-empty {
        text-align: center;
        padding: 48px;
        color: #94a3b8;
      }

      /* Loading state */
      .vespa-am-loading {
        text-align: center;
        padding: 48px;
        color: #64748b;
      }

      .vespa-spinner {
        display: inline-block;
        width: 32px;
        height: 32px;
        border: 3px solid #e1e4e8;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: vespa-spin 1s linear infinite;
      }

      @keyframes vespa-spin {
        to { transform: rotate(360deg); }
      }

      /* Pagination */
      .dataTables_paginate {
        margin-top: 16px !important;
      }

      .paginate_button {
        padding: 4px 8px !important;
        margin: 0 2px !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 3px !important;
        background: white !important;
        color: #64748b !important;
        font-size: 12px !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
      }

      .paginate_button:hover {
        background: #f8fafc !important;
        border-color: #94a3b8 !important;
        color: #475569 !important;
      }

      .paginate_button.current {
        background: #3b82f6 !important;
        border-color: #3b82f6 !important;
        color: white !important;
      }

      .paginate_button.disabled {
        opacity: 0.5 !important;
        cursor: not-allowed !important;
      }

      /* DataTables info text */
      .dataTables_info {
        font-size: 12px !important;
        color: #64748b !important;
        margin-top: 16px !important;
      }

      /* Export buttons */
      .dt-buttons {
        margin-bottom: 16px !important;
      }
      
      .dt-button {
        padding: 6px 12px !important;
        background: white !important;
        color: #64748b !important;
        border: 1px solid #cbd5e1 !important;
        border-radius: 4px !important;
        margin-right: 6px !important;
        font-size: 12px !important;
        font-weight: 500 !important;
        cursor: pointer !important;
        transition: all 0.2s !important;
      }
      
      .dt-button:hover {
        background: #f8fafc !important;
        color: #475569 !important;
        border-color: #94a3b8 !important;
      }

      /* Modal improvements */
      .vespa-modal {
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
      }

      .vespa-modal-header {
        background: #f8fafc;
        border-bottom: 1px solid #e1e4e8;
      }

      .vespa-modal-title {
        font-size: 16px !important;
        font-weight: 600 !important;
        color: #1a202c !important;
      }

      /* Responsive adjustments */
      @media (max-width: 768px) {
        .vespa-am-filters {
          flex-direction: column;
        }
        
        .vespa-am-actions {
          flex-direction: column;
        }
        
        .vespa-am-actions .vespa-button {
          width: 100%;
        }
        
        .dataTables_length,
        .dataTables_filter {
          width: 100%;
          text-align: left !important;
        }
        
        .dataTables_filter input {
          width: 100% !important;
          margin-top: 8px !important;
          margin-left: 0 !important;
        }
      }

      /* Fix select all alignment */
      #am-select-all {
        margin-right: 8px;
        vertical-align: middle;
      }

      /* Improve table density */
      table.dataTable.compact thead th,
      table.dataTable.compact tbody td {
        padding: 6px 10px !important;
      }

      /* No footer line */
      table.dataTable.no-footer {
        border-bottom: none !important;
      }

      /* Activity and Student Management Styles */
      .vespa-activity-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        gap: 16px;
        margin-top: 20px;
      }

      .vespa-activity-category {
        border: 1px solid #e1e4e8;
        border-radius: 6px;
        padding: 16px;
        background: #f8fafc;
      }

      .vespa-activity-category h4 {
        margin-top: 0;
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 600;
      }

      .vespa-activity-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 8px;
        margin-bottom: 4px;
        background: white;
        border-radius: 4px;
        border: 1px solid #e1e4e8;
        transition: all 0.2s;
      }

      .vespa-activity-item:hover {
        background: #f0f9ff;
        border-color: #3b82f6;
      }

      .vespa-activity-checkbox {
        width: 18px;
        height: 18px;
        accent-color: #3b82f6;
      }

      .vespa-activity-item label {
        flex: 1;
        font-size: 13px;
        cursor: pointer;
      }

      .vespa-activity-level {
        padding: 2px 6px;
        background: #e1e4e8;
        border-radius: 3px;
        font-size: 11px;
        font-weight: 500;
        color: #64748b;
      }

      .vespa-linked-students-list {
        max-height: 400px;
        overflow-y: auto;
        padding-right: 8px;
      }

      .vespa-linked-students-list::-webkit-scrollbar {
        width: 6px;
      }

      .vespa-linked-students-list::-webkit-scrollbar-track {
        background: #f1f5f9;
        border-radius: 3px;
      }

      .vespa-linked-students-list::-webkit-scrollbar-thumb {
        background: #cbd5e1;
        border-radius: 3px;
      }

      .vespa-linked-students-list::-webkit-scrollbar-thumb:hover {
        background: #94a3b8;
      }

      .vespa-student-link-item {
        padding: 12px;
        border: 1px solid #e1e4e8;
        border-radius: 4px;
        margin-bottom: 8px;
        background: white;
        transition: all 0.2s;
      }

      .vespa-student-link-item:hover {
        background: #f8fafc;
        border-color: #cbd5e1;
      }

      .vespa-student-link-item > div {
        margin-bottom: 4px;
        font-size: 13px;
      }

      .vespa-student-link-item strong {
        color: #1a202c;
        font-weight: 600;
      }

      .vespa-reallocation-controls {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }

      /* Modal content improvements */
      .vespa-modal-body {
        font-size: 14px;
      }

      .vespa-modal-body h4 {
        font-size: 16px;
        font-weight: 600;
        color: #1a202c;
        margin-bottom: 16px;
      }

      .vespa-modal-body input[type="text"],
      .vespa-modal-body select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        font-size: 13px;
        margin-top: 4px;
      }

      .vespa-modal-body label {
        display: block;
        font-weight: 600;
        color: #64748b;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 20px;
      }

      /* Success/Error/Loading modals */
      .vespa-am-delete-confirm {
        padding: 20px;
      }

      .vespa-am-delete-confirm h3 {
        color: #dc2626;
        margin-bottom: 16px;
      }

      .vespa-am-delete-confirm p {
        margin-bottom: 12px;
        line-height: 1.6;
      }

      .vespa-am-delete-confirm .warning {
        background: #fef2f2;
        color: #991b1b;
        padding: 12px;
        border-radius: 4px;
        border-left: 4px solid #dc2626;
        margin-bottom: 16px;
      }

      .vespa-am-delete-confirm input[type="text"] {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #cbd5e1;
        border-radius: 4px;
        font-size: 14px;
        margin-bottom: 16px;
      }

      .vespa-am-delete-confirm .button-group {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .vespa-am-delete-confirm .danger {
        background: #dc2626;
        color: white;
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-weight: 500;
        cursor: pointer;
      }

      .vespa-am-delete-confirm .danger:hover {
        background: #b91c1c;
      }

      .vespa-am-loading-modal,
      .vespa-am-success-modal {
        text-align: center;
        padding: 32px;
      }

      .success-icon {
        font-size: 48px;
        color: #22c55e;
        margin-bottom: 16px;
      }

      /* Staff admin warning */
      #staff-admin-warning {
        background: #fef3c7;
        border: 1px solid #fcd34d;
        padding: 10px;
        margin: 0 0 10px 25px;
        border-radius: 4px;
        font-size: 13px;
      }

      #staff-admin-warning strong {
        color: #92400e;
      }
      
      /* Inline editing styles */
      .vespa-editable {
        cursor: pointer;
        position: relative;
        padding: 2px 4px;
        border-radius: 3px;
        transition: background-color 0.2s;
      }
      
      .vespa-editable:hover {
        background-color: #f0f7ff;
        outline: 1px dashed #3b82f6;
      }
      
      .vespa-editable.editing {
        padding: 0;
      }
      
      .vespa-editable input {
        width: 100%;
        padding: 6px 8px;
        border: 2px solid #3b82f6;
        border-radius: 3px;
        font-size: 13px;
        font-family: inherit;
        background: white;
      }
      
      .vespa-editable input:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
      
      .vespa-edit-indicator {
        position: absolute;
        right: -20px;
        top: 50%;
        transform: translateY(-50%);
        font-size: 11px;
        color: #3b82f6;
        opacity: 0;
        transition: opacity 0.2s;
        pointer-events: none;
      }
      
      .vespa-editable:hover .vespa-edit-indicator {
        opacity: 1;
      }

      /* Content area styles */
      #vespa-am-content {
        min-height: 400px;
        position: relative;
      }

      /* Table container styles */
      #staff-table-container,
      #student-table-container {
        width: 100%;
        overflow: visible;
      }

      /* Loading state */
      .vespa-am-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        text-align: center;
      }

      .vespa-am-loading .vespa-spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f3f3;
        border-top: 4px solid #1e40af;
        border-radius: 50%;
        animation: vespa-am-spin 1s linear infinite;
        margin-bottom: 16px;
      }

      @keyframes vespa-am-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }

      .vespa-am-loading p {
        color: #64748b;
        font-size: 14px;
        margin: 0;
      }

      /* Empty state */
      .vespa-am-empty {
        padding: 60px 20px;
        text-align: center;
        color: #64748b;
        font-size: 16px;
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
    console.log('[VESPA AM] Starting showAccountManagement function');

    // Hide the main wizard if it exists
    const wizard = document.getElementById('vespa-upload-wizard');
    if (wizard) {
      wizard.style.display = 'none';
      console.log('[VESPA AM] Wizard hidden');
    }

    // Get the main container - try multiple selectors
    let container = null;
    
    // First try the VESPA_UPLOAD_CONFIG selector
    if (window.VESPA_UPLOAD_CONFIG?.elementSelector) {
      container = document.querySelector(window.VESPA_UPLOAD_CONFIG.elementSelector);
      debugLog('Trying VESPA_UPLOAD_CONFIG selector:', window.VESPA_UPLOAD_CONFIG.elementSelector);
      console.log('[VESPA AM] Trying selector:', window.VESPA_UPLOAD_CONFIG.elementSelector, 'Found:', !!container);
    }
    
    // Fallback to common Knack containers
    if (!container) {
      const selectors = [
        '#vespa-container',
        '.kn-content',
        '#knack-body',
        '#knack-dist_1',
        '.kn-scene',
        '#kn-content', // Another common Knack selector
        '.kn-container'
      ];
      
      for (const selector of selectors) {
        container = document.querySelector(selector);
        if (container) {
          debugLog('Found container with selector:', selector);
          console.log('[VESPA AM] Found container with fallback selector:', selector);
          break;
        }
      }
    }
    
    if (!container) {
      const allDivs = document.querySelectorAll('div');
      console.error('[VESPA AM] No container found! Total divs on page:', allDivs.length);
      console.error('[VESPA AM] Available IDs:', Array.from(allDivs).filter(d => d.id).map(d => d.id).slice(0, 20));
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
    console.log('[VESPA AM] Account Management appended to DOM');
    
    // Force visibility
    amContainer.style.display = 'block';
    amContainer.style.visibility = 'visible';
    amContainer.style.opacity = '1';
    
    // Check if it's actually visible
    setTimeout(() => {
      const rect = amContainer.getBoundingClientRect();
      console.log('[VESPA AM] Account Management visibility check:', {
        displayed: amContainer.style.display,
        visibility: amContainer.style.visibility,
        opacity: amContainer.style.opacity,
        rect: rect,
        isVisible: rect.width > 0 && rect.height > 0,
        offsetParent: amContainer.offsetParent !== null
      });
    }, 100);

    // Bind events
    try {
      bindInterfaceEvents();
      debugLog('Bound interface events');
    } catch (error) {
      debugLog('Error binding events:', error);
    }

    // Load initial data
    debugLog('Loading initial staff data');
    console.log('[VESPA AM] About to load initial staff data');
    
    // Ensure student-only actions are hidden initially (since we start with staff view)
    const studentOnlyActions = document.querySelectorAll('.student-only-action');
    studentOnlyActions.forEach(btn => btn.style.display = 'none');
    
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
          <label>Search</label>
          <input type="text" id="am-search" placeholder="Search by name or email...">
        </div>
        <div class="vespa-am-filter-group" id="year-filter-group">
          <label>Year Group</label>
          <select id="am-filter-year">
            <option value="">All Years</option>
            <option value="9">Year 9</option>
            <option value="10">Year 10</option>
            <option value="11">Year 11</option>
            <option value="12">Year 12</option>
            <option value="13">Year 13</option>
          </select>
        </div>
        <div class="vespa-am-filter-group">
          <label>Group</label>
          <select id="am-filter-group">
            <option value="">All Groups</option>
          </select>
        </div>
        <div class="vespa-am-filter-group" id="role-filter-group" style="display: none;">
          <label>User Role</label>
          <select id="am-filter-role">
            <option value="">All Roles</option>
            <option value="Staff Admin">Staff Admin</option>
            <option value="Tutor">Tutor</option>
            <option value="Head of Year">Head of Year</option>
            <option value="Head of Dept">Head of Department</option>
            <option value="Subject Teacher">Subject Teacher</option>
            <option value="General Staff">General Staff</option>
            <option value="No Role">No Role Assigned</option>
          </select>
        </div>
      </div>

      <div class="vespa-am-actions">
        <button class="vespa-button secondary" onclick="window.VESPAAccountManagement.toggleSelectAll()">
          <input type="checkbox" id="am-select-all">
          Select All
        </button>
        <button class="vespa-button primary reset-password" onclick="window.VESPAAccountManagement.resetPasswords()">
          🔑 Reset Password(s)
        </button>
        <button class="vespa-button primary resend-email" onclick="window.VESPAAccountManagement.resendWelcomeEmails()">
          ✉️ Resend Welcome Email(s)
        </button>
        <button class="vespa-button secondary student-only-action" onclick="window.moveUpYearGroup()" 
          style="display: none;">
          🎓 Move Up Yr Gp
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
    const roleFilter = document.getElementById('role-filter-group');
    const yearFilter = document.getElementById('year-filter-group');
    
    // Update student-only actions visibility
    const studentOnlyActions = document.querySelectorAll('.student-only-action');
    
    if (view === 'staff') {
      roleFilter.style.display = 'block';
      yearFilter.style.display = 'none';
      // Hide student-only actions
      studentOnlyActions.forEach(btn => btn.style.display = 'none');
    } else {
      roleFilter.style.display = 'none';
      yearFilter.style.display = 'block';
      // Show student-only actions
      studentOnlyActions.forEach(btn => btn.style.display = 'inline-block');
    }

    // Clear filters
    document.getElementById('am-search').value = '';
    document.getElementById('am-filter-year').value = '';
    document.getElementById('am-filter-group').value = '';
    document.getElementById('am-filter-role').value = '';
    
    // Clear group dropdown options (will be repopulated when data loads)
    const groupSelect = document.getElementById('am-filter-group');
    if (groupSelect) {
      groupSelect.innerHTML = '<option value="">All Groups</option>';
    }

    // Reset select all
    document.getElementById('am-select-all').checked = false;

    // Clear any existing custom search functions
    $.fn.dataTable.ext.search = [];

    // Destroy existing DataTable if it exists
    if (staffDataTable) {
      staffDataTable.destroy();
      staffDataTable = null;
    }
    if (studentDataTable) {
      studentDataTable.destroy();
      studentDataTable = null;
    }

    // Load data for the selected view
    loadAccountData(view);
  }

  /**
   * Load account data (staff or students)
   */
  function loadAccountData(type) {
    debugLog(`Loading ${type} accounts`);
    console.log(`[VESPA AM] loadAccountData called for type: ${type}`);
    currentView = type;
    
    const customerId = getCustomerId();
    console.log('[VESPA AM] Customer ID result:', customerId);
    
    // Allow loading even without customerId if we have a user session
    // The backend can determine the customer from session
    if (!customerId && !window.userContext?.userId) {
      console.error('[VESPA AM] No customer ID and no user context');
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
    
    // Build request data - include customerId if we have one, otherwise include userEmail
    const requestData = {};
    if (customerId) {
      requestData.customerId = customerId;
    } else if (window.userContext && window.userContext.userEmail) {
      // For regular staff admins, pass email so backend can look up their customer
      requestData.userEmail = window.userContext.userEmail;
      debugLog('Passing user email for customer lookup', { email: window.userContext.userEmail });
    }
    
    console.log(`[VESPA AM] Making API call to ${API_BASE_URL}account/${endpoint} with data:`, requestData);
    
    $.ajax({
      url: `${API_BASE_URL}account/${endpoint}`,
      type: 'GET',
      data: requestData,
      xhrFields: {
        withCredentials: true
      },
      success: function(response) {
        debugLog(`${type} accounts loaded:`, response);
        console.log(`[VESPA AM] Successfully loaded ${type} data:`, response);
        
        if (response.success && response.data) {
          debugLog(`Calling displayAccounts with ${response.data.length} records`);
          displayAccounts(response.data, type);
        } else {
          debugLog('Response not successful or no data');
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
    debugLog(`displayAccounts called with type: ${type}, accounts:`, accounts);
    const contentArea = document.getElementById('vespa-am-content');
    
    if (!contentArea) {
      debugLog('ERROR: vespa-am-content not found in displayAccounts');
      return;
    }
    
    if (!accounts || accounts.length === 0) {
      debugLog(`No ${type} accounts found, showing empty state`);
      contentArea.innerHTML = `
        <div class="vespa-am-empty">
          <p>No ${type} accounts found</p>
        </div>
      `;
      return;
    }
    
    debugLog(`Storing ${accounts.length} ${type} records`);
    // Store current data
    if (type === 'staff') {
      staffData = accounts;
    } else {
      studentData = accounts;
    }
    
    // Populate group dropdown with unique groups
    populateGroupDropdown(accounts);
    
    // Create the table container based on type
    debugLog(`Creating ${type}-table-container in content area`);
    contentArea.innerHTML = `<div id="${type}-table-container"></div>`;
    
    // Build table based on type
    debugLog(`Calling display${type.charAt(0).toUpperCase() + type.slice(1)}Table`);
    if (type === 'staff') {
      displayStaffTable(accounts);
    } else {
      displayStudentTable(accounts);
    }
  }
  
  /**
   * Populate group dropdown with unique groups from data
   */
  function populateGroupDropdown(accounts) {
    const groupSelect = document.getElementById('am-filter-group');
    if (!groupSelect) return;
    
    // Get unique groups
    const groups = new Set();
    accounts.forEach(account => {
      const group = account.field_708;
      if (group && group !== 'N/A') {
        groups.add(group);
      }
    });
    
    // Sort groups
    const sortedGroups = Array.from(groups).sort();
    
    // Clear existing options except the first one
    groupSelect.innerHTML = '<option value="">All Groups</option>';
    
    // Add group options
    sortedGroups.forEach(group => {
      const option = document.createElement('option');
      option.value = group;
      option.textContent = group;
      groupSelect.appendChild(option);
    });
    
    debugLog(`Populated group dropdown with ${sortedGroups.length} groups`);
  }

  /**
   * Display staff table
   */
  function displayStaffTable(accounts) {
    debugLog("displayStaffTable called with " + accounts.length + " records");
    
    const tableContainer = document.getElementById('staff-table-container');
    if (!tableContainer) {
      debugLog("staff-table-container not found in DOM", null, 'error');
      return;
    }
    
    if (accounts.length === 0) {
      tableContainer.innerHTML = `
        <div class="vespa-am-empty">
          <p>No staff accounts found</p>
        </div>
      `;
      return;
    }

    tableContainer.innerHTML = `
      <div class="vespa-am-table-container">
        <table id="staff-datatable" class="vespa-am-table display compact">
          <thead>
            <tr>
              <th class="no-sort" style="width: 30px;">
                <input type="checkbox" class="vespa-am-checkbox" id="table-select-all"
                  onchange="window.VESPAAccountManagement.toggleTableSelectAll(this)">
              </th>
              <th>Name</th>
              <th>Email</th>
              <th>Group</th>
              <th>Account ID</th>
              <th>Logged In</th>
              <th>User Role(s)</th>
              <th>Last Login</th>
              <th>Features</th>
              <th>Logins</th>
              <th class="no-sort">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${accounts.map(staff => createStaffRow(staff)).join('')}
          </tbody>
        </table>
      </div>
    `;

    debugLog('Table HTML added to DOM');

    // DataTables retry counter
    let dataTableRetryCount = 0;

    // Wait for DataTables to be ready, then initialize
    const waitForDataTables = () => {
      // Check if DataTables is available on jQuery
      if ($ && $.fn && $.fn.DataTable) {
        debugLog("DataTables is available, initializing table");
        initDataTable();
      } else {
        debugLog("DataTables plugin not available yet, waiting...");
        dataTableRetryCount++;
        
        if (dataTableRetryCount > 30) { // 15 seconds
          debugLog("DataTables never loaded, showing table without DataTables", 'error');
          return;
        }
        
        setTimeout(waitForDataTables, 500);
      }
    };
    
    // Initialize DataTable
    const initDataTable = () => {
      debugLog('Starting DataTable initialization');
      
      try {
        // Test if table exists
        const tableElement = document.getElementById('staff-datatable');
        if (!tableElement) {
          debugLog('ERROR: staff-datatable element not found!');
          return;
        }
        debugLog('Table element found');
        
        // Initialize with very basic config
        staffDataTable = $('#staff-datatable').DataTable({
          paging: true,
          ordering: true,
          info: true,
          pageLength: 50,
          order: [[1, 'asc']],
          columnDefs: [
            { orderable: false, targets: 0 } // Disable sorting on checkbox column
          ],
          drawCallback: function() {
            // Make cells editable after table is drawn/redrawn
            makeStaffCellsEditable();
          }
        });
        
        debugLog('Basic DataTable initialized successfully');
        
        // Make initial cells editable
        makeStaffCellsEditable();
        
        // Now add our custom filters
        setupCustomFilters();
        
      } catch (error) {
        debugLog('ERROR initializing DataTable:', error.message);
        console.error('Full DataTable error:', error);
        
        // Fall back to no DataTables
        debugLog('Falling back to standard table without DataTables');
      }
    };
    
    // Setup custom filters
    const setupCustomFilters = () => {
      debugLog('Setting up custom filters');
      
      // Clear any existing search functions
      $.fn.dataTable.ext.search = [];
      
      // Add custom search function
      $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
        // Only apply to staff table
        if (!settings.nTable || settings.nTable.id !== 'staff-datatable') return true;
        
        // Get filter values
        const searchTerm = document.getElementById('am-search')?.value?.toLowerCase() || '';
        const groupFilter = document.getElementById('am-filter-group')?.value || '';
        const roleFilter = document.getElementById('am-filter-role')?.value || '';
        
        // Get row data
        const name = (data[1] || '').toLowerCase();
        const email = (data[2] || '').toLowerCase();
        const group = (data[3] || '');
        const rolesHtml = data[6] || '';
        
        // Apply filters
        if (searchTerm && !name.includes(searchTerm) && !email.includes(searchTerm)) {
          return false;
        }
        
        if (groupFilter && group !== groupFilter) {
          return false;
        }
        
        if (roleFilter) {
          if (roleFilter === 'No Role') {
            if (!rolesHtml.includes('No roles assigned')) {
              return false;
            }
          } else {
            if (!rolesHtml.includes(roleFilter)) {
              return false;
            }
          }
        }
        
        return true;
      });
      
      // Bind filter events
      const searchInput = document.getElementById('am-search');
      const groupSelect = document.getElementById('am-filter-group');
      const roleSelect = document.getElementById('am-filter-role');
      
      if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
          debugLog('Search changed:', searchInput.value);
          if (staffDataTable) staffDataTable.draw();
        }, 300));
        debugLog('Search filter bound');
      }
      
      if (groupSelect) {
        groupSelect.addEventListener('change', () => {
          debugLog('Group filter changed:', groupSelect.value);
          if (staffDataTable) staffDataTable.draw();
        });
        debugLog('Group filter bound');
      }
      
      if (roleSelect) {
        roleSelect.addEventListener('change', () => {
          debugLog('Role filter changed:', roleSelect.value);
          if (staffDataTable) staffDataTable.draw();
        });
        debugLog('Role filter bound');
      }
    };
    
    // Start the process
    waitForDataTables();
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
    
    // Extract email properly
    const email = staff.field_70?.email || staff.field_70 || 'N/A';
    
    // Extract name properly
    const name = staff.field_69?.full || staff.field_69 || 'N/A';
    
    return `
      <tr data-account-id="${staff.id}">
        <td>
          <input type="checkbox" class="vespa-am-checkbox row-checkbox" 
            value="${staff.id}" onchange="window.VESPAAccountManagement.toggleRowSelection(this)">
        </td>
        <td>${name}</td>
        <td>${email}</td>
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
          ${roleNames.includes('Staff Admin') ? `
            <button class="vespa-am-link-button" style="background: #17a2b8;" 
              onclick="window.VESPAAccountManagement.syncStaffAdminConnections('${staff.id}', '${email}')">
              Sync Connections
            </button>
          ` : ''}
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
        <table id="student-datatable" class="vespa-am-table display compact">
          <thead>
            <tr>
              <th class="no-sort" style="width: 30px;">
                <input type="checkbox" class="vespa-am-checkbox" id="table-select-all"
                  onchange="window.VESPAAccountManagement.toggleTableSelectAll(this)">
              </th>
              <th>Name</th>
              <th>Email</th>
              <th>Group</th>
              <th>Year</th>
              <th>Account ID</th>
              <th>Logged In</th>
              <th>Last Login</th>
              <th>Features</th>
              <th>Logins</th>
              <th class="no-sort">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(student => createStudentRow(student)).join('')}
          </tbody>
        </table>
      </div>
    `;

    debugLog('Student table HTML added to DOM');

    // DataTables retry counter
    let dataTableRetryCount = 0;
    
    // Wait for DataTables to be ready
    const waitForDataTables = () => {
      // Check if DataTables is available on jQuery
      if ($ && $.fn && $.fn.DataTable) {
        debugLog("DataTables is available, initializing student table");
        initDataTable();
      } else {
        debugLog("DataTables plugin not available yet, waiting...");
        dataTableRetryCount++;
        
        if (dataTableRetryCount > 30) { // 15 seconds
          debugLog("DataTables never loaded, showing table without DataTables", 'error');
          return;
        }
        
        setTimeout(waitForDataTables, 500);
      }
    };
    
    // Initialize DataTable
    const initDataTable = () => {
      debugLog('Starting student DataTable initialization');
      
      try {
        // Test if table exists
        const tableElement = document.getElementById('student-datatable');
        if (!tableElement) {
          debugLog('ERROR: student-datatable element not found!');
          return;
        }
        debugLog('Student table element found');
        
        // Initialize with very basic config
        studentDataTable = $('#student-datatable').DataTable({
          paging: true,
          ordering: true,
          info: true,
          pageLength: 50,
          order: [[1, 'asc']],
          columnDefs: [
            { orderable: false, targets: 0 } // Disable sorting on checkbox column
          ],
          drawCallback: function() {
            // Make cells editable after table is drawn/redrawn
            makeStudentCellsEditable();
          }
        });
        
        debugLog('Basic student DataTable initialized successfully');
        
        // Make initial cells editable
        makeStudentCellsEditable();
        
        // Now add our custom filters
        setupStudentFilters();
        
      } catch (error) {
        debugLog('ERROR initializing student DataTable:', error.message);
        console.error('Full DataTable error:', error);
        
        // Fall back to no DataTables
        debugLog('Falling back to standard table without DataTables');
      }
    };
    
    // Setup custom filters for students
    const setupStudentFilters = () => {
      debugLog('Setting up student custom filters');
      
      // Clear any existing search functions
      $.fn.dataTable.ext.search = [];
      
      // Add custom search function
      $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
        // Only apply to student table
        if (!settings.nTable || settings.nTable.id !== 'student-datatable') return true;
        
        // Get filter values
        const searchTerm = document.getElementById('am-search')?.value?.toLowerCase() || '';
        const yearFilter = document.getElementById('am-filter-year')?.value || '';
        const groupFilter = document.getElementById('am-filter-group')?.value || '';
        
        // Get row data
        const name = (data[1] || '').toLowerCase();
        const email = (data[2] || '').toLowerCase();
        const group = (data[3] || '');
        const year = data[4] || '';
        
        // Apply filters
        if (searchTerm && !name.includes(searchTerm) && !email.includes(searchTerm)) {
          return false;
        }
        
        if (yearFilter && year !== yearFilter) {
          return false;
        }
        
        if (groupFilter && group !== groupFilter) {
          return false;
        }
        
        return true;
      });
      
      // Bind filter events
      const searchInput = document.getElementById('am-search');
      const yearSelect = document.getElementById('am-filter-year');
      const groupSelect = document.getElementById('am-filter-group');
      
      if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
          debugLog('Student search changed:', searchInput.value);
          if (studentDataTable) studentDataTable.draw();
        }, 300));
        debugLog('Student search filter bound');
      }
      
      if (yearSelect) {
        yearSelect.addEventListener('change', () => {
          debugLog('Year filter changed:', yearSelect.value);
          if (studentDataTable) studentDataTable.draw();
        });
        debugLog('Year filter bound');
      }
      
      if (groupSelect) {
        groupSelect.addEventListener('change', () => {
          debugLog('Student group filter changed:', groupSelect.value);
          if (studentDataTable) studentDataTable.draw();
        });
        debugLog('Student group filter bound');
      }
    };
    
    // Start the process
    waitForDataTables();
  }

  /**
   * Create a student table row
   */
  function createStudentRow(student) {
    const hasLoggedIn = student.field_539 === 'Yes' || student.field_539 === true ? 'Yes' : 'No';
    
    // Extract email properly
    const email = student.field_70?.email || student.field_70 || 'N/A';
    
    // Extract name properly
    const name = student.field_69?.full || student.field_69 || 'N/A';
    
    // Format features used
    const featuresUsed = Array.isArray(student.field_3202) 
      ? student.field_3202.join(', ') 
      : (student.field_3202 || 'None');
    
    return `
      <tr data-account-id="${student.id}">
        <td>
          <input type="checkbox" class="vespa-am-checkbox row-checkbox" 
            value="${student.id}" onchange="window.VESPAAccountManagement.toggleRowSelection(this)">
        </td>
        <td>${name}</td>
        <td>${email}</td>
        <td>${student.field_708 || 'N/A'}</td>
        <td>${student.field_550 || 'N/A'}</td>
        <td>${student.field_123 || 'N/A'}</td>
        <td>${hasLoggedIn}</td>
        <td>${student.field_3198 ? formatDate(student.field_3198) : 'Never'}</td>
        <td title="${featuresUsed}">${featuresUsed}</td>
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
  function editStaffRoles(staffId) {
    const staff = staffData.find(s => s.id === staffId);
    if (!staff) return;
    
    const currentRoles = Array.isArray(staff.field_73) ? staff.field_73 : (staff.field_73 ? [staff.field_73] : []);
    
    const modalContent = `
      <div style="padding: 20px;">
        <h4>Edit Roles for ${staff.field_69}</h4>
        <p>Select the roles for this staff member:</p>
        
        <div style="margin: 20px 0;">
          <label style="display: block; margin: 10px 0;">
            <input type="checkbox" id="role-profile_5" value="profile_5" ${currentRoles.includes('profile_5') ? 'checked' : ''} 
              onchange="window.VESPAAccountManagement.handleStaffAdminToggle(this)">
            Staff Admin
          </label>
          <div id="staff-admin-warning" style="display: none; background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; margin: 0 0 10px 25px; border-radius: 4px; font-size: 13px;">
            <strong>⚠️ Important:</strong> Adding Staff Admin role will automatically connect this user to all student and staff records in the system for administrative access.
          </div>
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
  async function saveStaffRoles(staffId) {
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
   * Move up selected students by one year group
   */
  async function moveUpYearGroup() {
    const selectedIds = getSelectedAccountIds();
    
    if (selectedIds.length === 0) {
      showError('Please select at least one student to move up');
      return;
    }
    
    // Confirm action
    const confirmMessage = selectedIds.length === 1 
      ? 'Are you sure you want to move this student up by one year group?' 
      : `Are you sure you want to move ${selectedIds.length} students up by one year group?`;
      
    if (!confirm(confirmMessage + '\n\nThis will update their year group across all related records.')) {
      return;
    }
    
    try {
      showLoadingModal('Moving students up to next year group...');
      
      const response = await $.ajax({
        url: `${API_BASE_URL}account/move-up-year-group`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          studentIds: selectedIds
        }),
        xhrFields: { withCredentials: true }
      });
      
      closeLoadingModal();
      
      if (response.success) {
        showSuccessModal(response.message, () => {
          refreshData();
        });
      } else {
        showError(response.message || 'Failed to move up year groups');
      }
      
      if (response.errors && response.errors.length > 0) {
        console.error('Errors during year group update:', response.errors);
        // Show first few errors
        const errorSample = response.errors.slice(0, 3)
          .map(err => `Student ${err.studentId}: ${err.error}`)
          .join('\n');
        showError(`Some students had errors:\n${errorSample}${response.errors.length > 3 ? '\n... and more' : ''}`);
      }
      
    } catch (error) {
      closeLoadingModal();
      debugLog('Error moving up year groups:', error);
      showError(`Failed to move up year groups: ${error.message || 'Unknown error'}`);
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
    try {
      let dateValue = null;
      
      if (typeof dateObj === 'string') {
        dateValue = dateObj;
      } else if (dateObj && dateObj.date_formatted) {
        return dateObj.date_formatted;
      } else if (dateObj && dateObj.date) {
        dateValue = dateObj.date;
      } else if (dateObj && dateObj.timestamp) {
        dateValue = dateObj.timestamp;
      }
      
      if (dateValue) {
        // Try parsing the date
        const date = new Date(dateValue);
        
        // Check if date is valid
        if (!isNaN(date.getTime())) {
          // Format to UK date format (DD/MM/YYYY)
          const day = date.getDate().toString().padStart(2, '0');
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const year = date.getFullYear();
          return `${day}/${month}/${year}`;
        }
      }
    } catch (error) {
      debugLog('Error formatting date:', error);
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
    
    // Try to extract from the API calls being made
    // This is a fallback for when customerId isn't in userContext
    // but the system is still making successful API calls
    debugLog('No customer ID found in context, checking for active customer session');
    
    // Since the API calls in the logs show a customerId is being used,
    // we can return null here and let the backend use session context
    return null;
  }

  /**
   * Make a cell editable
   */
  function makeEditable(cell, accountId, fieldName, accountType) {
    const originalValue = cell.textContent.trim();
    cell.classList.add('vespa-editable');
    
    // Add edit indicator
    const indicator = document.createElement('span');
    indicator.className = 'vespa-edit-indicator';
    indicator.textContent = '✏️';
    cell.appendChild(indicator);
    
    cell.addEventListener('click', function(e) {
      if (cell.classList.contains('editing')) return;
      
      cell.classList.add('editing');
      const input = document.createElement('input');
      input.type = fieldName === 'email' ? 'email' : 'text';
      input.value = originalValue;
      
      // Clear cell and add input
      cell.innerHTML = '';
      cell.appendChild(input);
      input.focus();
      input.select();
      
      // Save on Enter, cancel on Escape
      input.addEventListener('keydown', async function(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          await saveInlineEdit(cell, input, accountId, fieldName, accountType, originalValue);
        } else if (e.key === 'Escape') {
          cancelInlineEdit(cell, originalValue);
        }
      });
      
      // Save on blur
      input.addEventListener('blur', async function() {
        // Small delay to handle button clicks
        setTimeout(async () => {
          if (cell.classList.contains('editing')) {
            await saveInlineEdit(cell, input, accountId, fieldName, accountType, originalValue);
          }
        }, 200);
      });
    });
  }

  /**
   * Save inline edit
   */
  async function saveInlineEdit(cell, input, accountId, fieldName, accountType, originalValue) {
    const newValue = input.value.trim();
    
    if (newValue === originalValue) {
      cancelInlineEdit(cell, originalValue);
      return;
    }
    
    // Validate email if it's an email field
    if (fieldName === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newValue)) {
      showError('Please enter a valid email address');
      input.focus();
      return;
    }
    
    try {
      // Show loading state
      cell.innerHTML = '<span style="color: #3b82f6;">Saving...</span>';
      
      const response = await $.ajax({
        url: `${API_BASE_URL}account/update-field`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          accountId: accountId,
          accountType: accountType,
          fieldName: fieldName,
          value: newValue
        }),
        xhrFields: { withCredentials: true }
      });
      
      if (response.success) {
        cell.classList.remove('editing');
        cell.textContent = newValue;
        
        // Re-add edit indicator
        const indicator = document.createElement('span');
        indicator.className = 'vespa-edit-indicator';
        indicator.textContent = '✏️';
        cell.appendChild(indicator);
        
        showSuccess(`${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} updated successfully`);
      } else {
        throw new Error(response.message || 'Failed to update');
      }
    } catch (error) {
      debugLog('Error saving inline edit:', error);
      showError(`Failed to update ${fieldName}: ${error.message}`);
      cancelInlineEdit(cell, originalValue);
    }
  }

  /**
   * Cancel inline edit
   */
  function cancelInlineEdit(cell, originalValue) {
    cell.classList.remove('editing');
    cell.textContent = originalValue;
    
    // Re-add edit indicator
    const indicator = document.createElement('span');
    indicator.className = 'vespa-edit-indicator';
    indicator.textContent = '✏️';
    cell.appendChild(indicator);
  }

  /**
   * Make staff table cells editable
   */
  function makeStaffCellsEditable() {
    const table = document.getElementById('staff-datatable');
    if (!table) return;
    
    // Get all rows
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const accountId = row.dataset.accountId;
      if (!accountId) return;
      
      // Make name cell editable (column 1)
      const nameCell = row.cells[1];
      if (nameCell && !nameCell.classList.contains('vespa-editable')) {
        makeEditable(nameCell, accountId, 'name', 'staff');
      }
      
      // Make email cell editable (column 2)
      const emailCell = row.cells[2];
      if (emailCell && !emailCell.classList.contains('vespa-editable')) {
        makeEditable(emailCell, accountId, 'email', 'staff');
      }
      
      // Make group cell editable (column 3)
      const groupCell = row.cells[3];
      if (groupCell && !groupCell.classList.contains('vespa-editable')) {
        makeEditable(groupCell, accountId, 'group', 'staff');
      }
    });
  }

  /**
   * Make student table cells editable
   */
  function makeStudentCellsEditable() {
    const table = document.getElementById('student-datatable');
    if (!table) return;
    
    // Get all rows
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const accountId = row.dataset.accountId;
      if (!accountId) return;
      
      // Make name cell editable (column 1)
      const nameCell = row.cells[1];
      if (nameCell && !nameCell.classList.contains('vespa-editable')) {
        makeEditable(nameCell, accountId, 'name', 'student');
      }
      
      // Make email cell editable (column 2)
      const emailCell = row.cells[2];
      if (emailCell && !emailCell.classList.contains('vespa-editable')) {
        makeEditable(emailCell, accountId, 'email', 'student');
      }
      
      // Make group cell editable (column 3)
      const groupCell = row.cells[3];
      if (groupCell && !groupCell.classList.contains('vespa-editable')) {
        makeEditable(groupCell, accountId, 'group', 'student');
      }
    });
  }

  /**
   * Handle toggling the Staff Admin checkbox to show/hide warning
   */
  function handleStaffAdminToggle(checkbox) {
    const warning = document.getElementById('staff-admin-warning');
    if (warning) {
      warning.style.display = checkbox.checked ? 'block' : 'none';
    }
  }

  /**
   * Sync staff admin connections across all objects
   */
  async function syncStaffAdminConnections(staffId, staffEmail) {
    try {
      const customerId = getCustomerId();
      if (!customerId) {
        showError('Unable to determine customer ID');
        return;
      }
      
      // Confirm the action
      if (!confirm(`This will sync all connections for ${staffEmail} as a Staff Admin across all student and staff records. This may take a moment. Continue?`)) {
        return;
      }
      
      // Show loading modal
      showLoadingModal('Syncing staff admin connections across all records...');
      
      const response = await $.ajax({
        url: `${API_BASE_URL}account/sync-staff-admin-connections`,
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({
          staffEmail: staffEmail,
          customerId: customerId
        }),
        xhrFields: { withCredentials: true }
      });
      
      closeLoadingModal();
      
      if (response.success) {
        let message = 'Staff admin connections synced successfully!';
        if (response.details && response.details.updates) {
          message += '\n\nUpdates:\n' + response.details.updates.join('\n');
        }
        if (response.details && response.details.errors && response.details.errors.length > 0) {
          message += '\n\nErrors:\n' + response.details.errors.slice(0, 5).join('\n');
          if (response.details.errors.length > 5) {
            message += '\n... and ' + (response.details.errors.length - 5) + ' more errors';
          }
        }
        
        showModal('Sync Complete', `
          <div style="padding: 20px;">
            <p><strong>${response.message}</strong></p>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 4px; margin-top: 15px; max-height: 400px; overflow-y: auto;">
              <pre style="white-space: pre-wrap; font-size: 12px;">${message}</pre>
            </div>
            <div style="text-align: right; margin-top: 20px;">
              <button class="vespa-button primary" onclick="window.VESPAAccountManagement.closeModal()">OK</button>
            </div>
          </div>
        `);
      } else {
        throw new Error(response.message || 'Sync failed');
      }
      
    } catch (error) {
      closeLoadingModal();
      debugLog('Error syncing staff admin connections:', error);
      showError(`Failed to sync connections: ${error.message}`);
    }
  }

  /**
   * Wait for configuration to be available before initializing
   */
  function waitForConfiguration() {
    let attempts = 0;
    const maxAttempts = 20;
    let fetchingCustomerId = false;
    
    const checkConfig = setInterval(() => {
      attempts++;
      
      // Check for user context (for regular users)
      if (window.userContext && window.userContext.customerId) {
        clearInterval(checkConfig);
        debugLog('Configuration found via userContext', window.userContext);
        proceedWithInitialization();
        return;
      }
      
      // If we have a userId but no customerId, try to fetch it from the backend
      if (window.userContext && window.userContext.userId && !window.userContext.customerId && !fetchingCustomerId && attempts > 2) {
        debugLog('Have userId but no customerId, fetching from backend...', {
          userId: window.userContext.userId,
          userEmail: window.userContext.userEmail
        });
        fetchingCustomerId = true;
        
        // For now, let's skip the API call and use a different approach
        // Check if we're in a Knack app and can get customer ID from the DOM
        debugLog('Attempting to find customer ID from Knack context...');
        
        // Try to get customer ID from various sources
        let foundCustomerId = null;
        
        // Method 1: Check Knack scene data
        if (typeof Knack !== 'undefined' && Knack.scenes && Knack.scenes.scene) {
          const currentScene = Knack.scenes.scene;
          debugLog('Current Knack scene:', currentScene);
          
          // Look for customer ID in scene data
          if (currentScene && currentScene.views) {
            Object.values(currentScene.views).forEach(view => {
              if (view.model && view.model.attributes && view.model.attributes.field_122_raw) {
                foundCustomerId = view.model.attributes.field_122_raw[0]?.id;
                debugLog('Found customer ID in view model:', foundCustomerId);
              }
            });
          }
        }
        
        // Method 2: Try to extract from URL parameters
        if (!foundCustomerId) {
          const urlParams = new URLSearchParams(window.location.search);
          const customerParam = urlParams.get('customer_id');
          if (customerParam) {
            foundCustomerId = customerParam;
            debugLog('Found customer ID in URL:', foundCustomerId);
          }
        }
        
        // Method 3: For now, assume the user can only see their own data
        // and proceed without customerId - the backend will use session context
        if (!foundCustomerId) {
          debugLog('No customer ID found, proceeding anyway - backend will use session context');
          clearInterval(checkConfig);
          proceedWithInitialization();
          return;
        }
        
        // If we found a customer ID, use it
        if (foundCustomerId) {
          window.userContext.customerId = foundCustomerId;
          debugLog('Set customer ID from context:', foundCustomerId);
          clearInterval(checkConfig);
          proceedWithInitialization();
        }
        return;
      }
      
      // Also check if userContext exists but customerId is still loading
      if (window.userContext && window.userContext.userId && !window.userContext.customerId && !fetchingCustomerId) {
        debugLog(`Waiting for customerId... (attempt ${attempts}/${maxAttempts})`);
      }
      
      // Check for selected school (for super users)
      if (window.selectedSchool && window.selectedSchool.id) {
        clearInterval(checkConfig);
        debugLog('Configuration found via selectedSchool', window.selectedSchool);
        proceedWithInitialization();
        return;
      }
      
      // Check if API URL is at least available
      if (window.API_BASE_URL && !API_BASE_URL) {
        API_BASE_URL = window.API_BASE_URL;
        debugLog('API URL updated from window', API_BASE_URL);
      }
      
      if (attempts >= maxAttempts) {
        clearInterval(checkConfig);
        debugLog('Configuration timeout - no customer context available', {
          userContext: window.userContext,
          selectedSchool: window.selectedSchool
        });
        showError('Unable to load account management. Please ensure you are logged in and try again.');
      }
    }, 250);
  }

  /**
   * Proceed with initialization once configuration is available
   */
  function proceedWithInitialization() {
    console.log('[VESPA AM] proceedWithInitialization called');
    initialize();
    
    // Check for pending show flag
    console.log('[VESPA AM] Checking for _pendingShow flag...', {
      hasVESPAAccountManagement: !!window.VESPAAccountManagement,
      pendingShow: window.VESPAAccountManagement ? window.VESPAAccountManagement._pendingShow : 'N/A',
      isInitialized: isInitialized
    });
    
    // If the show method was called before initialization, show now
    if (window.VESPAAccountManagement && window.VESPAAccountManagement._pendingShow) {
      console.log('[VESPA AM] _pendingShow flag found, calling showAccountManagement()');
      // Small delay to ensure everything is ready
      setTimeout(() => {
        showAccountManagement();
        delete window.VESPAAccountManagement._pendingShow;
      }, 100);
    } else {
      console.log('[VESPA AM] No _pendingShow flag, not showing interface automatically');
      // Try to show anyway if we're in a regular user context (not super user emulation)
      if (!window.selectedSchool && window.userContext && window.userContext.userId) {
        console.log('[VESPA AM] Regular user detected, showing interface anyway');
        setTimeout(() => {
          showAccountManagement();
        }, 100);
      }
    }
  }

  // Start waiting for configuration when the script loads
  console.log('[VESPA AM] Script loaded, starting configuration wait...');
  waitForConfiguration();

  // Expose functions to global scope immediately
  window.VESPAAccountManagement = {
    show: function() {
      console.log('[VESPA AM] show() called, isInitialized:', isInitialized);
      if (isInitialized) {
        showAccountManagement();
      } else {
        // Mark that we want to show once initialized
        console.log('[VESPA AM] Module not initialized yet, setting _pendingShow flag');
        window.VESPAAccountManagement._pendingShow = true;
      }
    },
    hide: hideAccountManagement,
    initialize: initialize,
    moveUpYearGroup: moveUpYearGroup,
    // Add debug method
    debug: function() {
      console.log('[VESPA AM] Debug info:', {
        isInitialized: isInitialized,
        hasUserContext: !!window.userContext,
        userContext: window.userContext,
        hasSelectedSchool: !!window.selectedSchool,
        selectedSchool: window.selectedSchool,
        API_BASE_URL: API_BASE_URL,
        _pendingShow: window.VESPAAccountManagement._pendingShow
      });
    }
  };
  
  // Also expose individual functions that might be called from HTML
  window.editStaffRoles = editStaffRoles;
  window.viewLinkedAccounts = viewLinkedAccounts;
  window.reallocateStudent = reallocateStudent;
  window.editStudentActivities = editStudentActivities;
  window.moveUpYearGroup = moveUpYearGroup;
  window.handleStaffAdminToggle = handleStaffAdminToggle;
  window.toggleRowSelection = toggleRowSelection;
  window.toggleTableSelectAll = toggleTableSelectAll;

})();
