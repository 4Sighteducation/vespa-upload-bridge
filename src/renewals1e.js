/**
 * VESPA Renewal Management System
 * 
 * This module handles renewal invoice generation and management for Super Users.
 * It integrates with Object_122 (Orders) in Knack and manages the renewal process.
 * 
 * @requires jQuery
 * @requires Knack API access
 * @requires SendGrid email templates (RENEWAL_EMAIL_TEMPLATE_ID)
 */

(function(window) {
  'use strict';

  // Module configuration
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
        // Check if it might be stored differently
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
    // Field mappings for Object_122
    fields: {
      customerId: 'field_3459', // VESPA Customer connection
      orderDate: 'field_3454',
      renewalDate: 'field_3497', 
      paymentDue: 'field_3464',
      orderNumber: 'field_3470',
      invoiceNumber: 'field_3469',
      poNumber: 'field_3472',
      rate: 'field_3461',
      quantity: 'field_3462',
      discount: 'field_3465',
      vatChargeable: 'field_3467',
      total: 'field_3453',
      status: 'field_3451',
      financeEmail: 'field_3471',
      financeName: 'field_3473',
      invoiceLink: 'field_3474',
      estimateLink: 'field_3475',
      setupDate: 'field_3455',
      settled: 'field_3498',
      secondaryContact: 'field_3501',
      secondaryEmail: 'field_3502',
      address: 'field_3499',
      trustSchool: 'field_3504'
    },
    // Renewal status options
    statusOptions: {
      pending: 'Pending',
      estimate_sent: 'Estimate Sent',
      invoice_sent: 'Invoice Sent',
      paid: 'Paid',
      cancelled: 'Cancelled'
    },
    // Renewal timing settings
    renewalSettings: {
      firstReminderDays: 42, // 6 weeks
      secondReminderDays: 21, // 3 weeks
      gracePeriodDays: 30 // 30 days after due date
    }
  };

  // State management
  let renewalState = {
    orders: [],
    selectedOrders: [],
    filters: {
      dateRange: 'all',
      status: 'all',
      search: ''
    },
    isLoading: false,
    currentModal: null
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
    
    console.log(`%c[VESPA Renewals] ${message}`, styles[level], data || '');
  }

  /**
   * Format date for HTML date input (YYYY-MM-DD)
   */
  function formatDateForInput(dateValue) {
    if (!dateValue) return '';
    
    // If it's already a string in ISO format, extract the date part
    if (typeof dateValue === 'string') {
      // Check if it's already in YYYY-MM-DD format
      if (dateValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
        return dateValue;
      }
      // Extract date part from ISO string
      return dateValue.split('T')[0];
    }
    
    // If it's a Date object or timestamp
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return '';
    
    // Format as YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Initialize the renewal management system
   */
  function initializeRenewalSystem() {
    debugLog('Initializing Renewal Management System');
    
    // Log the current VESPA_UPLOAD_CONFIG
    debugLog('Current VESPA_UPLOAD_CONFIG:', window.VESPA_UPLOAD_CONFIG);
    debugLog('API URL from config:', window.VESPA_UPLOAD_CONFIG?.apiUrl);
    
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
      generateEstimates: () => processSelectedRenewals(),
      sendReminders: () => processSelectedRenewals(),
      formatDateForInput: formatDateForInput
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
    if (document.getElementById('vespa-renewal-styles')) return;
    
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
      }
      
      .renewal-status.pending { background: #fff3cd; color: #856404; }
      .renewal-status.estimate_sent { background: #cce5ff; color: #004085; }
      .renewal-status.invoice_sent { background: #d4edda; color: #155724; }
      .renewal-status.paid { background: #d1ecf1; color: #0c5460; }
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
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.id = 'vespa-renewal-styles';
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
              <option value="overdue">Overdue</option>
              <option value="upcoming_30">Next 30 days</option>
              <option value="upcoming_60">Next 60 days</option>
              <option value="upcoming_90">Next 90 days</option>
              <option value="all" selected>All renewals</option>
            </select>
          </div>
          
          <div class="filter-group">
            <label>Status:</label>
            <select id="renewal-status-filter" onchange="VESPARenewals.applyFilters()">
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="estimate_sent">Estimate Sent</option>
              <option value="invoice_sent">Invoice Sent</option>
              <option value="paid">Paid</option>
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
            <label>
              <input type="checkbox" id="select-all-renewals" onchange="VESPARenewals.toggleSelectAll()">
              Select All
            </label>
            <span id="selected-count">0 selected</span>
          </div>
          
          <div class="renewal-action-buttons">
            <button class="vespa-button secondary" onclick="VESPARenewals.generateEstimates()" 
                    id="generate-estimates-btn" disabled>
              📄 Generate Estimates
            </button>
            <button class="vespa-button secondary" onclick="VESPARenewals.sendReminders()" 
                    id="send-reminders-btn" disabled>
              📧 Send Reminders
            </button>
            <button class="vespa-button primary" onclick="VESPARenewals.processSelected()" 
                    id="process-renewals-btn" disabled>
              🚀 Process Renewals
            </button>
          </div>
        </div>
      </div>
    `;
    
    return modal;
  }

  /**
   * Load renewal data from the API
   */
  async function loadRenewalData() {
    renewalState.isLoading = true;
    updateTableDisplay();
    
    try {
      // Calculate date range based on filter
      const dateFilter = document.getElementById('renewal-date-filter')?.value || renewalState.filters.dateRange;
      const filters = buildDateFilters(dateFilter);
      
      debugLog('Loading renewal data with filters:', filters);
      
      // Get the API URL and log it
      const apiUrl = RENEWAL_CONFIG.apiUrl;
      
      // Ensure the URL is properly formatted
      if (!apiUrl || !apiUrl.startsWith('http')) {
        throw new Error(`Invalid API URL: ${apiUrl}`);
      }
      
      const fullUrl = new URL('renewals/list', apiUrl).href;
      debugLog('API URL:', apiUrl);
      debugLog('Full request URL:', fullUrl);
      debugLog('Window location:', window.location.href);
      
      // Call API to get renewal data - use absolute URL
      const response = await $.ajax({
        url: fullUrl,
        type: 'GET',
        data: {
          ...filters,
          includeCustomerDetails: true
        },
        xhrFields: { withCredentials: true },
        crossDomain: true
      });
      
      if (response.success) {
        renewalState.orders = response.orders || [];
        debugLog(`Loaded ${renewalState.orders.length} renewal orders`, null, 'success');
        debugLog('First order sample:', renewalState.orders[0]);
        debugLog('Response structure:', { success: response.success, ordersLength: response.orders?.length, totalField: response.total });
        updateTableDisplay();
        updateCounts();
      } else {
        throw new Error(response.message || 'Failed to load renewal data');
      }
      
    } catch (error) {
      debugLog('Error loading renewal data:', error, 'error');
      showError('Failed to load renewal data: ' + error.message);
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
        // No date filters
        break;
    }
    
    return filters;
  }

  /**
   * Update the table display with current data
   */
  function updateTableDisplay() {
    const container = document.getElementById('renewal-table-container');
    if (!container) return;
    
    debugLog('updateTableDisplay called', { isLoading: renewalState.isLoading, ordersCount: renewalState.orders.length });
    
    if (renewalState.isLoading) {
      container.innerHTML = '<div class="renewal-loading">Loading renewal data...</div>';
      return;
    }
    
    // Apply filters
    const filteredOrders = applyLocalFilters(renewalState.orders);
    debugLog('Filtered orders:', { originalCount: renewalState.orders.length, filteredCount: filteredOrders.length });
    
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
            <th>Renewal Date</th>
            <th>Quantity</th>
            <th>Rate</th>
            <th>Total</th>
            <th>Status</th>
            <th>Last Action</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    filteredOrders.forEach(order => {
      const renewalDate = new Date(order.renewalDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day
      
      let dateBadge = '';
      if (!isNaN(renewalDate.getTime())) {
        renewalDate.setHours(0, 0, 0, 0); // Reset time to start of day
        const daysUntil = Math.floor((renewalDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysUntil < 0) {
          dateBadge = `<span class="renewal-date-badge overdue">${Math.abs(daysUntil)} days overdue</span>`;
        } else if (daysUntil <= 7) {
          dateBadge = `<span class="renewal-date-badge soon">${daysUntil} days</span>`;
        } else if (daysUntil <= 30) {
          dateBadge = `<span class="renewal-date-badge upcoming">${daysUntil} days</span>`;
        }
      }
      
      tableHtml += `
        <tr data-order-id="${order.id}">
          <td>
            <input type="checkbox" class="renewal-checkbox" value="${order.id}" 
                   onchange="VESPARenewals.updateSelection()">
          </td>
          <td>
            <strong>${order.customerName || 'Unknown'}</strong><br>
            <small>${order.customerEmail || ''}</small>
          </td>
          <td>${order.orderNumber || '-'}</td>
          <td>
            ${formatDate(order.renewalDate)}
            ${dateBadge}
          </td>
          <td>${order.quantity || 0}</td>
          <td>£${parseFloat(order.rate || 0).toFixed(2)}</td>
          <td><strong>£${parseFloat(order.total || 0).toFixed(2)}</strong></td>
          <td>
            <span class="renewal-status ${(order.status || 'pending').toLowerCase().replace(' ', '_')}">
              ${order.status || 'Pending'}
            </span>
          </td>
          <td>${order.lastAction ? formatDate(order.lastAction) : '-'}</td>
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
    debugLog('applyLocalFilters called with orders:', { count: orders.length, firstOrder: orders[0] });
    
    let filtered = [...orders];
    
    // Status filter
    const statusFilter = document.getElementById('renewal-status-filter')?.value;
    if (statusFilter && statusFilter !== 'all') {
      debugLog('Status filter active:', { statusFilter, sampleStatus: filtered[0]?.status });
      
      filtered = filtered.filter(order => {
        // Normalize the status for comparison
        const orderStatus = (order.status || 'Pending').toLowerCase().replace(/\s+/g, '_');
        const filterStatus = statusFilter.toLowerCase().replace(/\s+/g, '_');
        
        debugLog('Status comparison:', { orderStatus, filterStatus, matches: orderStatus === filterStatus });
        return orderStatus === filterStatus;
      });
    }
    
    // Search filter
    const searchTerm = document.getElementById('renewal-search')?.value?.toLowerCase();
    if (searchTerm) {
      filtered = filtered.filter(order => 
        order.customerName?.toLowerCase().includes(searchTerm) ||
        order.customerEmail?.toLowerCase().includes(searchTerm) ||
        order.orderNumber?.toLowerCase().includes(searchTerm)
      );
    }
    
    // Sort by renewal date
    filtered.sort((a, b) => new Date(a.renewalDate) - new Date(b.renewalDate));
    
    return filtered;
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
              <input type="radio" name="renewal-action" value="estimate" checked>
              Generate and Send Estimates (6-week reminder)
            </label>
          </div>
          
          <div class="vespa-form-group">
            <label>
              <input type="radio" name="renewal-action" value="reminder">
              Send Reminder Emails (3-week reminder)
            </label>
          </div>
          
          <div class="vespa-form-group">
            <label>
              <input type="radio" name="renewal-action" value="invoice">
              Generate Invoices and Send Welcome Emails
            </label>
          </div>
          
          <div class="vespa-form-group" style="margin-top: 20px;">
            <label>
              <input type="checkbox" id="auto-update-status" checked>
              Automatically update order status after sending
            </label>
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
  }

  /**
   * Execute the renewal processing
   */
  async function executeProcessing(orderIdsString) {
    const orderIds = orderIdsString.split(',');
    const action = document.querySelector('input[name="renewal-action"]:checked')?.value;
    const autoUpdateStatus = document.getElementById('auto-update-status')?.checked;
    const notes = document.getElementById('renewal-notes')?.value;
    
    if (!action) {
      showError('Please select an action');
      return;
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
          debugLog('Processing URL:', processUrl);
          
          const response = await $.ajax({
            url: processUrl,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({
              orderId: orderId,
              action: action,
              autoUpdateStatus: autoUpdateStatus,
              notes: notes,
              emailTemplateId: action === 'reminder' ? 'RENEWAL_EMAIL_TEMPLATE_ID_2' : 'RENEWAL_EMAIL_TEMPLATE_ID'
            }),
            xhrFields: { withCredentials: true },
            crossDomain: true
          });
          
          if (response.success) {
            results.success++;
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
      let message = `Processed ${results.success} renewal${results.success !== 1 ? 's' : ''} successfully.`;
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
   * Edit a single order
   */
  function editOrder(orderId) {
    const order = renewalState.orders.find(o => o.id === orderId);
    if (!order) return;
    
    // Show edit modal
    showEditModal(order);
  }

  /**
   * Show edit modal for a single order
   */
  function showEditModal(order) {
    const modal = document.createElement('div');
    modal.className = 'renewal-modal';
    modal.style.zIndex = '10001';
    
    modal.innerHTML = `
      <div class="renewal-modal-content" style="width: 700px; height: auto;">
        <div class="renewal-header">
          <h3>Edit Renewal - ${order.customerName}</h3>
          <button class="vespa-button secondary small-button" onclick="this.closest('.renewal-modal').remove()">× Close</button>
        </div>
        
        <form id="edit-renewal-form" style="padding: 20px;">
          <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="vespa-form-group">
              <label>Order Number:</label>
              <input type="text" value="${order.orderNumber || ''}" readonly style="background: #f8f9fa;">
            </div>
            
            <div class="vespa-form-group">
              <label>Status:</label>
              <select id="edit-status" name="status">
                ${Object.entries(RENEWAL_CONFIG.statusOptions).map(([value, label]) => 
                  `<option value="${value}" ${order.status === value ? 'selected' : ''}>${label}</option>`
                ).join('')}
              </select>
            </div>
          </div>
          
          <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="vespa-form-group">
              <label>Renewal Date:</label>
              <input type="date" id="edit-renewal-date" name="renewalDate" 
                     value="${order.renewalDate ? formatDateForInput(order.renewalDate) : ''}">
            </div>
            
            <div class="vespa-form-group">
              <label>PO Number:</label>
              <input type="text" id="edit-po-number" name="poNumber" value="${order.poNumber || ''}">
            </div>
          </div>
          
          <h4 style="margin-top: 20px;">Order Details</h4>
          
          <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
            <div class="vespa-form-group">
              <label>Quantity:</label>
              <input type="number" id="edit-quantity" name="quantity" value="${order.quantity || 0}" 
                     onchange="VESPARenewals.calculateEditTotal()">
            </div>
            
            <div class="vespa-form-group">
              <label>Rate (£):</label>
              <input type="number" id="edit-rate" name="rate" value="${order.rate || 0}" step="0.01"
                     onchange="VESPARenewals.calculateEditTotal()">
            </div>
            
            <div class="vespa-form-group">
              <label>Discount (%):</label>
              <input type="number" id="edit-discount" name="discount" value="${order.discount || 0}" 
                     min="0" max="100" onchange="VESPARenewals.calculateEditTotal()">
            </div>
          </div>
          
          <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="vespa-form-group">
              <label>VAT Chargeable:</label>
              <select id="edit-vat" name="vatChargeable" onchange="VESPARenewals.calculateEditTotal()">
                <option value="Yes" ${order.vatChargeable === 'Yes' ? 'selected' : ''}>Yes</option>
                <option value="No" ${order.vatChargeable === 'No' ? 'selected' : ''}>No</option>
              </select>
            </div>
            
            <div class="vespa-form-group">
              <label>Total (£):</label>
              <input type="text" id="edit-total" value="${parseFloat(order.total || 0).toFixed(2)}" 
                     readonly style="background: #f8f9fa; font-weight: bold;">
            </div>
          </div>
          
          <h4 style="margin-top: 20px;">Contact Information</h4>
          
          <div class="vespa-form-row" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div class="vespa-form-group">
              <label>Finance Contact:</label>
              <input type="text" id="edit-finance-name" name="financeName" value="${order.financeName || ''}">
            </div>
            
            <div class="vespa-form-group">
              <label>Finance Email:</label>
              <input type="email" id="edit-finance-email" name="financeEmail" value="${order.financeEmail || ''}">
            </div>
          </div>
          
          <div style="margin-top: 20px; text-align: right;">
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
  }

  /**
   * Calculate total for edit form
   */
  function calculateEditTotal() {
    const quantity = parseFloat(document.getElementById('edit-quantity')?.value || 0);
    const rate = parseFloat(document.getElementById('edit-rate')?.value || 0);
    const discount = parseFloat(document.getElementById('edit-discount')?.value || 0);
    const vat = document.getElementById('edit-vat')?.value === 'Yes';
    
    let subtotal = quantity * rate;
    let discountAmount = subtotal * (discount / 100);
    let afterDiscount = subtotal - discountAmount;
    let vatAmount = vat ? afterDiscount * 0.20 : 0;
    let total = afterDiscount + vatAmount;
    
    document.getElementById('edit-total').value = total.toFixed(2);
  }

  /**
   * Save order changes
   */
  async function saveOrderChanges(orderId, formData) {
    try {
      const data = {
        status: formData.get('status'),
        renewalDate: formData.get('renewalDate'),
        poNumber: formData.get('poNumber'),
        quantity: parseInt(formData.get('quantity')),
        rate: parseFloat(formData.get('rate')),
        discount: parseFloat(formData.get('discount')),
        vatChargeable: formData.get('vatChargeable'),
        financeName: formData.get('financeName'),
        financeEmail: formData.get('financeEmail')
      };
      
      debugLog('Saving order changes:', data);
      
      const updateUrl = new URL(`renewals/update/${orderId}`, RENEWAL_CONFIG.apiUrl).href;
      debugLog('Update URL:', updateUrl);
      
      const response = await $.ajax({
        url: updateUrl,
        type: 'PUT',
        contentType: 'application/json',
        data: JSON.stringify(data),
        xhrFields: { withCredentials: true },
        crossDomain: true
      });
      
      if (response.success) {
        showSuccess('Order updated successfully');
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

  function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric' 
    });
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

