/**
 * VESPA Account Manager V3 - Professional Account Management UI
 * 
 * A complete, production-ready Vue.js interface for managing student and staff accounts.
 * Features beautiful design, inline editing, connection management, and bulk operations.
 * 
 * Features:
 * - 🔐 Smart auth detection (super user vs staff admin)
 * - 📊 Modern tabbed data tables (Students | Staff)
 * - ✏️ Inline editing with save/cancel
 * - 🔗 Connection management (add/remove tutors, HOY, teachers)
 * - ✅ Bulk operations (select multiple → action)
 * - 📧 Email actions (reset password, resend welcome)
 * - 🎨 Beautiful VESPA-branded design
 * - 📱 Fully responsive
 * 
 * Version: 1c
 * Date: November 26, 2025
 */

(function() {
  'use strict';
  
  const VERSION = '1c';
  const DEBUG_MODE = true;
  
  function debugLog(message, data) {
    if (DEBUG_MODE) {
      console.log(`[AccountManager ${VERSION}] ${message}`, data || '');
    }
  }
  
  debugLog('Script loaded', { version: VERSION });
  
  // Main initialization function
  window.initializeAccountManager = function() {
    debugLog('Initializing Account Manager');
    
    // Get config from global variable
    const config = window.ACCOUNT_MANAGER_CONFIG;
    if (!config) {
      console.error('[AccountManager] No config found');
      return;
    }
    
    debugLog('Config loaded', config);
    
    // Get container
    const container = document.querySelector(config.elementSelector);
    if (!container) {
      console.error('[AccountManager] Container not found:', config.elementSelector);
      return;
    }
    
    // Inject Vue 3 if not already loaded
    if (typeof Vue === 'undefined') {
      debugLog('Loading Vue 3...');
      const vueScript = document.createElement('script');
      vueScript.src = 'https://unpkg.com/vue@3.3.4/dist/vue.global.prod.js';
      vueScript.onload = () => {
        debugLog('Vue 3 loaded');
        initializeVueApp();
      };
      document.head.appendChild(vueScript);
    } else {
      debugLog('Vue 3 already loaded');
      initializeVueApp();
    }
    
    function initializeVueApp() {
      // Inject styles
      injectStyles();
      
      // Create Vue app
      const { createApp } = Vue;
      
      const app = createApp({
        data() {
          return {
            // API configuration
            apiUrl: config.apiUrl || 'https://vespa-upload-api-07e11c285370.herokuapp.com',
            
            // Authentication
            authChecked: false,
            isSuperUser: false,
            userEmail: null,
            schoolContext: null,
            
            // UI State
            currentTab: 'students', // 'students' or 'staff'
            loading: false,
            loadingText: '',
            
            // Search & filters
            searchQuery: '',
            selectedYearGroup: '',
            selectedSchool: null,
            
            // Data
            accounts: [],
            totalAccounts: 0,
            currentPage: 1,
            pageSize: 50,
            
            // Selection
            selectedAccounts: [],
            allSelected: false,
            
            // Editing
            editingAccount: null,
            editForm: {},
            
            // Connection management
            showConnectionModal: false,
            connectionAccount: null,
            availableStaff: {
              tutors: [],
              headsOfYear: [],
              subjectTeachers: [],
              staffAdmins: []
            },
            
            // Bulk operations
            showBulkMenu: false,
            bulkAction: null,
            
            // Messages
            message: null,
            messageType: null
          };
        },
        
        computed: {
          filteredAccounts() {
            return this.accounts;
          },
          
          hasSelectedAccounts() {
            return this.selectedAccounts.length > 0;
          },
          
          yearGroups() {
            return ['7', '8', '9', '10', '11', '12', '13'];
          }
        },
        
        async mounted() {
          debugLog('Vue app mounted');
          await this.checkAuth();
          await this.loadAccounts();
        },
        
        methods: {
          // ========== AUTH & INITIALIZATION ==========
          
          async checkAuth() {
            try {
              debugLog('Checking authentication...');
              
              // Get Knack user attributes
              if (typeof Knack === 'undefined' || !Knack.getUserAttributes) {
                throw new Error('Knack not available');
              }
              
              const userAttrs = Knack.getUserAttributes();
              this.userEmail = userAttrs.email;
              const userId = userAttrs.id;
              
              debugLog('User attributes', { email: this.userEmail, id: userId });
              
              // Call auth check endpoint
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/auth/check?userEmail=${encodeURIComponent(this.userEmail)}&userId=${userId}`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.isSuperUser = data.isSuperUser;
                this.schoolContext = data.schoolContext;
                this.authChecked = true;
                
                debugLog('Auth check complete', {
                  isSuperUser: this.isSuperUser,
                  schoolContext: this.schoolContext
                });
                
                if (!this.isSuperUser && this.schoolContext) {
                  this.showMessage(`Logged in as: ${this.schoolContext.customerName}`, 'info');
                } else if (this.isSuperUser) {
                  this.showMessage('Super User Mode Active - All Schools', 'info');
                }
              } else {
                throw new Error(data.message || 'Auth check failed');
              }
              
            } catch (error) {
              console.error('Auth check error:', error);
              this.showMessage('Authentication check failed. Some features may not work.', 'error');
              this.authChecked = true; // Continue anyway
            }
          },
          
          // ========== DATA LOADING ==========
          
          async loadAccounts() {
            this.loading = true;
            this.loadingText = 'Loading accounts...';
            
            try {
              debugLog('Loading accounts', {
                tab: this.currentTab,
                page: this.currentPage,
                search: this.searchQuery
              });
              
              const params = new URLSearchParams({
                accountType: this.currentTab === 'students' ? 'student' : 'staff',
                page: this.currentPage,
                limit: this.pageSize,
                search: this.searchQuery || ''
              });
              
              // Add filters
              if (this.selectedYearGroup && this.currentTab === 'students') {
                params.append('yearGroup', this.selectedYearGroup);
              }
              
              if (this.selectedSchool && this.isSuperUser) {
                params.append('customerId', this.selectedSchool.id);
              } else if (this.schoolContext && !this.isSuperUser) {
                params.append('customerId', this.schoolContext.customerId);
              }
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts?${params}`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.accounts = data.accounts || [];
                this.totalAccounts = data.total || 0;
                debugLog('Accounts loaded', { count: this.accounts.length });
              } else {
                throw new Error(data.message || 'Failed to load accounts');
              }
              
            } catch (error) {
              console.error('Load accounts error:', error);
              this.showMessage('Failed to load accounts: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          // ========== INLINE EDITING ==========
          
          startEdit(account) {
            this.editingAccount = account;
            this.editForm = {
              email: account.email,
              firstName: account.firstName,
              lastName: account.lastName,
              yearGroup: account.yearGroup || '',
              tutorGroup: account.tutorGroup || '',
              gender: account.gender || '',
              upn: account.upn || '',
              subject: account.subject || ''
            };
            debugLog('Started editing', account);
          },
          
          cancelEdit() {
            this.editingAccount = null;
            this.editForm = {};
          },
          
          async saveEdit() {
            if (!this.editingAccount) return;
            
            this.loading = true;
            this.loadingText = 'Saving changes...';
            
            try {
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(this.editingAccount.email)}`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    accountType: this.currentTab === 'students' ? 'student' : 'staff',
                    ...this.editForm
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('Account updated successfully!', 'success');
                this.editingAccount = null;
                this.editForm = {};
                await this.loadAccounts();
              } else {
                throw new Error(data.message || 'Update failed');
              }
              
            } catch (error) {
              console.error('Save error:', error);
              this.showMessage('Failed to save changes: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          // ========== CONNECTION MANAGEMENT ==========
          
          async openConnectionManager(account) {
            this.connectionAccount = account;
            this.showConnectionModal = true;
            
            // Load full account details with connections
            try {
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(account.email)}?accountType=student`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.connectionAccount = data.account;
                debugLog('Loaded account with connections', data.account);
              }
              
            } catch (error) {
              console.error('Load connections error:', error);
              this.showMessage('Failed to load connections', 'error');
            }
            
            // Load available staff
            await this.loadAvailableStaff();
          },
          
          async loadAvailableStaff() {
            try {
              const customerId = this.isSuperUser && this.selectedSchool 
                ? this.selectedSchool.id 
                : this.schoolContext?.customerId;
              
              if (!customerId) return;
              
              // Load tutors
              const tutorsResponse = await fetch(
                `${this.apiUrl}/api/v3/accounts/staff/available?customerId=${customerId}&roleType=tutor`,
                { headers: { 'Content-Type': 'application/json' } }
              );
              const tutorsData = await tutorsResponse.json();
              if (tutorsData.success) this.availableStaff.tutors = tutorsData.staff || [];
              
              // Load heads of year
              const hoyResponse = await fetch(
                `${this.apiUrl}/api/v3/accounts/staff/available?customerId=${customerId}&roleType=head_of_year`,
                { headers: { 'Content-Type': 'application/json' } }
              );
              const hoyData = await hoyResponse.json();
              if (hoyData.success) this.availableStaff.headsOfYear = hoyData.staff || [];
              
              // Load subject teachers
              const teachersResponse = await fetch(
                `${this.apiUrl}/api/v3/accounts/staff/available?customerId=${customerId}&roleType=subject_teacher`,
                { headers: { 'Content-Type': 'application/json' } }
              );
              const teachersData = await teachersResponse.json();
              if (teachersData.success) this.availableStaff.subjectTeachers = teachersData.staff || [];
              
              // Load staff admins
              const adminsResponse = await fetch(
                `${this.apiUrl}/api/v3/accounts/staff/available?customerId=${customerId}&roleType=staff_admin`,
                { headers: { 'Content-Type': 'application/json' } }
              );
              const adminsData = await adminsResponse.json();
              if (adminsData.success) this.availableStaff.staffAdmins = adminsData.staff || [];
              
              debugLog('Available staff loaded', this.availableStaff);
              
            } catch (error) {
              console.error('Load available staff error:', error);
            }
          },
          
          async addConnection(connectionType, staffEmail) {
            if (!this.connectionAccount || !staffEmail) return;
            
            this.loading = true;
            
            try {
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(this.connectionAccount.email)}/connections`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    connectionType: connectionType,
                    staffEmail: staffEmail,
                    action: 'add'
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('Connection added successfully!', 'success');
                await this.openConnectionManager(this.connectionAccount);
              } else {
                throw new Error(data.message || 'Failed to add connection');
              }
              
            } catch (error) {
              console.error('Add connection error:', error);
              this.showMessage('Failed to add connection: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          async removeConnection(connectionType, staffEmail) {
            if (!this.connectionAccount || !staffEmail) return;
            
            if (!confirm(`Remove this ${connectionType.replace('_', ' ')} connection?`)) return;
            
            this.loading = true;
            
            try {
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(this.connectionAccount.email)}/connections`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    connectionType: connectionType,
                    staffEmail: staffEmail,
                    action: 'remove'
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('Connection removed successfully!', 'success');
                await this.openConnectionManager(this.connectionAccount);
              } else {
                throw new Error(data.message || 'Failed to remove connection');
              }
              
            } catch (error) {
              console.error('Remove connection error:', error);
              this.showMessage('Failed to remove connection: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          closeConnectionModal() {
            this.showConnectionModal = false;
            this.connectionAccount = null;
          },
          
          // ========== EMAIL ACTIONS ==========
          
          async resetPassword(account) {
            if (!confirm(`Send password reset email to ${account.email}?`)) return;
            
            this.loading = true;
            
            try {
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(account.email)}/reset-password`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('Password reset email sent!', 'success');
              } else {
                throw new Error(data.message || 'Failed to send password reset');
              }
              
            } catch (error) {
              console.error('Reset password error:', error);
              this.showMessage('Failed to send password reset: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          async resendWelcome(account) {
            if (!confirm(`Resend welcome email to ${account.email}?`)) return;
            
            this.loading = true;
            
            try {
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(account.email)}/resend-welcome`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    accountType: this.currentTab === 'students' ? 'student' : 'staff',
                    firstName: account.firstName,
                    lastName: account.lastName,
                    schoolName: account.schoolName
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('Welcome email sent!', 'success');
              } else {
                throw new Error(data.message || 'Failed to send welcome email');
              }
              
            } catch (error) {
              console.error('Resend welcome error:', error);
              this.showMessage('Failed to send welcome email: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          // ========== BULK OPERATIONS ==========
          
          toggleSelectAll() {
            if (this.allSelected) {
              this.selectedAccounts = [];
            } else {
              this.selectedAccounts = this.accounts.map(a => a.email);
            }
            this.allSelected = !this.allSelected;
          },
          
          toggleSelect(email) {
            const index = this.selectedAccounts.indexOf(email);
            if (index > -1) {
              this.selectedAccounts.splice(index, 1);
            } else {
              this.selectedAccounts.push(email);
            }
            this.allSelected = this.selectedAccounts.length === this.accounts.length;
          },
          
          isSelected(email) {
            return this.selectedAccounts.includes(email);
          },
          
          async executeBulkAction(action) {
            if (!this.hasSelectedAccounts) {
              this.showMessage('Please select at least one account', 'warning');
              return;
            }
            
            const count = this.selectedAccounts.length;
            const confirmMessage = action === 'reset-password'
              ? `Send password reset emails to ${count} account(s)?`
              : action === 'resend-welcome'
              ? `Resend welcome emails to ${count} account(s)?`
              : action === 'delete'
              ? `Delete ${count} account(s)? This cannot be undone.`
              : `Execute action on ${count} account(s)?`;
            
            if (!confirm(confirmMessage)) return;
            
            this.loading = true;
            this.loadingText = `Processing ${count} accounts...`;
            
            let successCount = 0;
            let failCount = 0;
            
            try {
              for (const email of this.selectedAccounts) {
                const account = this.accounts.find(a => a.email === email);
                if (!account) continue;
                
                try {
                  if (action === 'reset-password') {
                    await this.resetPassword(account);
                  } else if (action === 'resend-welcome') {
                    await this.resendWelcome(account);
                  } else if (action === 'delete') {
                    await this.deleteAccount(account);
                  }
                  successCount++;
                } catch (err) {
                  failCount++;
                  console.error(`Failed for ${email}:`, err);
                }
              }
              
              this.showMessage(
                `Bulk action completed: ${successCount} success, ${failCount} failed`,
                failCount === 0 ? 'success' : 'warning'
              );
              
              // Clear selection
              this.selectedAccounts = [];
              this.allSelected = false;
              
              // Reload accounts
              await this.loadAccounts();
              
            } catch (error) {
              console.error('Bulk action error:', error);
              this.showMessage('Bulk action failed: ' + error.message, 'error');
            } finally {
              this.loading = false;
              this.showBulkMenu = false;
            }
          },
          
          // ========== DELETE ==========
          
          async deleteAccount(account) {
            if (!confirm(`Delete account ${account.email}? This will mark it as deleted.`)) return;
            
            this.loading = true;
            
            try {
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(account.email)}`,
                {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    accountType: this.currentTab === 'students' ? 'student' : 'staff'
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('Account deleted successfully!', 'success');
                await this.loadAccounts();
              } else {
                throw new Error(data.message || 'Delete failed');
              }
              
            } catch (error) {
              console.error('Delete error:', error);
              this.showMessage('Failed to delete account: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          // ========== UI HELPERS ==========
          
          switchTab(tab) {
            if (this.currentTab === tab) return;
            this.currentTab = tab;
            this.selectedAccounts = [];
            this.allSelected = false;
            this.editingAccount = null;
            this.currentPage = 1;
            this.loadAccounts();
          },
          
          showMessage(text, type = 'info') {
            this.message = text;
            this.messageType = type;
            setTimeout(() => {
              this.message = null;
            }, 5000);
          },
          
          formatDate(dateString) {
            if (!dateString) return 'N/A';
            return new Date(dateString).toLocaleDateString('en-GB');
          }
        },
        
        template: `
          <div class="vespa-account-manager">
            <!-- Loading Overlay -->
            <div v-if="loading" class="am-loading-overlay">
              <div class="am-loading-content">
                <div class="am-spinner"></div>
                <div class="am-loading-text">{{ loadingText || 'Loading...' }}</div>
              </div>
            </div>
            
            <!-- Header -->
            <div class="am-header">
              <div class="am-header-left">
                <h1>
                  <span class="am-icon">👥</span>
                  Account Management
                </h1>
                <div v-if="authChecked" class="am-auth-badge">
                  <span v-if="isSuperUser" class="am-badge super-user">
                    🔓 Super User
                  </span>
                  <span v-else-if="schoolContext" class="am-badge school">
                    🏫 {{ schoolContext.customerName }}
                  </span>
                </div>
              </div>
            </div>
            
            <!-- Message Display -->
            <div v-if="message" class="am-message" :class="'am-message-' + messageType">
              {{ message }}
            </div>
            
            <!-- Tabs -->
            <div class="am-tabs">
              <button 
                class="am-tab" 
                :class="{ active: currentTab === 'students' }"
                @click="switchTab('students')">
                <span class="am-icon">🎓</span>
                Students
                <span v-if="currentTab === 'students'" class="am-tab-count">{{ totalAccounts }}</span>
              </button>
              <button 
                class="am-tab" 
                :class="{ active: currentTab === 'staff' }"
                @click="switchTab('staff')">
                <span class="am-icon">👨‍🏫</span>
                Staff
                <span v-if="currentTab === 'staff'" class="am-tab-count">{{ totalAccounts }}</span>
              </button>
            </div>
            
            <!-- Toolbar -->
            <div class="am-toolbar">
              <div class="am-toolbar-left">
                <!-- Bulk selection info -->
                <div v-if="hasSelectedAccounts" class="am-selection-info">
                  <span class="am-icon">✓</span>
                  {{ selectedAccounts.length }} selected
                </div>
                
                <!-- Bulk actions dropdown -->
                <div v-if="hasSelectedAccounts" class="am-bulk-actions">
                  <button class="am-button secondary" @click="showBulkMenu = !showBulkMenu">
                    ⋮ Bulk Actions
                  </button>
                  <div v-if="showBulkMenu" class="am-dropdown-menu">
                    <button @click="executeBulkAction('reset-password')" class="am-dropdown-item">
                      🔐 Reset Passwords
                    </button>
                    <button @click="executeBulkAction('resend-welcome')" class="am-dropdown-item">
                      📧 Resend Welcome Emails
                    </button>
                    <button @click="executeBulkAction('delete')" class="am-dropdown-item danger">
                      🗑️ Delete Selected
                    </button>
                  </div>
                </div>
              </div>
              
              <div class="am-toolbar-right">
                <!-- Year group filter (students only) -->
                <select 
                  v-if="currentTab === 'students'" 
                  v-model="selectedYearGroup" 
                  @change="loadAccounts"
                  class="am-select">
                  <option value="">All Year Groups</option>
                  <option v-for="year in yearGroups" :key="year" :value="year">
                    Year {{ year }}
                  </option>
                </select>
                
                <!-- Search -->
                <div class="am-search-box">
                  <input 
                    type="text" 
                    v-model="searchQuery"
                    @keyup.enter="loadAccounts"
                    placeholder="Search by name or email..."
                    class="am-search-input"
                  />
                  <button @click="loadAccounts" class="am-search-btn">
                    🔍
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Data Table -->
            <div class="am-table-container">
              <table class="am-table">
                <thead>
                  <tr>
                    <th class="am-th-checkbox">
                      <input 
                        type="checkbox" 
                        v-model="allSelected"
                        @change="toggleSelectAll"
                        class="am-checkbox"
                      />
                    </th>
                    <th v-if="currentTab === 'students'">Name</th>
                    <th v-if="currentTab === 'students'">Email</th>
                    <th v-if="currentTab === 'students'">Year</th>
                    <th v-if="currentTab === 'students'">Group</th>
                    <th v-if="currentTab === 'students'">Gender</th>
                    <th v-if="currentTab === 'students'">Connections</th>
                    
                    <th v-if="currentTab === 'staff'">Name</th>
                    <th v-if="currentTab === 'staff'">Email</th>
                    <th v-if="currentTab === 'staff'">Subject</th>
                    <th v-if="currentTab === 'staff'">Roles</th>
                    
                    <th v-if="!isSuperUser">School</th>
                    <th class="am-th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="accounts.length === 0 && !loading">
                    <td :colspan="currentTab === 'students' ? 8 : 6" class="am-td-empty">
                      No accounts found. Try adjusting your search or filters.
                    </td>
                  </tr>
                  
                  <tr 
                    v-for="account in accounts" 
                    :key="account.email"
                    class="am-tr"
                    :class="{ 
                      'am-tr-selected': isSelected(account.email),
                      'am-tr-editing': editingAccount && editingAccount.email === account.email
                    }">
                    
                    <!-- Checkbox -->
                    <td class="am-td-checkbox">
                      <input 
                        type="checkbox" 
                        :checked="isSelected(account.email)"
                        @change="toggleSelect(account.email)"
                        class="am-checkbox"
                      />
                    </td>
                    
                    <!-- Student Columns -->
                    <template v-if="currentTab === 'students'">
                      <!-- Name -->
                      <td class="am-td-editable" @dblclick="startEdit(account)">
                        <span v-if="editingAccount?.email !== account.email">
                          {{ account.firstName }} {{ account.lastName }}
                        </span>
                        <div v-else class="am-inline-edit">
                          <input 
                            v-model="editForm.firstName" 
                            placeholder="First"
                            class="am-input-inline"
                          />
                          <input 
                            v-model="editForm.lastName" 
                            placeholder="Last"
                            class="am-input-inline"
                          />
                        </div>
                      </td>
                      
                      <!-- Email -->
                      <td class="am-td-email">{{ account.email }}</td>
                      
                      <!-- Year Group -->
                      <td class="am-td-editable" @dblclick="startEdit(account)">
                        <span v-if="editingAccount?.email !== account.email">
                          {{ account.yearGroup || '-' }}
                        </span>
                        <select v-else v-model="editForm.yearGroup" class="am-select-inline">
                          <option value="">-</option>
                          <option v-for="year in yearGroups" :key="year" :value="year">{{ year }}</option>
                        </select>
                      </td>
                      
                      <!-- Tutor Group -->
                      <td class="am-td-editable" @dblclick="startEdit(account)">
                        <span v-if="editingAccount?.email !== account.email">
                          {{ account.tutorGroup || '-' }}
                        </span>
                        <input 
                          v-else 
                          v-model="editForm.tutorGroup" 
                          placeholder="Group"
                          class="am-input-inline"
                        />
                      </td>
                      
                      <!-- Gender -->
                      <td class="am-td-editable" @dblclick="startEdit(account)">
                        <span v-if="editingAccount?.email !== account.email">
                          {{ account.gender || '-' }}
                        </span>
                        <select v-else v-model="editForm.gender" class="am-select-inline">
                          <option value="">-</option>
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Non-Binary">Non-Binary</option>
                        </select>
                      </td>
                      
                      <!-- Connections -->
                      <td>
                        <button 
                          @click="openConnectionManager(account)" 
                          class="am-button-link">
                          Manage
                        </button>
                      </td>
                    </template>
                    
                    <!-- Staff Columns -->
                    <template v-if="currentTab === 'staff'">
                      <!-- Name -->
                      <td class="am-td-editable" @dblclick="startEdit(account)">
                        <span v-if="editingAccount?.email !== account.email">
                          {{ account.firstName }} {{ account.lastName }}
                        </span>
                        <div v-else class="am-inline-edit">
                          <input 
                            v-model="editForm.firstName" 
                            placeholder="First"
                            class="am-input-inline"
                          />
                          <input 
                            v-model="editForm.lastName" 
                            placeholder="Last"
                            class="am-input-inline"
                          />
                        </div>
                      </td>
                      
                      <!-- Email -->
                      <td class="am-td-email">{{ account.email }}</td>
                      
                      <!-- Subject -->
                      <td class="am-td-editable" @dblclick="startEdit(account)">
                        <span v-if="editingAccount?.email !== account.email">
                          {{ account.subject || '-' }}
                        </span>
                        <input 
                          v-else 
                          v-model="editForm.subject" 
                          placeholder="Subject"
                          class="am-input-inline"
                        />
                      </td>
                      
                      <!-- Roles -->
                      <td>
                        <div class="am-roles">
                          <span 
                            v-for="role in account.roles" 
                            :key="role"
                            class="am-role-badge">
                            {{ role }}
                          </span>
                        </div>
                      </td>
                    </template>
                    
                    <!-- School (if not super user) -->
                    <td v-if="!isSuperUser">{{ account.schoolName || '-' }}</td>
                    
                    <!-- Actions -->
                    <td class="am-td-actions">
                      <!-- Edit mode actions -->
                      <div v-if="editingAccount?.email === account.email" class="am-action-group">
                        <button @click="saveEdit" class="am-button-icon success" title="Save">
                          ✓
                        </button>
                        <button @click="cancelEdit" class="am-button-icon danger" title="Cancel">
                          ✖
                        </button>
                      </div>
                      
                      <!-- Normal mode actions -->
                      <div v-else class="am-action-group">
                        <button @click="startEdit(account)" class="am-button-icon" title="Edit">
                          ✏️
                        </button>
                        <button @click="resetPassword(account)" class="am-button-icon" title="Reset Password">
                          🔐
                        </button>
                        <button @click="resendWelcome(account)" class="am-button-icon" title="Resend Welcome">
                          📧
                        </button>
                        <button @click="deleteAccount(account)" class="am-button-icon danger" title="Delete">
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <!-- Pagination -->
            <div v-if="totalAccounts > pageSize" class="am-pagination">
              <button 
                @click="currentPage--; loadAccounts();"
                :disabled="currentPage === 1"
                class="am-button secondary">
                ← Previous
              </button>
              <span class="am-page-info">
                Page {{ currentPage }} of {{ Math.ceil(totalAccounts / pageSize) }}
              </span>
              <button 
                @click="currentPage++; loadAccounts();"
                :disabled="currentPage >= Math.ceil(totalAccounts / pageSize)"
                class="am-button secondary">
                Next →
              </button>
            </div>
            
            <!-- Connection Management Modal -->
            <div v-if="showConnectionModal" class="am-modal-overlay" @click.self="closeConnectionModal">
              <div class="am-modal">
                <div class="am-modal-header">
                  <h3>Manage Connections: {{ connectionAccount?.firstName }} {{ connectionAccount?.lastName }}</h3>
                  <button @click="closeConnectionModal" class="am-modal-close">✖</button>
                </div>
                
                <div class="am-modal-body">
                  <!-- Tutors -->
                  <div class="am-connection-section">
                    <h4>👨‍🏫 Tutors</h4>
                    <div class="am-connection-list">
                      <div 
                        v-for="tutor in connectionAccount?.connections?.tutors || []"
                        :key="tutor.id"
                        class="am-connection-item">
                        <span>{{ tutor.identifier }}</span>
                        <button 
                          @click="removeConnection('tutor', tutor.identifier)"
                          class="am-button-icon-small danger">
                          ✖
                        </button>
                      </div>
                      <div v-if="!connectionAccount?.connections?.tutors?.length" class="am-empty">
                        No tutors assigned
                      </div>
                    </div>
                    <div class="am-add-connection">
                      <select 
                        v-model="newTutorEmail" 
                        class="am-select"
                        @change="newTutorEmail && addConnection('tutor', newTutorEmail)">
                        <option value="">+ Add Tutor...</option>
                        <option 
                          v-for="tutor in availableStaff.tutors" 
                          :key="tutor.email"
                          :value="tutor.email">
                          {{ tutor.fullName }} ({{ tutor.email }})
                        </option>
                      </select>
                    </div>
                  </div>
                  
                  <!-- Heads of Year -->
                  <div class="am-connection-section">
                    <h4>🎓 Heads of Year</h4>
                    <div class="am-connection-list">
                      <div 
                        v-for="hoy in connectionAccount?.connections?.headsOfYear || []"
                        :key="hoy.id"
                        class="am-connection-item">
                        <span>{{ hoy.identifier }}</span>
                        <button 
                          @click="removeConnection('head_of_year', hoy.identifier)"
                          class="am-button-icon-small danger">
                          ✖
                        </button>
                      </div>
                      <div v-if="!connectionAccount?.connections?.headsOfYear?.length" class="am-empty">
                        No heads of year assigned
                      </div>
                    </div>
                    <div class="am-add-connection">
                      <select 
                        v-model="newHoyEmail" 
                        class="am-select"
                        @change="newHoyEmail && addConnection('head_of_year', newHoyEmail)">
                        <option value="">+ Add Head of Year...</option>
                        <option 
                          v-for="hoy in availableStaff.headsOfYear" 
                          :key="hoy.email"
                          :value="hoy.email">
                          {{ hoy.fullName }} ({{ hoy.email }})
                        </option>
                      </select>
                    </div>
                  </div>
                  
                  <!-- Subject Teachers -->
                  <div class="am-connection-section">
                    <h4>📚 Subject Teachers</h4>
                    <div class="am-connection-list">
                      <div 
                        v-for="teacher in connectionAccount?.connections?.subjectTeachers || []"
                        :key="teacher.id"
                        class="am-connection-item">
                        <span>{{ teacher.identifier }}</span>
                        <button 
                          @click="removeConnection('subject_teacher', teacher.identifier)"
                          class="am-button-icon-small danger">
                          ✖
                        </button>
                      </div>
                      <div v-if="!connectionAccount?.connections?.subjectTeachers?.length" class="am-empty">
                        No subject teachers assigned
                      </div>
                    </div>
                    <div class="am-add-connection">
                      <select 
                        v-model="newTeacherEmail" 
                        class="am-select"
                        @change="newTeacherEmail && addConnection('subject_teacher', newTeacherEmail)">
                        <option value="">+ Add Subject Teacher...</option>
                        <option 
                          v-for="teacher in availableStaff.subjectTeachers" 
                          :key="teacher.email"
                          :value="teacher.email">
                          {{ teacher.fullName }} ({{ teacher.email }})
                        </option>
                      </select>
                    </div>
                  </div>
                  
                  <!-- Staff Admins -->
                  <div class="am-connection-section">
                    <h4>👔 Staff Admins</h4>
                    <div class="am-connection-list">
                      <div 
                        v-for="admin in connectionAccount?.connections?.staffAdmins || []"
                        :key="admin.id"
                        class="am-connection-item">
                        <span>{{ admin.identifier }}</span>
                        <button 
                          @click="removeConnection('staff_admin', admin.identifier)"
                          class="am-button-icon-small danger">
                          ✖
                        </button>
                      </div>
                      <div v-if="!connectionAccount?.connections?.staffAdmins?.length" class="am-empty">
                        No staff admins assigned
                      </div>
                    </div>
                    <div class="am-add-connection">
                      <select 
                        v-model="newAdminEmail" 
                        class="am-select"
                        @change="newAdminEmail && addConnection('staff_admin', newAdminEmail)">
                        <option value="">+ Add Staff Admin...</option>
                        <option 
                          v-for="admin in availableStaff.staffAdmins" 
                          :key="admin.email"
                          :value="admin.email">
                          {{ admin.fullName }} ({{ admin.email }})
                        </option>
                      </select>
                    </div>
                  </div>
                </div>
                
                <div class="am-modal-footer">
                  <button @click="closeConnectionModal" class="am-button primary">
                    Done
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Empty State -->
            <div v-if="accounts.length === 0 && !loading" class="am-empty-state">
              <span class="am-icon-large">🔍</span>
              <h2>No Accounts Found</h2>
              <p v-if="searchQuery">
                No accounts match your search "{{ searchQuery }}"
              </p>
              <p v-else>
                No {{ currentTab }} found in the system.
              </p>
            </div>
            
            <!-- Helper Text -->
            <div class="am-helper-text">
              💡 <strong>Tip:</strong> Double-click any field to edit inline, or click the edit button for full editing.
            </div>
          </div>
        `
      });
      
      // Mount the app
      app.mount(container);
      debugLog('Vue app mounted to container');
    }
    
    function injectStyles() {
      if (document.getElementById('account-manager-v3-styles')) return;
      
      const styles = document.createElement('style');
      styles.id = 'account-manager-v3-styles';
      styles.textContent = `
        /* ========== VESPA Account Manager V3 Styles ========== */
        
        * {
          box-sizing: border-box;
        }
        
        .vespa-account-manager {
          padding: 20px;
          max-width: 100%;
          margin: 0 auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: #f5f7fa;
          min-height: 100vh;
        }
        
        /* ========== Loading Overlay ========== */
        .am-loading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(42, 60, 122, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }
        
        .am-loading-content {
          text-align: center;
          color: white;
        }
        
        .am-spinner {
          width: 60px;
          height: 60px;
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: am-spin 1s linear infinite;
          margin: 0 auto 20px;
        }
        
        @keyframes am-spin {
          to { transform: rotate(360deg); }
        }
        
        .am-loading-text {
          font-size: 18px;
          font-weight: 500;
        }
        
        /* ========== Header ========== */
        .am-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding: 30px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .am-header h1 {
          font-size: 32px;
          color: #2a3c7a;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 700;
        }
        
        .am-icon {
          font-size: 1em;
        }
        
        .am-auth-badge {
          margin-top: 8px;
        }
        
        .am-badge {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .am-badge.super-user {
          background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
          color: white;
        }
        
        .am-badge.school {
          background: linear-gradient(135deg, #079baa, #00e5db);
          color: white;
        }
        
        /* ========== Messages ========== */
        .am-message {
          padding: 14px 20px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-weight: 500;
          animation: am-slideDown 0.3s ease-out;
        }
        
        @keyframes am-slideDown {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .am-message-success {
          background: #d4edda;
          border-left: 4px solid #28a745;
          color: #155724;
        }
        
        .am-message-error {
          background: #f8d7da;
          border-left: 4px solid #dc3545;
          color: #721c24;
        }
        
        .am-message-warning {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          color: #856404;
        }
        
        .am-message-info {
          background: #d1ecf1;
          border-left: 4px solid #17a2b8;
          color: #0c5460;
        }
        
        /* ========== Tabs ========== */
        .am-tabs {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }
        
        .am-tab {
          flex: 1;
          max-width: 300px;
          padding: 16px 24px;
          background: white;
          border: 2px solid #e0e0e0;
          border-radius: 10px;
          font-size: 18px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: #666;
        }
        
        .am-tab:hover {
          border-color: #079baa;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(7, 155, 170, 0.2);
        }
        
        .am-tab.active {
          background: linear-gradient(135deg, #2a3c7a, #3a4c8a);
          color: white;
          border-color: #2a3c7a;
          box-shadow: 0 4px 12px rgba(42, 60, 122, 0.3);
        }
        
        .am-tab-count {
          background: rgba(255, 255, 255, 0.3);
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 14px;
        }
        
        .am-tab.active .am-tab-count {
          background: rgba(255, 255, 255, 0.2);
        }
        
        /* ========== Toolbar ========== */
        .am-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          background: white;
          border-radius: 10px;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        
        .am-toolbar-left, .am-toolbar-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .am-selection-info {
          background: #e3f2fd;
          color: #1976d2;
          padding: 8px 16px;
          border-radius: 6px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .am-bulk-actions {
          position: relative;
        }
        
        .am-dropdown-menu {
          position: absolute;
          top: 100%;
          left: 0;
          margin-top: 8px;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          min-width: 200px;
          z-index: 1000;
          animation: am-fadeIn 0.2s ease-out;
        }
        
        @keyframes am-fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .am-dropdown-item {
          width: 100%;
          padding: 12px 16px;
          background: none;
          border: none;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 500;
        }
        
        .am-dropdown-item:hover {
          background: #f5f7fa;
        }
        
        .am-dropdown-item.danger {
          color: #dc3545;
        }
        
        .am-dropdown-item.danger:hover {
          background: #fee;
        }
        
        /* ========== Search & Filters ========== */
        .am-search-box {
          display: flex;
          gap: 8px;
        }
        
        .am-search-input {
          width: 300px;
          padding: 10px 16px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          transition: all 0.3s;
        }
        
        .am-search-input:focus {
          outline: none;
          border-color: #079baa;
          box-shadow: 0 0 0 3px rgba(7, 155, 170, 0.1);
        }
        
        .am-search-btn {
          padding: 10px 20px;
          background: linear-gradient(135deg, #079baa, #00e5db);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .am-search-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(7, 155, 170, 0.3);
        }
        
        .am-select {
          padding: 10px 16px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          background: white;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .am-select:focus {
          outline: none;
          border-color: #079baa;
          box-shadow: 0 0 0 3px rgba(7, 155, 170, 0.1);
        }
        
        /* ========== Table ========== */
        .am-table-container {
          background: white;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          overflow: hidden;
          margin-bottom: 20px;
        }
        
        .am-table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .am-table thead {
          background: linear-gradient(135deg, #2a3c7a, #3a4c8a);
          color: white;
        }
        
        .am-table th {
          padding: 16px;
          text-align: left;
          font-weight: 600;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .am-th-checkbox {
          width: 50px;
          text-align: center;
        }
        
        .am-th-actions {
          width: 200px;
          text-align: center;
        }
        
        .am-tr {
          border-bottom: 1px solid #e0e0e0;
          transition: all 0.2s;
        }
        
        .am-tr:hover {
          background: #f5f7fa;
        }
        
        .am-tr-selected {
          background: #e3f2fd !important;
        }
        
        .am-tr-editing {
          background: #fff8e1 !important;
          box-shadow: inset 0 0 0 2px #ffc107;
        }
        
        .am-table td {
          padding: 14px 16px;
          font-size: 14px;
          color: #333;
        }
        
        .am-td-checkbox {
          text-align: center;
        }
        
        .am-td-editable {
          cursor: pointer;
          position: relative;
        }
        
        .am-td-editable:hover {
          background: #f0f7ff;
        }
        
        .am-td-email {
          color: #1976d2;
          font-family: 'Courier New', monospace;
          font-size: 13px;
        }
        
        .am-td-empty {
          text-align: center;
          padding: 60px 20px;
          color: #999;
          font-style: italic;
        }
        
        .am-td-actions {
          text-align: center;
        }
        
        .am-checkbox {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: #079baa;
        }
        
        /* ========== Inline Editing ========== */
        .am-inline-edit {
          display: flex;
          gap: 8px;
        }
        
        .am-input-inline, .am-select-inline {
          padding: 6px 10px;
          border: 2px solid #079baa;
          border-radius: 6px;
          font-size: 14px;
          flex: 1;
        }
        
        .am-input-inline:focus, .am-select-inline:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(7, 155, 170, 0.2);
        }
        
        /* ========== Action Buttons ========== */
        .am-action-group {
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        
        .am-button-icon {
          padding: 8px 12px;
          background: #f5f7fa;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 16px;
        }
        
        .am-button-icon:hover {
          background: #079baa;
          color: white;
          transform: translateY(-2px);
          box-shadow: 0 2px 8px rgba(7, 155, 170, 0.3);
        }
        
        .am-button-icon.success {
          background: #28a745;
          color: white;
          border-color: #28a745;
        }
        
        .am-button-icon.success:hover {
          background: #218838;
        }
        
        .am-button-icon.danger {
          background: #dc3545;
          color: white;
          border-color: #dc3545;
        }
        
        .am-button-icon.danger:hover {
          background: #c82333;
        }
        
        .am-button {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .am-button.primary {
          background: linear-gradient(135deg, #079baa, #00e5db);
          color: white;
        }
        
        .am-button.primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(7, 155, 170, 0.3);
        }
        
        .am-button.secondary {
          background: #6c757d;
          color: white;
        }
        
        .am-button.secondary:hover {
          background: #5a6268;
        }
        
        .am-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .am-button-link {
          background: none;
          border: none;
          color: #079baa;
          text-decoration: underline;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
        }
        
        .am-button-link:hover {
          color: #006b7a;
        }
        
        /* ========== Roles ========== */
        .am-roles {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        
        .am-role-badge {
          background: #e3f2fd;
          color: #1976d2;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          text-transform: capitalize;
        }
        
        /* ========== Modal ========== */
        .am-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          animation: am-fadeIn 0.3s ease-out;
        }
        
        .am-modal {
          background: white;
          border-radius: 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.3);
          max-width: 800px;
          width: 90%;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          animation: am-slideUp 0.3s ease-out;
        }
        
        @keyframes am-slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .am-modal-header {
          padding: 24px;
          border-bottom: 2px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: linear-gradient(135deg, #2a3c7a, #3a4c8a);
          color: white;
        }
        
        .am-modal-header h3 {
          margin: 0;
          font-size: 20px;
        }
        
        .am-modal-close {
          background: none;
          border: none;
          color: white;
          font-size: 28px;
          cursor: pointer;
          line-height: 1;
          padding: 0;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          transition: all 0.2s;
        }
        
        .am-modal-close:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        
        .am-modal-body {
          padding: 24px;
          overflow-y: auto;
          flex: 1;
        }
        
        .am-modal-footer {
          padding: 20px 24px;
          border-top: 2px solid #e0e0e0;
          display: flex;
          justify-content: flex-end;
          gap: 12px;
        }
        
        /* ========== Connection Management ========== */
        .am-connection-section {
          margin-bottom: 32px;
        }
        
        .am-connection-section h4 {
          margin: 0 0 16px 0;
          color: #2a3c7a;
          font-size: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .am-connection-list {
          background: #f5f7fa;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 12px;
          min-height: 50px;
        }
        
        .am-connection-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 12px;
          background: white;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
          margin-bottom: 8px;
        }
        
        .am-connection-item:last-child {
          margin-bottom: 0;
        }
        
        .am-empty {
          text-align: center;
          padding: 20px;
          color: #999;
          font-style: italic;
        }
        
        .am-add-connection {
          margin-top: 8px;
        }
        
        .am-button-icon-small {
          padding: 4px 10px;
          background: #f5f7fa;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 14px;
        }
        
        .am-button-icon-small:hover {
          background: #dc3545;
          color: white;
          border-color: #dc3545;
        }
        
        /* ========== Pagination ========== */
        .am-pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 20px;
          padding: 20px;
          background: white;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        
        .am-page-info {
          font-weight: 600;
          color: #666;
        }
        
        /* ========== Empty State ========== */
        .am-empty-state {
          background: white;
          border-radius: 12px;
          padding: 80px 40px;
          text-align: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .am-icon-large {
          font-size: 80px;
          display: block;
          margin-bottom: 20px;
          opacity: 0.3;
        }
        
        .am-empty-state h2 {
          color: #2a3c7a;
          margin: 0 0 12px 0;
        }
        
        .am-empty-state p {
          color: #666;
          font-size: 16px;
          margin: 0;
        }
        
        /* ========== Helper Text ========== */
        .am-helper-text {
          padding: 16px 20px;
          background: #e3f2fd;
          border-left: 4px solid #2196f3;
          border-radius: 8px;
          color: #0d47a1;
          font-size: 14px;
        }
        
        /* ========== Responsive Design ========== */
        @media (max-width: 1200px) {
          .am-table {
            font-size: 13px;
          }
          
          .am-table th, .am-table td {
            padding: 12px 10px;
          }
        }
        
        @media (max-width: 768px) {
          .vespa-account-manager {
            padding: 12px;
          }
          
          .am-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
            padding: 20px;
          }
          
          .am-header h1 {
            font-size: 24px;
          }
          
          .am-toolbar {
            flex-direction: column;
            gap: 12px;
          }
          
          .am-toolbar-left, .am-toolbar-right {
            width: 100%;
            flex-direction: column;
          }
          
          .am-search-input {
            width: 100%;
          }
          
          .am-table-container {
            overflow-x: auto;
          }
          
          .am-table {
            min-width: 800px;
          }
          
          .am-modal {
            width: 95%;
            margin: 10px;
          }
        }
      `;
      
      document.head.appendChild(styles);
      debugLog('Styles injected');
    }
  };
  
  debugLog('Initialization function registered');
})();

