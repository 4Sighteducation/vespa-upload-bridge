/**
 * VESPA Renewal Management System - Version 1d
 * 
 * This module handles renewal invoice generation and management for Super Users.
 * It integrates with Object_122 (Orders) in Knack and manages the renewal process.
 * 
 * Changes in v1d:
 * - Fixed filtering logic to handle edge cases and prevent loading failures
 * - Added ALL fields to the edit modal with proper organization
 * - Fixed email rendering issue (HTML showing as text)
 * - Improved UI with cleaner layout and better field grouping
 * - Added proper field mappings from accurate source
 * - Added timeout handling and retry logic for API calls
 * - Improved status filtering to match exact values
 * 
 * @requires jQuery
 * @requires Knack API access
 * @requires SendGrid email templates (RENEWAL_EMAIL_TEMPLATE_ID)
 */

(function(window) {
  'use strict';

  // Module configuration with complete field mappings
  const RENEWAL_CONFIG = {
    objectId: 'object_122', // Orders object in Knack
    customerObjectId: 'object_2', // Customer object
    get apiUrl() {
      // Try to find the API URL from various possible sources
      const possibleUrls = [
        window.VESPA_UPLOAD_CONFIG?.apiUrl,
        window.VESPA_UPLOAD_CONFIG?.API_BASE_URL,
        window.API_BASE_URL,
        window.vespaApiUrl,
        window.VESPA_UPLOAD_CONFIG?.apiBaseUrl,
        window.VESPA_UPLOAD_CONFIG?.baseUrl
      ];
      
      debugLog('Searching for API URL in:', {
        vespaConfig: window.VESPA_UPLOAD_CONFIG,
        possibleUrls: possibleUrls
      });
      
      // Find the first valid URL
      const configUrl = possibleUrls.find(url => url && typeof url === 'string');
      
      if (configUrl) {
        let url = configUrl;
        // Ensure trailing slash
        if (!url.endsWith('/')) {
          url += '/';
        }
        // Ensure the URL has the proper protocol
        if (!url.startsWith('http')) {
          url = 'https://' + url;
        }
        // Ensure it ends with /api/ if it doesn't already
        if (!url.includes('/api/')) {
          if (url.endsWith('/')) {
            url += 'api/';
          } else {
            url += '/api/';
          }
        }
        debugLog('Using API URL:', url);
        return url;
      }
      
      const defaultUrl = 'https://vespa-upload-api-07e11c285370.herokuapp.com/api/';
      debugLog('Using default API URL:', defaultUrl);
      return defaultUrl;
    },
    debug: true,
    // Complete field mappings for Object_122 (Orders)
    fields: {
      // Order Information
      customerId: 'field_3459', // VESPA Customer connection
      orderNumber: 'field_3470', // Auto Increment
      status: 'field_3451', // Multiple Choice
      orderDate: 'field_3454', // Date/Time
      renewalDate: 'field_3497', // Date/Time
      paymentDue: 'field_3464', // Date/Time
      setupDate: 'field_3455', // Date/Time
      
      // Product Details
      product: 'field_3460', // Product selection
      rate: 'field_3461', // Currency
      quantity: 'field_3462', // Number
      discount: 'field_3465', // Number (percentage 0-100)
      vatChargeable: 'field_3467', // Yes/No
      total: 'field_3453', // Currency
      equation: 'field_3506', // Equation
      addons: 'field_3503', // Dropdown for add-ons
      addonsCost: 'field_3512', // Currency for add-ons total
      
      // Contact Information
      staffAdminEmail: 'field_3468', // Email
      staffAdminName: 'field_3500', // Person
      financeEmail: 'field_3471', // Email
      financeName: 'field_3473', // Short Text
      secondaryContact: 'field_3501', // Person
      secondaryEmail: 'field_3502', // Email
      
      // Additional Information
      poNumber: 'field_3472', // Short Text (PO Number)
      invoiceNumber: 'field_3469', // Short Text
      invoiceLink: 'field_3474', // Link
      estimateLink: 'field_3475', // Link
      address: 'field_3499', // Address
      trustSchool: 'field_3504', // Yes/No
      settled: 'field_3498', // Yes/No
      lastReminderSent: 'field_3505' // Date/Time
    },
    // Renewal status options
    statusOptions: {
      'Pending': 'Pending',
      'Estimate Sent': 'Estimate Sent',
      'Invoice Sent': 'Invoice Sent',
      'Paid': 'Paid',
      'Cancelled': 'Cancelled'
    },
    // Renewal timing settings
    renewalSettings: {
      firstReminderDays: 42, // 6 weeks
      secondReminderDays: 21, // 3 weeks
      gracePeriodDays: 30 // 30 days after due date
    }
  };

  // State management
  const renewalState = {
    orders: [],
    selectedOrders: [],
    filters: {
      dateRange: 'all',
      status: 'all',
      search: ''
    },
    isLoading: false,
    currentModal: null,
    loadAttempts: 0,
    maxLoadAttempts: 3
  };

  /**
   * Debug logging helper
   */
  function debugLog(message, data, level = 'info') {
    if (!RENEWAL_CONFIG.debug) return;
    
    const styles = {
      info: 'color: #007bff',
      success: 'color: #28a745',
      warning: 'color: #ffc107',
      error: 'color: #dc3545'
    };
    
    console.log(`%c[VESPA Renewals v1d] ${message}`, styles[level], data || '');
  }

  /**
   * Extract email from Knack field (handles various formats)
   */
  function extractEmail(emailField) {
    if (!emailField) return '';
    
    // If it's a string, return it
    if (typeof emailField === 'string') {
      // Check if it contains HTML (like the issue in the screenshot)
      if (emailField.includes('<a href=')) {
        // Extract email from href attribute
        const match = emailField.match(/href="mailto:([^"]+)"/);
        if (match) return match[1];
        // Extract from text content
        const textMatch = emailField.match(/>([^<]+@[^<]+)</);
        if (textMatch) return textMatch[1];
      }
      return emailField;
    }
    
    // If it's an object with email property
    if (emailField.email) return emailField.email;
    
    // If it's an object with field property
    if (emailField.field) return emailField.field;
    
    // If it's an object with formatted property
    if (emailField.formatted) return emailField.formatted;
    
    return '';
  }

  /**
   * Extract text from Knack person field
   */
  function extractPersonName(personField) {
    if (!personField) return '';
    
    // If it's a string, return it
    if (typeof personField === 'string') return personField;
    
    // If it's an object with full property
    if (personField.full) return personField.full;
    
    // If it's an object with identifier property
    if (personField.identifier) return personField.identifier;
    
    // If it has first and last
    if (personField.first || personField.last) {
      return `${personField.first || ''} ${personField.last || ''}`.trim();
    }
    
    return '';
  }

  /**
   * Extract numeric value from Knack currency field
   */
  function extractCurrencyValue(currencyField) {
    if (!currencyField) return 0;
    
    // If it's already a number, return it
    if (typeof currencyField === 'number') return currencyField;
    
    // If it's a string, try to parse it
    if (typeof currencyField === 'string') {
      // Remove currency symbols and parse
      const cleanValue = currencyField.replace(/[£$,]/g, '');
      return parseFloat(cleanValue) || 0;
    }
    
    // If it's an object with value property
    if (currencyField.value !== undefined) return parseFloat(currencyField.value) || 0;
    
    // If it's an object with formatted property
    if (currencyField.formatted) {
      const cleanValue = currencyField.formatted.replace(/[£$,]/g, '');
      return parseFloat(cleanValue) || 0;
    }
    
    // If it's an object with amount property
    if (currencyField.amount !== undefined) return parseFloat(currencyField.amount) || 0;
    
    return 0;
  }

  /**
   * Format address field
   */
  function formatAddress(addressField) {
    if (!addressField) return '';
    
    if (typeof addressField === 'string') return addressField;
    
    if (addressField.formatted) return addressField.formatted;
    
    // Build from components
    const parts = [];
    if (addressField.street) parts.push(addressField.street);
    if (addressField.street2) parts.push(addressField.street2);
    if (addressField.city) parts.push(addressField.city);
    if (addressField.state) parts.push(addressField.state);
    if (addressField.zip) parts.push(addressField.zip);
    if (addressField.country) parts.push(addressField.country);
    
    return parts.join(', ');
  }

  /**
   * Format date for input fields (YYYY-MM-DD format)
   */
  function formatDateForInput(dateValue) {
    if (!dateValue) return '';
    
    let date;
    
    // Handle Knack date object format
    if (dateValue && typeof dateValue === 'object') {
      if (dateValue.date_formatted) {
        // Use the UK formatted date from Knack
        const [day, month, year] = dateValue.date_formatted.split('/');
        date = new Date(year, month - 1, day);
      } else if (dateValue.iso_timestamp) {
        date = new Date(dateValue.iso_timestamp);
      } else if (dateValue.unix_timestamp) {
        date = new Date(dateValue.unix_timestamp);
      }
    }
    // If it's already a Date object
    else if (dateValue instanceof Date) {
      date = dateValue;
    }
    // If it's a string
    else if (typeof dateValue === 'string') {
      // Check if it's already in YYYY-MM-DD format
      if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateValue;
      }
      date = new Date(dateValue);
    }
    // If it's a number (timestamp)
    else if (typeof dateValue === 'number') {
      date = new Date(dateValue);
    }
    else {
      return '';
    }
    
    // Return in YYYY-MM-DD format for input fields
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    return '';
  }

  /**
   * Initialize the renewal management system
   */
  function initializeRenewalSystem() {
    debugLog('Initializing Renewal Management System v1d');
    
    // Set up global access immediately
    window.VESPARenewals = {
      init: initializeRenewalSystem,
      show: showRenewalInterface,
      close: () => {
        if (renewalState.currentModal) {
          renewalState.currentModal.remove();
          renewalState.currentModal = null;
        }
      },
      refresh: loadRenewalData,
      applyFilters: applyFilters,
      toggleSelectAll: toggleSelectAll,
      updateSelection: updateSelection,
      editOrder: editOrder,
      processSelected: processSelectedRenewals,
      executeProcessing: executeProcessing,
      calculateEditTotal: calculateEditTotal,
      toggleNewOrderMode: toggleNewOrderMode,
      generateEstimates: () => processSelectedRenewals(),
      sendReminders: () => processSelectedRenewals(),
      formatDateForInput: formatDateForInput,
      saveOrderChanges: saveOrderChanges,
      toggleRenewalAmountField: toggleRenewalAmountField,
      updateProductFields: updateProductFields,
      toggleTotalOverride: toggleTotalOverride
    };
    
    // Add button to Super User interface
    addRenewalButton();
    
    // Load required styles
    loadRenewalStyles();
    
    debugLog('Renewal system initialized', null, 'success');
  }

  /**
   * Add the renewal button to the Super User interface
   */
  function addRenewalButton() {
    // Wait for the correct moment to add the button
    const checkInterval = setInterval(() => {
      const superUserSection = document.querySelector('.vespa-stage-container');
      if (superUserSection && window.VESPA_UPLOAD_CONFIG?.userRole === 'object_21') {
        clearInterval(checkInterval);
        
        // Find the renewal option
        const renewOption = document.querySelector('input[value="renew-customer"]');
        if (renewOption && renewOption.parentElement) {
          // Remove disabled state
          renewOption.disabled = false;
          renewOption.parentElement.style.opacity = '1';
          
          // Update the description
          const description = renewOption.parentElement.querySelector('.vespa-option-description');
          if (description) {
            description.textContent = 'Generate and manage renewal invoices for existing customers';
          }
          
          // Add click handler
          renewOption.addEventListener('change', function() {
            if (this.checked) {
              showRenewalInterface();
            }
          });
          
          debugLog('Renewal button activated', null, 'success');
        }
      }
    }, 500);
  }

  /**
   * Load renewal-specific styles
   */
  function loadRenewalStyles() {
    if (document.getElementById('vespa-renewal-styles-v1d')) return;
    
    const styles = `
      .renewal-modal {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }
      
      .renewal-modal-content {
        background: white;
        width: 90%;
        max-width: 1400px;
        height: 90%;
        max-height: 800px;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      }
      
      .renewal-header {
        padding: 20px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .renewal-filters {
        padding: 15px 20px;
        background: #f8f9fa;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        gap: 15px;
        align-items: center;
        flex-wrap: wrap;
      }
      
      .renewal-table-container {
        flex: 1;
        overflow: auto;
        padding: 20px;
      }
      
      .renewal-table {
        width: 100%;
        border-collapse: collapse;
      }
      
      .renewal-table th {
        background: #f8f9fa;
        padding: 12px;
        text-align: left;
        font-weight: 600;
        border-bottom: 2px solid #dee2e6;
        position: sticky;
        top: 0;
        z-index: 10;
      }
      
      .renewal-table td {
        padding: 12px;
        border-bottom: 1px solid #dee2e6;
      }
      
      .renewal-table tr:hover {
        background: #f8f9fa;
      }
      
      .renewal-actions {
        padding: 20px;
        border-top: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .renewal-checkbox {
        width: 18px;
        height: 18px;
        cursor: pointer;
      }
      
      .renewal-status {
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
        white-space: nowrap;
      }
      
      .renewal-status.pending { background: #fff3cd; color: #856404; }
      .renewal-status.estimate_sent { background: #cce5ff; color: #004085; }
      .renewal-status.invoice_sent { background: #d4edda; color: #155724; }
      .renewal-status.paid { background: #d1ecf1; color: #0c5460; }
      .renewal-status.renewed { background: #e2e3e5; color: #383d41; }
      .renewal-status.cancelled { background: #f8d7da; color: #721c24; }
      
      .renewal-edit-btn {
        padding: 4px 12px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      }
      
      .renewal-edit-btn:hover {
        background: #0056b3;
      }
      
      .renewal-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: #6c757d;
      }
      
      .renewal-empty {
        text-align: center;
        padding: 60px 20px;
        color: #6c757d;
      }
      
      .renewal-bulk-actions {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      
      .renewal-date-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        margin-left: 5px;
      }
      
      .renewal-date-badge.overdue {
        background: #dc3545;
        color: white;
      }
      
      .renewal-date-badge.soon {
        background: #ffc107;
        color: #212529;
      }
      
      .renewal-date-badge.upcoming {
        background: #17a2b8;
        color: white;
      }
      
      /* Edit modal styles */
      .renewal-edit-section {
        background: #f8f9fa;
        padding: 15px;
        margin: 15px 0;
        border-radius: 6px;
        border: 1px solid #e9ecef;
      }
      
      .renewal-edit-section h4 {
        margin: 0 0 15px 0;
        color: #495057;
        font-size: 16px;
        font-weight: 600;
      }
      
      .renewal-form-row {
        display: grid;
        gap: 15px;
        margin-bottom: 15px;
      }
      
      .renewal-form-row.cols-2 {
        grid-template-columns: 1fr 1fr;
      }
      
      .renewal-form-row.cols-3 {
        grid-template-columns: 1fr 1fr 1fr;
      }
      
      .renewal-form-row.cols-4 {
        grid-template-columns: 1fr 1fr 1fr 1fr;
      }
      
      .vespa-form-group label {
        display: block;
        margin-bottom: 5px;
        color: #495057;
        font-weight: 500;
        font-size: 14px;
      }
      
      .vespa-form-group input,
      .vespa-form-group select,
      .vespa-form-group textarea {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        font-size: 14px;
        transition: border-color 0.15s;
      }
      
      .vespa-form-group input:focus,
      .vespa-form-group select:focus,
      .vespa-form-group textarea:focus {
        outline: none;
        border-color: #80bdff;
        box-shadow: 0 0 0 0.2rem rgba(0,123,255,.25);
      }
      
      .vespa-form-group input[readonly] {
        background-color: #e9ecef;
        cursor: not-allowed;
      }
      
      .renewal-link-field {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      
      .renewal-link-field input {
        flex: 1;
      }
      
      .renewal-link-field a {
        padding: 8px 12px;
        background: #007bff;
        color: white;
        text-decoration: none;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
      }
      
      .renewal-link-field a:hover {
        background: #0056b3;
      }
      
      /* Additional styles for improved edit modal */
      .vespa-form-group small {
        display: block;
        margin-top: 2px;
        font-size: 12px;
        color: #6c757d;
      }
      
      .renewal-edit-section + .renewal-edit-section {
        margin-top: 20px;
      }
      
      #edit-override-total {
        margin-right: 6px;
      }
      
      #calculated-total-info {
        font-size: 12px;
        line-height: 1.3;
      }
      
      /* Style for product selection section */
      .renewal-edit-section[style*="background: #e3f2fd"] select {
        border: 2px solid #1976d2;
      }
      
      /* Improved spacing for form sections */
      .renewal-modal-content form {
        overflow-y: auto;
        max-height: calc(90vh - 120px);
      }
      
      /* Better visual hierarchy */
      .renewal-edit-section h4 {
        border-bottom: 2px solid #dee2e6;
        padding-bottom: 8px;
        margin-bottom: 20px;
      }
      
      /* Responsive grid for smaller screens */
      @media (max-width: 768px) {
        .renewal-form-row.cols-2,
        .renewal-form-row.cols-3,
        .renewal-form-row.cols-4 {
          grid-template-columns: 1fr;
        }
      }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.id = 'vespa-renewal-styles-v1d';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  /**
   * Show the main renewal interface
   */
  async function showRenewalInterface() {
    debugLog('Showing renewal interface');
    
    // Create modal
    const modal = createRenewalModal();
    document.body.appendChild(modal);
    renewalState.currentModal = modal;
    
    // Load initial data
    await loadRenewalData();
  }

  /**
   * Create the renewal modal structure
   */
  function createRenewalModal() {
    const modal = document.createElement('div');
    modal.className = 'renewal-modal';
    modal.innerHTML = `
      <div class="renewal-modal-content">
        <div class="renewal-header">
          <h2>Renewal Management System</h2>
          <button class="vespa-button secondary small-button" onclick="VESPARenewals.close()">× Close</button>
        </div>
        
        <div class="renewal-filters">
          <div class="filter-group">
            <label>Date Range:</label>
            <select id="renewal-date-filter" onchange="VESPARenewals.applyFilters()">
              <option value="all">All renewals</option>
              <option value="overdue">Overdue</option>
              <option value="upcoming_30">Next 30 days</option>
              <option value="upcoming_60">Next 60 days</option>
              <option value="upcoming_90">Next 90 days</option>
            </select>
          </div>
          
          <div class="filter-group">
            <label>Status:</label>
            <select id="renewal-status-filter" onchange="VESPARenewals.applyFilters()">
              <option value="all">All statuses</option>
              <option value="Pending">Pending</option>
              <option value="Estimate Sent">Estimate Sent</option>
              <option value="Invoice Sent">Invoice Sent</option>
              <option value="Paid">Paid</option>
              <option value="Renewed">Renewed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          
          <div class="filter-group">
            <input type="text" id="renewal-search" placeholder="Search by customer name..." 
                   onkeyup="VESPARenewals.applyFilters()" style="width: 250px;">
          </div>
          
          <button class="vespa-button secondary small-button" onclick="VESPARenewals.refresh()">
            🔄 Refresh
          </button>
          
          <div style="margin-left: auto;">
            <span id="renewal-count">0 renewals</span>
          </div>
        </div>
        
        <div class="renewal-table-container" id="renewal-table-container">
          <div class="renewal-loading">Loading renewal data...</div>
        </div>
        
        <div class="renewal-actions">
          <div class="renewal-bulk-actions">
            <span id="selected-count">0 selected</span>
            <button id="generate-estimates-btn" class="vespa-button primary small-button" 
                    onclick="VESPARenewals.generateEstimates()" disabled>
              Generate Estimates
            </button>
            <button id="send-reminders-btn" class="vespa-button secondary small-button" 
                    onclick="VESPARenewals.sendReminders()" disabled>
              Send Reminders
            </button>
            <button id="process-renewals-btn" class="vespa-button" 
                    onclick="VESPARenewals.processSelected()" disabled>
              Process Renewals
            </button>
          </div>
        </div>
      </div>
    `;
    
    return modal;
  }

  /**
   * Load renewal data from the API with improved error handling
   */
  async function loadRenewalData() {
    renewalState.isLoading = true;
    updateTableDisplay();
    
    try {
      // Calculate date range based on filter
      const dateFilter = document.getElementById('renewal-date-filter')?.value || renewalState.filters.dateRange;
      const statusFilter = document.getElementById('renewal-status-filter')?.value || renewalState.filters.status;
      
      // Update state with current filter values
      renewalState.filters.dateRange = dateFilter;
      renewalState.filters.status = statusFilter;
      
      const filters = buildDateFilters(dateFilter);
      
      // Add status filter if not "all"
      if (statusFilter && statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      
      debugLog('Loading renewal data with filters:', filters);
      
      // Get the API URL
      const apiUrl = RENEWAL_CONFIG.apiUrl;
      
      // Ensure the URL is properly formatted
      if (!apiUrl || !apiUrl.startsWith('http')) {
        throw new Error(`Invalid API URL: ${apiUrl}`);
      }
      
      const fullUrl = new URL('renewals/list', apiUrl).href;
      debugLog('Full request URL:', fullUrl);
      
      // Set a timeout for the request
      const timeoutDuration = 30000; // 30 seconds
      let timeoutId;
      
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Request timed out after 30 seconds'));
        }, timeoutDuration);
      });
      
      const requestPromise = $.ajax({
        url: fullUrl,
        type: 'GET',
        data: {
          ...filters,
          includeCustomerDetails: true
        },
        xhrFields: { withCredentials: true },
        crossDomain: true
      });
      
      // Race between the request and timeout
      const response = await Promise.race([requestPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      
      if (response.success) {
        renewalState.orders = response.orders || [];
        renewalState.loadAttempts = 0; // Reset attempts on success
        
        // Process orders to extract emails properly
        renewalState.orders = renewalState.orders.map(order => {
          return {
            ...order,
            staffAdminEmail: extractEmail(order.staffAdminEmail),
            financeEmail: extractEmail(order.financeEmail),
            staffAdminName: extractPersonName(order.staffAdminName),
            product: order.product || 'Coaching Portal', // Default to Coaching Portal if not set
            // Extract currency values properly
            rate: extractCurrencyValue(order.rate),
            total: extractCurrencyValue(order.total),
            discount: extractCurrencyValue(order.discount),
            addonsCost: extractCurrencyValue(order.addonsCost)
          };
        });
        
        debugLog(`Loaded ${renewalState.orders.length} renewal orders`, null, 'success');
        updateTableDisplay();
        updateCounts();
      } else {
        throw new Error(response.message || 'Failed to load renewal data');
      }
      
    } catch (error) {
      renewalState.loadAttempts++;
      debugLog('Error loading renewal data:', error, 'error');
      
      if (renewalState.loadAttempts < renewalState.maxLoadAttempts) {
        debugLog(`Retrying... (attempt ${renewalState.loadAttempts + 1} of ${renewalState.maxLoadAttempts})`);
        setTimeout(() => loadRenewalData(), 2000); // Retry after 2 seconds
      } else {
        showError('Failed to load renewal data after multiple attempts. Please check your connection and try again.');
        renewalState.loadAttempts = 0; // Reset for next manual attempt
      }
    } finally {
      renewalState.isLoading = false;
    }
  }

  /**
   * Build date filters based on selection
   */
  function buildDateFilters(dateRange) {
    const today = new Date();
    const filters = {};
    
    debugLog('Building date filters for:', dateRange);
    
    switch (dateRange) {
      case 'overdue':
        filters.renewalDateEnd = today.toISOString().split('T')[0];
        filters.excludePaid = true;
        break;
      case 'upcoming_30':
        filters.renewalDateStart = today.toISOString().split('T')[0];
        filters.renewalDateEnd = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'upcoming_60':
        filters.renewalDateStart = today.toISOString().split('T')[0];
        filters.renewalDateEnd = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'upcoming_90':
        filters.renewalDateStart = today.toISOString().split('T')[0];
        filters.renewalDateEnd = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        break;
      case 'all':
      default:
        // No date filters for "all"
        break;
    }
    
    debugLog('Date filters built:', filters);
    return filters;
  }

  /**
   * Update the table display with current data
   */
  function updateTableDisplay() {
    const container = document.getElementById('renewal-table-container');
    if (!container) return;
    
    if (renewalState.isLoading) {
      container.innerHTML = '<div class="renewal-loading">Loading renewal data...</div>';
      return;
    }
    
    // Apply filters
    const filteredOrders = applyLocalFilters(renewalState.orders);
    
    if (filteredOrders.length === 0) {
      container.innerHTML = `
        <div class="renewal-empty">
          <h3>No renewals found</h3>
          <p>Try adjusting your filters or date range.</p>
        </div>
      `;
      return;
    }
    
    // Build table
    let tableHtml = `
      <table class="renewal-table">
        <thead>
          <tr>
            <th style="width: 40px;">
              <input type="checkbox" class="renewal-checkbox" id="select-all-renewals" 
                     onchange="VESPARenewals.toggleSelectAll()">
            </th>
            <th>Customer</th>
            <th>Order #</th>
            <th>Product</th>
            <th>Renewal Date</th>
            <th>Quantity</th>
            <th>Total</th>
            <th>Status</th>
            <th>PO Number</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    filteredOrders.forEach(order => {
      // Use formatDate to handle the object format
      const formattedRenewalDate = formatDate(order.renewalDate);
      const renewalDate = order.renewalDate && order.renewalDate.unix_timestamp 
        ? new Date(order.renewalDate.unix_timestamp)
        : new Date(order.renewalDate);
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let dateBadge = '';
      if (!isNaN(renewalDate.getTime())) {
        renewalDate.setHours(0, 0, 0, 0);
        const daysUntil = Math.floor((renewalDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntil < 0) {
          dateBadge = `<span class="renewal-date-badge overdue">${Math.abs(daysUntil)} days overdue</span>`;
        } else if (daysUntil <= 7) {
          dateBadge = `<span class="renewal-date-badge soon">${daysUntil} days</span>`;
        } else if (daysUntil <= 30) {
          dateBadge = `<span class="renewal-date-badge upcoming">${daysUntil} days</span>`;
        }
      }
      
      // Format status for CSS class
      const statusClass = (order.status || 'Pending').toLowerCase().replace(/\s+/g, '_');
      
      tableHtml += `
        <tr data-order-id="${order.id}">
          <td>
            <input type="checkbox" class="renewal-checkbox" value="${order.id}" 
                   onchange="VESPARenewals.updateSelection()">
          </td>
          <td>
            <strong>${order.customerName || 'Unknown'}</strong><br>
            <small>${order.staffAdminEmail || order.customerEmail || ''}</small>
          </td>
          <td>${order.orderNumber || '-'}</td>
          <td>${order.product || 'Coaching Portal'}</td>
          <td>
            ${formattedRenewalDate}
            ${dateBadge}
          </td>
          <td>${order.quantity || 0}</td>
          <td><strong>£${parseFloat(order.total || 0).toFixed(2)}</strong></td>
          <td>
            <span class="renewal-status ${statusClass}">
              ${order.status || 'Pending'}
            </span>
          </td>
          <td>${order.poNumber || '-'}</td>
          <td>
            <button class="renewal-edit-btn" onclick="VESPARenewals.editOrder('${order.id}')">
              Edit
            </button>
          </td>
        </tr>
      `;
    });
    
    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
  }

  /**
   * Apply local filters to the orders
   */
  function applyLocalFilters(orders) {
    let filtered = [...orders];
    
    // Search filter
    const searchTerm = document.getElementById('renewal-search')?.value?.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(order => {
        const searchableFields = {
          customerName: order.customerName || '',
          customerEmail: order.customerEmail || '',
          staffAdminEmail: order.staffAdminEmail || '',
          orderNumber: order.orderNumber || '',
          financeName: order.financeName || '',
          financeEmail: order.financeEmail || '',
          poNumber: order.poNumber || ''
        };
        
        const searchString = Object.values(searchableFields)
          .map(value => value.toString().toLowerCase())
          .join(' ');
        
        return searchString.includes(searchTerm);
      });
    }
    
    // Sort by renewal date
    filtered.sort((a, b) => {
      const dateA = a.renewalDate?.unix_timestamp || 0;
      const dateB = b.renewalDate?.unix_timestamp || 0;
      return dateA - dateB;
    });
    
    return filtered;
  }

  /**
   * Show edit modal for a single order with ALL fields - IMPROVED VERSION
   */
  function showEditModal(order) {
    const modal = document.createElement('div');
    modal.className = 'renewal-modal';
    modal.style.zIndex = '10001';
    
    // Format dates for input fields
    const renewalDate = formatDateForInput(order.renewalDate);
    const orderDate = formatDateForInput(order.orderDate);
    const paymentDue = formatDateForInput(order.paymentDue);
    const setupDate = formatDateForInput(order.setupDate);
    const lastReminderSent = formatDateForInput(order.lastReminderSent);
    
    // Extract field values properly
    const staffAdminEmail = extractEmail(order.staffAdminEmail);
    const financeEmail = extractEmail(order.financeEmail);
    const secondaryEmail = extractEmail(order.secondaryEmail);
    const staffAdminName = extractPersonName(order.staffAdminName);
    const secondaryContactName = extractPersonName(order.secondaryContact);
    const address = formatAddress(order.address);
    
    // Extract currency values properly
    const rate = extractCurrencyValue(order.rate);
    const total = extractCurrencyValue(order.total);
    const discount = extractCurrencyValue(order.discount);
    const addonsCost = extractCurrencyValue(order.addonsCost);
    const quantity = order.quantity || 0;
    
    modal.innerHTML = `
      <div class="renewal-modal-content" style="width: 950px; height: auto; max-height: 90vh; overflow-y: auto;">
        <div class="renewal-header">
          <h3>Edit Renewal - ${order.customerName || 'Unknown Customer'}</h3>
          <button class="vespa-button secondary small-button" onclick="this.closest('.renewal-modal').remove()">× Close</button>
        </div>
        
        <form id="edit-renewal-form" style="padding: 20px;">
          <!-- Product Selection - TOP PRIORITY -->
          <div class="renewal-edit-section" style="background: #e3f2fd; border: 2px solid #1976d2; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h4 style="margin-top: 0; color: #1976d2;">Product Selection</h4>
            
            <div class="vespa-form-group">
              <label style="font-weight: bold; font-size: 16px;">Product Type: <span style="color: #dc3545;">*</span></label>
              <select id="edit-product" name="product" onchange="VESPARenewals.updateProductFields()" style="font-size: 16px; padding: 10px;">
                <option value="Coaching Portal" ${order.product === 'Coaching Portal' ? 'selected' : ''}>Coaching Portal</option>
                <option value="Resource Portal" ${order.product === 'Resource Portal' ? 'selected' : ''}>Resource Portal</option>
                <option value="Training" ${order.product === 'Training' ? 'selected' : ''}>Training</option>
              </select>
            </div>
          </div>
          
          <!-- Product Details Section -->
          <div class="renewal-edit-section">
            <h4>Product Details & Pricing</h4>
            
            <div class="renewal-form-row cols-3">
              <div class="vespa-form-group">
                <label id="quantity-label">Quantity:</label>
                <input type="number" id="edit-quantity" name="quantity" value="${quantity}" 
                       onchange="VESPARenewals.calculateEditTotal()" min="0">
              </div>
              
              <div class="vespa-form-group">
                <label id="rate-label">Rate (£):</label>
                <input type="number" id="edit-rate" name="rate" value="${rate}" step="0.01"
                       onchange="VESPARenewals.calculateEditTotal()" min="0">
              </div>
              
              <div class="vespa-form-group">
                <label>Discount (%):</label>
                <input type="number" id="edit-discount" name="discount" value="${discount}" 
                       min="0" max="100" onchange="VESPARenewals.calculateEditTotal()">
                <small style="color: #666;">Enter percentage (0-100)</small>
              </div>
            </div>
            
            <div class="renewal-form-row cols-2">
              <div class="vespa-form-group">
                <label>Add-ons:</label>
                <select id="edit-addons" name="addons" onchange="VESPARenewals.calculateEditTotal()">
                  <option value="">-- No Add-ons --</option>
                  <option value="Student Session" ${order.addons === 'Student Session' ? 'selected' : ''}>Student Session</option>
                  <option value="Staff Session" ${order.addons === 'Staff Session' ? 'selected' : ''}>Staff Session</option>
                  <option value="Additional Staff Accounts" ${order.addons === 'Additional Staff Accounts' ? 'selected' : ''}>Additional Staff Accounts</option>
                  <option value="Additional Student Accounts" ${order.addons === 'Additional Student Accounts' ? 'selected' : ''}>Additional Student Accounts</option>
                  <option value="Deep Dive Consultation" ${order.addons === 'Deep Dive Consultation' ? 'selected' : ''}>Deep Dive Consultation</option>
                  <option value="Other" ${order.addons === 'Other' ? 'selected' : ''}>Other</option>
                  <option value="Free Portal Training" ${order.addons === 'Free Portal Training' ? 'selected' : ''}>Free Portal Training</option>
                </select>
              </div>
              
              <div class="vespa-form-group">
                <label>Add-ons Cost (£):</label>
                <input type="number" id="edit-addons-cost" name="addonsCost" value="${addonsCost}" 
                       step="0.01" min="0" onchange="VESPARenewals.calculateEditTotal()">
              </div>
            </div>
            
            <div class="renewal-form-row cols-3">
              <div class="vespa-form-group">
                <label>VAT Chargeable:</label>
                <select id="edit-vat" name="vatChargeable" onchange="VESPARenewals.calculateEditTotal()">
                  <option value="Yes" ${order.vatChargeable === 'Yes' ? 'selected' : ''}>Yes (20%)</option>
                  <option value="No" ${order.vatChargeable === 'No' ? 'selected' : ''}>No</option>
                </select>
              </div>
              
              <div class="vespa-form-group">
                <label>Trust School:</label>
                <select id="edit-trust-school" name="trustSchool">
                  <option value="Yes" ${order.trustSchool === 'Yes' ? 'selected' : ''}>Yes</option>
                  <option value="No" ${order.trustSchool === 'No' ? 'selected' : ''}>No</option>
                </select>
              </div>
              
              <div class="vespa-form-group">
                <label>Total (£):</label>
                <div style="position: relative;">
                  <input type="number" id="edit-total" name="total" value="${total.toFixed(2)}" 
                         step="0.01" style="font-weight: bold; font-size: 16px; background: #fffde7;">
                  <div style="margin-top: 5px;">
                    <label style="font-size: 12px;">
                      <input type="checkbox" id="edit-override-total" onchange="VESPARenewals.toggleTotalOverride()">
                      Override calculated total
                    </label>
                  </div>
                </div>
                <small id="calculated-total-info" style="color: #666; display: block; margin-top: 5px;"></small>
              </div>
            </div>
          </div>
          
          <!-- Order Information Section -->
          <div class="renewal-edit-section">
            <h4>Order Information</h4>
            
            <div class="renewal-form-row cols-3">
              <div class="vespa-form-group">
                <label>Order Number:</label>
                <input type="text" value="${order.orderNumber || ''}" readonly>
              </div>
              
              <div class="vespa-form-group">
                <label>Status:</label>
                <select id="edit-status" name="status">
                  ${Object.entries(RENEWAL_CONFIG.statusOptions).map(([value, label]) => 
                    `<option value="${value}" ${order.status === value ? 'selected' : ''}>${label}</option>`
                  ).join('')}
                </select>
              </div>
              
              <div class="vespa-form-group">
                <label>PO Number:</label>
                <input type="text" id="edit-po-number" name="poNumber" value="${order.poNumber || ''}">
              </div>
            </div>
            
            <div class="renewal-form-row cols-2">
              <div class="vespa-form-group">
                <label>Invoice Number:</label>
                <input type="text" id="edit-invoice-number" name="invoiceNumber" value="${order.invoiceNumber || ''}">
              </div>
              
              <div class="vespa-form-group">
                <label>Settled:</label>
                <select id="edit-settled" name="settled">
                  <option value="Yes" ${order.settled === 'Yes' ? 'selected' : ''}>Yes</option>
                  <option value="No" ${order.settled === 'No' ? 'selected' : ''}>No</option>
                </select>
              </div>
            </div>
          </div>
          
          <!-- Important Dates Section -->
          <div class="renewal-edit-section">
            <h4>Important Dates</h4>
            
            <div class="renewal-form-row cols-2">
              <div class="vespa-form-group">
                <label>Order Date:</label>
                <input type="date" id="edit-order-date" name="orderDate" value="${orderDate}">
              </div>
              
              <div class="vespa-form-group">
                <label>Set-Up Date:</label>
                <input type="date" id="edit-setup-date" name="setupDate" value="${setupDate}">
              </div>
            </div>
            
            <div class="renewal-form-row cols-3">
              <div class="vespa-form-group">
                <label>Renewal Date: <span style="color: #dc3545;">*</span></label>
                <input type="date" id="edit-renewal-date" name="renewalDate" value="${renewalDate}" required>
              </div>
              
              <div class="vespa-form-group">
                <label>Payment Due:</label>
                <input type="date" id="edit-payment-due" name="paymentDue" value="${paymentDue}">
              </div>
              
              <div class="vespa-form-group">
                <label>Last Reminder Sent:</label>
                <input type="date" id="edit-last-reminder" name="lastReminderSent" value="${lastReminderSent}">
              </div>
            </div>
          </div>
          
          
          <!-- Contact Information Section -->
          <div class="renewal-edit-section">
            <h4>Contact Information</h4>
            
            <div class="renewal-form-row cols-2">
              <div class="vespa-form-group">
                <label>Staff Admin Name:</label>
                <input type="text" value="${staffAdminName}" readonly>
              </div>
              
              <div class="vespa-form-group">
                <label>Staff Admin Email:</label>
                <input type="email" value="${staffAdminEmail}" readonly>
              </div>
            </div>
            
            <div class="renewal-form-row cols-2">
              <div class="vespa-form-group">
                <label>Finance Contact:</label>
                <input type="text" id="edit-finance-name" name="financeName" value="${order.financeName || ''}">
              </div>
              
              <div class="vespa-form-group">
                <label>Finance Email:</label>
                <input type="email" id="edit-finance-email" name="financeEmail" value="${financeEmail}">
              </div>
            </div>
            
            <div class="renewal-form-row cols-2">
              <div class="vespa-form-group">
                <label>Secondary Contact:</label>
                <input type="text" id="edit-secondary-contact" name="secondaryContact" value="${secondaryContactName}">
              </div>
              
              <div class="vespa-form-group">
                <label>Secondary Email:</label>
                <input type="email" id="edit-secondary-email" name="secondaryEmail" value="${secondaryEmail}">
              </div>
            </div>
            
            <div class="vespa-form-group">
              <label>Address:</label>
              <textarea id="edit-address" name="address" rows="3">${address}</textarea>
            </div>
          </div>
          
          <!-- Links Section -->
          <div class="renewal-edit-section">
            <h4>Documents & Links</h4>
            
            <div class="renewal-form-row cols-1">
              <div class="vespa-form-group">
                <label>Invoice Link: <small style="color: #666;">(Optional - leave blank if not available)</small></label>
                <div class="renewal-link-field">
                  <input type="url" id="edit-invoice-link" name="invoiceLink" value="${order.invoiceLink || ''}" placeholder="https://...">
                  ${order.invoiceLink ? `<a href="${order.invoiceLink}" target="_blank" style="margin-left: 10px;">View Invoice</a>` : ''}
                </div>
              </div>
              
              <div class="vespa-form-group">
                <label>Estimate Link: <small style="color: #666;">(Optional - leave blank if not available)</small></label>
                <div class="renewal-link-field">
                  <input type="url" id="edit-estimate-link" name="estimateLink" value="${order.estimateLink || ''}" placeholder="https://...">
                  ${order.estimateLink ? `<a href="${order.estimateLink}" target="_blank" style="margin-left: 10px;">View Estimate</a>` : ''}
                </div>
              </div>
            </div>
          </div>
          
          <div style="margin-top: 20px; text-align: right; padding: 20px; background: #f8f9fa; border-radius: 6px;">
            <button type="button" class="vespa-button secondary" onclick="this.closest('.renewal-modal').remove()">
              Cancel
            </button>
            <button type="submit" class="vespa-button primary">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add form submit handler
    document.getElementById('edit-renewal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      await saveOrderChanges(order.id, new FormData(e.target));
    });
    
    // Store order data for calculations
    window.currentEditOrder = order;
    
    // Initialize product fields
    setTimeout(() => {
      VESPARenewals.updateProductFields();
      VESPARenewals.calculateEditTotal();
    }, 0);
  }

  /**
   * Calculate total for edit form
   */
  function calculateEditTotal() {
    // Don't calculate if override is checked
    const overrideChecked = document.getElementById('edit-override-total')?.checked;
    if (overrideChecked) {
      return;
    }
    
    const quantity = parseFloat(document.getElementById('edit-quantity')?.value || 0);
    const rate = parseFloat(document.getElementById('edit-rate')?.value || 0);
    const discount = parseFloat(document.getElementById('edit-discount')?.value || 0);
    const addonsCost = parseFloat(document.getElementById('edit-addons-cost')?.value || 0);
    const vat = document.getElementById('edit-vat')?.value === 'Yes';
    
    // Formula: ((Quantity × Rate + Addons) × (1 - discount/100)) × (VAT ? 1.2 : 1)
    let subtotal = quantity * rate + addonsCost;
    let discountAmount = subtotal * (discount / 100);
    let afterDiscount = subtotal - discountAmount;
    let vatAmount = vat ? afterDiscount * 0.20 : 0;
    let total = afterDiscount + vatAmount;
    
    document.getElementById('edit-total').value = total.toFixed(2);
    
    // Update the info text to show calculation breakdown
    const infoElement = document.getElementById('calculated-total-info');
    if (infoElement) {
      let breakdown = `Base: £${(quantity * rate).toFixed(2)}`;
      if (addonsCost > 0) {
        breakdown += ` + Add-ons: £${addonsCost.toFixed(2)}`;
      }
      if (discount > 0) {
        breakdown += ` - ${discount}% discount`;
      }
      if (vat) {
        breakdown += ` + 20% VAT`;
      }
      infoElement.textContent = breakdown;
    }
  }

  /**
   * Update product fields based on selected product
   */
  function updateProductFields() {
    const product = document.getElementById('edit-product')?.value;
    const quantityLabel = document.getElementById('quantity-label');
    const rateLabel = document.getElementById('rate-label');
    
    if (!quantityLabel || !rateLabel) return;
    
    switch(product) {
      case 'Coaching Portal':
        quantityLabel.textContent = 'Student Logins:';
        rateLabel.textContent = 'Cost per Student (£):';
        break;
      case 'Resource Portal':
        quantityLabel.textContent = 'Staff Accounts:';
        rateLabel.textContent = 'Cost per Staff (£):';
        break;
      case 'Training':
        quantityLabel.textContent = 'Number of Sessions:';
        rateLabel.textContent = 'Cost per Session (£):';
        break;
      default:
        quantityLabel.textContent = 'Quantity:';
        rateLabel.textContent = 'Rate (£):';
    }
  }
  
  /**
   * Toggle total override functionality
   */
  function toggleTotalOverride() {
    const overrideCheckbox = document.getElementById('edit-override-total');
    const totalField = document.getElementById('edit-total');
    const infoElement = document.getElementById('calculated-total-info');
    
    if (overrideCheckbox?.checked) {
      // Make total field editable
      totalField.removeAttribute('readonly');
      totalField.style.background = '#fff';
      totalField.style.border = '2px solid #ff9800';
      if (infoElement) {
        infoElement.textContent = 'Manual override enabled - enter custom total';
        infoElement.style.color = '#ff9800';
      }
    } else {
      // Make total field readonly and recalculate
      totalField.setAttribute('readonly', 'readonly');
      totalField.style.background = '#fffde7';
      totalField.style.border = '';
      if (infoElement) {
        infoElement.style.color = '#666';
      }
      calculateEditTotal();
    }
  }

  /**
   * Toggle new order mode in edit form
   */
  function toggleNewOrderMode(isNewOrder) {
    if (isNewOrder) {
      // Set dates to new values
      const today = new Date();
      const oneYearFromNow = new Date(today);
      oneYearFromNow.setFullYear(today.getFullYear() + 1);
      const thirtyDaysFromNow = new Date(today);
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      
      document.getElementById('edit-order-date').value = formatDateForInput(today);
      document.getElementById('edit-setup-date').value = formatDateForInput(today);
      document.getElementById('edit-renewal-date').value = formatDateForInput(oneYearFromNow);
      document.getElementById('edit-payment-due').value = formatDateForInput(thirtyDaysFromNow);
      
      // Change status to Pending
      document.getElementById('edit-status').value = 'Pending';
      
      // Show alert
      showSuccess('Dates have been updated for new order. You can still modify them if needed.');
    } else {
      // Restore original dates if unchecked
      const order = window.currentEditOrder;
      if (order) {
        // Only set values if the dates exist
        if (order.orderDate) {
          document.getElementById('edit-order-date').value = formatDateForInput(order.orderDate);
        }
        if (order.setupDate) {
          document.getElementById('edit-setup-date').value = formatDateForInput(order.setupDate);
        }
        if (order.renewalDate) {
          document.getElementById('edit-renewal-date').value = formatDateForInput(order.renewalDate);
        }
        if (order.paymentDue) {
          document.getElementById('edit-payment-due').value = formatDateForInput(order.paymentDue);
        }
        document.getElementById('edit-status').value = order.status || 'Pending';
      }
    }
  }

  /**
   * Save order changes - now handling all fields
   */
  async function saveOrderChanges(orderId, formData) {
    try {
      // Build update data object with all fields
      const data = {};
      
      // Process each form field
      for (let [key, value] of formData.entries()) {
        // Skip empty values for optional fields (but not for numeric fields)
        if (value !== '' || ['quantity', 'rate', 'discount', 'total', 'addonsCost'].includes(key)) {
          // Convert numeric fields
          if (['quantity', 'rate', 'discount', 'total', 'addonsCost'].includes(key)) {
            data[key] = parseFloat(value) || 0;
          } else {
            data[key] = value;
          }
        }
      }
      
      debugLog('Saving order changes:', data);
      
      const updateUrl = new URL(`renewals/update/${orderId}`, RENEWAL_CONFIG.apiUrl).href;
      
      const response = await $.ajax({
        url: updateUrl,
        type: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(data),
        xhrFields: { withCredentials: true },
        crossDomain: true
      });
      
      if (response.success) {
        if (response.isNewOrder) {
          showSuccess('New order created successfully');
        } else {
          showSuccess('Order updated successfully');
        }
        document.querySelector('.renewal-modal[style*="10001"]')?.remove();
        await loadRenewalData();
      } else {
        throw new Error(response.message || 'Failed to update order');
      }
      
    } catch (error) {
      debugLog('Error saving order:', error, 'error');
      showError('Failed to save changes: ' + error.message);
    }
  }

  /**
   * Process selected renewals
   */
  async function processSelectedRenewals() {
    const selectedIds = getSelectedOrderIds();
    if (selectedIds.length === 0) {
      showError('Please select at least one renewal to process');
      return;
    }
    
    // Show processing options modal
    showProcessingModal(selectedIds);
  }
  
  /**
   * Toggle renewal amount field visibility
   */
  function toggleRenewalAmountField() {
    const action = document.querySelector('input[name="renewal-action"]:checked')?.value;
    const amountSection = document.getElementById('renewal-amount-section');
    
    if (amountSection) {
      // Show for estimate and reminder, hide for invoice and cancel
      amountSection.style.display = (action === 'estimate' || action === 'reminder') ? 'block' : 'none';
    }
  }

  /**
   * Show the processing options modal
   */
  function showProcessingModal(orderIds) {
    const modal = document.createElement('div');
    modal.className = 'renewal-modal';
    modal.style.zIndex = '10001';
    
    modal.innerHTML = `
      <div class="renewal-modal-content" style="width: 600px; height: auto;">
        <div class="renewal-header">
          <h3>Process ${orderIds.length} Renewal${orderIds.length > 1 ? 's' : ''}</h3>
          <button class="vespa-button secondary small-button" onclick="this.closest('.renewal-modal').remove()">× Close</button>
        </div>
        
        <div style="padding: 20px;">
          <div class="vespa-form-group">
            <label>
              <input type="radio" name="renewal-action" value="estimate" checked 
                onchange="VESPARenewals.toggleRenewalAmountField()">
              Generate and Send Estimates (6-week reminder)
            </label>
          </div>
          
          <div class="vespa-form-group">
            <label>
              <input type="radio" name="renewal-action" value="reminder"
                onchange="VESPARenewals.toggleRenewalAmountField()">
              Send Reminder Emails (3-week reminder)
            </label>
          </div>
          
          <div class="vespa-form-group">
            <label>
              <input type="radio" name="renewal-action" value="invoice"
                onchange="VESPARenewals.toggleRenewalAmountField()">
              Generate Invoices and Send Welcome Emails
            </label>
          </div>
          
          <div class="vespa-form-group" style="margin-top: 25px; padding: 15px; border: 2px solid #dc3545; border-radius: 6px; background-color: #fff5f5;">
            <label style="color: #dc3545; font-weight: bold;">
              <input type="radio" name="renewal-action" value="cancel"
                onchange="VESPARenewals.toggleRenewalAmountField()">
              ⚠️ Cancel Account - Permanently deactivate all user accounts
            </label>
            <p style="margin: 10px 0 0 22px; font-size: 13px; color: #721c24; line-height: 1.4;">
              This will immediately deactivate ALL staff and student accounts associated with this subscription. This action cannot be easily undone.
            </p>
          </div>
          
          <div class="vespa-form-group" style="margin-top: 20px;">
            <label>
              <input type="checkbox" id="auto-update-status" checked>
              Automatically update order status after sending
            </label>
          </div>
          
          <div class="vespa-form-group">
            <label>
              <input type="checkbox" id="bcc-admin" checked>
              Send a copy to admin@vespa.academy (BCC)
            </label>
          </div>
          
          <div class="vespa-form-group" id="renewal-amount-section" style="display: none;">
            <label>Renewal Amount (£):</label>
            <input type="number" id="renewal-amount-override" step="0.01" min="0" 
              style="width: 150px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <p style="margin: 5px 0 0 0; font-size: 12px; color: #666;">
              Leave blank to use the existing order total, or enter a custom amount for the email
            </p>
          </div>
          
          <div class="vespa-form-group">
            <label>Additional Notes (optional):</label>
            <textarea id="renewal-notes" style="width: 100%; height: 60px;"></textarea>
          </div>
          
          <div style="margin-top: 20px; text-align: right;">
            <button class="vespa-button secondary" onclick="this.closest('.renewal-modal').remove()">
              Cancel
            </button>
            <button class="vespa-button primary" onclick="VESPARenewals.executeProcessing('${orderIds.join(',')}')">
              Process Renewals
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Initialize field visibility based on default selection
    setTimeout(() => {
      VESPARenewals.toggleRenewalAmountField();
    }, 0);
  }

  /**
   * Execute the renewal processing
   */
  async function executeProcessing(orderIdsString) {
    const orderIds = orderIdsString.split(',');
    const action = document.querySelector('input[name="renewal-action"]:checked')?.value;
    const autoUpdateStatus = document.getElementById('auto-update-status')?.checked;
    const bccAdmin = document.getElementById('bcc-admin')?.checked;
    const notes = document.getElementById('renewal-notes')?.value;
    const renewalAmountOverride = document.getElementById('renewal-amount-override')?.value;
    
    if (!action) {
      showError('Please select an action');
      return;
    }
    
    // Special handling for invoice generation
    if (action === 'invoice') {
      let confirmMessage;
      
      if (orderIds.length > 1) {
        confirmMessage = `⚠️ IMPORTANT: You are about to generate ${orderIds.length} new renewal orders.\n\n` +
                        `Each new order will be created as a copy of the current order with:\n` +
                        `• Order Date: Today\n` +
                        `• Setup Date: Today\n` +
                        `• Renewal Date: 1 year from today\n` +
                        `• Payment Due: 30 days from today\n\n` +
                        `The new orders will replicate all details from the current orders.\n\n` +
                        `If you need to change any details (e.g., quantity, price, or add the QuickBooks invoice URL), ` +
                        `please EDIT THE CURRENT ORDERS NOW before proceeding.\n\n` +
                        `Remember to include the QuickBooks invoice URL in the current order - it will be copied to the new order.\n\n` +
                        `Do you want to continue?`;
      } else {
        // Single order - still show a reminder about the invoice URL
        const order = renewalState.orders.find(o => o.id === orderIds[0]);
        confirmMessage = `📋 Creating new renewal order for ${order?.customerName || 'this customer'}.\n\n` +
                        `A new order will be created with:\n` +
                        `• Order Date: Today\n` +
                        `• Renewal Date: 1 year from today\n` +
                        `• Payment Due: 30 days from today\n\n` +
                        `⚠️ IMPORTANT: Make sure you've added the QuickBooks invoice URL to the current order.\n` +
                        `It will be copied to the new order and removed from the old one.\n\n` +
                        `Continue?`;
      }
      
      if (!confirm(confirmMessage)) {
        return;
      }
    }
    
    // Special handling for cancellation - require confirmation
    if (action === 'cancel') {
      // Get the order details for confirmation
      const order = renewalState.orders.find(o => o.id === orderIds[0]);
      const customerName = order?.customerName || 'this customer';
      
      const confirmMessage = `⚠️ WARNING: You are about to CANCEL the subscription for ${customerName}.\n\n` +
                           `This will:\n` +
                           `• Change the order status to "Cancelled"\n` +
                           `• Mark the customer account as "Cancelled"\n` +
                           `• IMMEDIATELY deactivate ALL staff and student accounts\n` +
                           `• Send a cancellation confirmation email\n\n` +
                           `This action cannot be easily undone.\n\n` +
                           `Are you absolutely sure you want to proceed?`;
      
      if (!confirm(confirmMessage)) {
        return;
      }
      
      // Second confirmation for extra safety
      const secondConfirm = prompt(`Type "CANCEL ${customerName.toUpperCase()}" to confirm the cancellation:`);
      if (secondConfirm !== `CANCEL ${customerName.toUpperCase()}`) {
        showError('Cancellation aborted - confirmation text did not match');
        return;
      }
    }
    
    debugLog(`Processing ${orderIds.length} renewals with action: ${action}`);
    
    // Close the options modal
    document.querySelector('.renewal-modal[style*="10001"]')?.remove();
    
    // Show progress
    showProgress('Processing renewals...', 0, orderIds.length);
    
    try {
      const results = {
        success: 0,
        failed: 0,
        errors: []
      };
      
      // Process each order
      for (let i = 0; i < orderIds.length; i++) {
        const orderId = orderIds[i];
        updateProgress(`Processing order ${i + 1} of ${orderIds.length}...`, i + 1, orderIds.length);
        
        try {
          const processUrl = new URL('renewals/process', RENEWAL_CONFIG.apiUrl).href;
          
          // For invoice action, we might need to confirm no invoice
          let confirmNoInvoice = false;
          
          if (action === 'invoice') {
            // Check if this order has an invoice link
            const order = renewalState.orders.find(o => o.id === orderId);
            if (order && !order.invoiceLink) {
              // Ask for confirmation if no invoice link
              const confirmMsg = `Order #${order.orderNumber} for ${order.customerName || 'this customer'} does not have an invoice link.\n\nThe welcome email will be sent without an invoice attached.\n\nDo you wish to continue?`;
              
              if (!confirm(confirmMsg)) {
                results.failed++;
                results.errors.push(`Order ${orderId}: Skipped - no invoice link and user declined to proceed`);
                continue; // Skip this order
              }
              confirmNoInvoice = true;
            }
          }
          
          // Get the order data
          const order = renewalState.orders.find(o => o.id === orderId);
          if (!order) {
            results.failed++;
            results.errors.push(`Order ${orderId}: Order not found`);
            continue;
          }
          
          // Get renewal amount from override or use order total
          const renewalAmount = parseFloat(renewalAmountOverride) || order.total || 0;
          
          // Prepare order for processing
          const orderData = {
            orderId: order.id,
            customerName: order.customerName,
            customerEmail: order.customerEmail,
            staffAdminEmail: order.staffAdminEmail,
            staffAdminName: order.staffAdminName,
            financeEmail: order.financeEmail,
            financeName: order.financeName,
            product: order.product || 'Coaching Portal',
            quantity: order.quantity || 0,
            rate: order.rate || 0,  // Already extracted as number
            discount: order.discount || 0,  // Already extracted as number
            total: order.total || 0,  // Already extracted as number
            addons: order.addons || '',
            addonsCost: order.addonsCost || 0,  // Already extracted as number
            vatChargeable: order.vatChargeable === 'Yes',
            renewalDate: order.renewalDate,
            paymentDue: order.paymentDue,
            renewalAmount: renewalAmount
          };
          
          debugLog(`Processing order ${order.orderNumber}:`, orderData);
          
          const requestData = {
            orderId: orderId,
            action: action,
            autoUpdateStatus: autoUpdateStatus,
            bccAdmin: bccAdmin,
            notes: notes,
            confirmNoInvoice: confirmNoInvoice,
            emailTemplateId: action === 'reminder' ? 'RENEWAL_EMAIL_TEMPLATE_ID_2' : 'RENEWAL_EMAIL_TEMPLATE_ID',
            orderData: orderData  // Include the order data with all the fields
          };
          
          // Include renewal amount override if provided and action is estimate or reminder
          if (renewalAmountOverride && (action === 'estimate' || action === 'reminder')) {
            requestData.renewalAmount = parseFloat(renewalAmountOverride);
          }
          
          const response = await $.ajax({
            url: processUrl,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(requestData),
            xhrFields: { withCredentials: true },
            crossDomain: true
          });
          
          if (response.success) {
            results.success++;
            // Track deactivated users for cancellations
            if (action === 'cancel' && response.deactivatedUsers) {
              results.deactivatedUsers = (results.deactivatedUsers || 0) + response.deactivatedUsers;
            }
          } else {
            results.failed++;
            results.errors.push(`Order ${orderId}: ${response.message}`);
          }
          
        } catch (error) {
          results.failed++;
          results.errors.push(`Order ${orderId}: ${error.message}`);
        }
      }
      
      // Hide progress
      hideProgress();
      
      // Show results
      let message = '';
      
      if (action === 'cancel') {
        message = `Cancelled ${results.success} subscription${results.success !== 1 ? 's' : ''} successfully.`;
        if (results.deactivatedUsers) {
          message += ` ${results.deactivatedUsers} user account${results.deactivatedUsers !== 1 ? 's' : ''} have been deactivated.`;
        }
      } else {
        message = `Processed ${results.success} renewal${results.success !== 1 ? 's' : ''} successfully.`;
      }
      
      if (results.failed > 0) {
        message += ` ${results.failed} failed.`;
        if (results.errors.length > 0) {
          message += '\n\nErrors:\n' + results.errors.slice(0, 5).join('\n');
          if (results.errors.length > 5) {
            message += `\n... and ${results.errors.length - 5} more errors`;
          }
        }
        showError(message);
      } else {
        showSuccess(message);
      }
      
      // Refresh the table
      await loadRenewalData();
      
    } catch (error) {
      hideProgress();
      debugLog('Error processing renewals:', error, 'error');
      showError('Failed to process renewals: ' + error.message);
    }
  }

  /**
   * Helper functions
   */
  
  function getSelectedOrderIds() {
    const checkboxes = document.querySelectorAll('.renewal-table tbody input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
  }

  function updateSelection() {
    const selected = getSelectedOrderIds();
    renewalState.selectedOrders = selected;
    
    document.getElementById('selected-count').textContent = `${selected.length} selected`;
    
    // Enable/disable action buttons
    const hasSelection = selected.length > 0;
    document.getElementById('generate-estimates-btn').disabled = !hasSelection;
    document.getElementById('send-reminders-btn').disabled = !hasSelection;
    document.getElementById('process-renewals-btn').disabled = !hasSelection;
  }

  function toggleSelectAll() {
    const selectAll = document.getElementById('select-all-renewals');
    const checkboxes = document.querySelectorAll('.renewal-table tbody input[type="checkbox"]');
    
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
    updateSelection();
  }

  function applyFilters() {
    updateTableDisplay();
    updateCounts();
  }

  function updateCounts() {
    const filtered = applyLocalFilters(renewalState.orders);
    document.getElementById('renewal-count').textContent = `${filtered.length} renewal${filtered.length !== 1 ? 's' : ''}`;
  }

  /**
   * Format date for display
   */
  function formatDate(dateValue) {
    if (!dateValue) return '-';
    
    let date;
    
    // Handle Knack date object format
    if (dateValue && typeof dateValue === 'object') {
      if (dateValue.date_formatted) {
        // Return the pre-formatted date from Knack
        return dateValue.date_formatted;
      } else if (dateValue.unix_timestamp) {
        date = new Date(dateValue.unix_timestamp);
      }
    }
    // If it's already a Date object
    else if (dateValue instanceof Date) {
      date = dateValue;
    }
    // If it's a string or number
    else {
      date = new Date(dateValue);
    }
    
    // Check if date is valid
    if (!date || isNaN(date.getTime())) {
      return '-';
    }
    
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
  }

  /**
   * Edit a single order
   */
  function editOrder(orderId) {
    const order = renewalState.orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Show edit modal
    showEditModal(order);
  }

  function showError(message) {
    // Use existing VESPA error display if available
    if (window.showError) {
      window.showError(message);
    } else {
      alert('Error: ' + message);
    }
  }

  function showSuccess(message) {
    // Use existing VESPA success display if available
    if (window.showSuccess) {
      window.showSuccess(message);
    } else {
      alert('Success: ' + message);
    }
  }

  function showProgress(message, current, total) {
    // Simple progress overlay
    let progressDiv = document.getElementById('renewal-progress');
    if (!progressDiv) {
      progressDiv = document.createElement('div');
      progressDiv.id = 'renewal-progress';
      progressDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.2);
        z-index: 10002;
        text-align: center;
      `;
      document.body.appendChild(progressDiv);
    }
    
    progressDiv.innerHTML = `
      <h3>${message}</h3>
      ${current && total ? `<p>${current} of ${total}</p>` : ''}
      <div style="width: 200px; height: 4px; background: #e0e0e0; border-radius: 2px; margin: 10px auto;">
        <div style="width: ${(current/total*100)}%; height: 100%; background: #007bff; border-radius: 2px;"></div>
      </div>
    `;
  }

  function updateProgress(message, current, total) {
    showProgress(message, current, total);
  }

  function hideProgress() {
    document.getElementById('renewal-progress')?.remove();
  }

  // Auto-initialize when loaded
  function waitForConfig() {
    // Wait for VESPA_UPLOAD_CONFIG to be available
    if (window.VESPA_UPLOAD_CONFIG) {
      debugLog('VESPA_UPLOAD_CONFIG found:', window.VESPA_UPLOAD_CONFIG);
      initializeRenewalSystem();
    } else {
      debugLog('Waiting for VESPA_UPLOAD_CONFIG...');
      setTimeout(waitForConfig, 100);
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForConfig);
  } else {
    waitForConfig();
  }

})(window); 
