/**
 * VESPA Account Manager V2 - Supabase-First Account Management UI
 * 
 * A modern Vue.js interface for managing student and staff accounts
 * using the new Supabase-first architecture with RLS and emulation support.
 * 
 * Features:
 * - Search and edit students/staff
 * - Manage staff roles
 * - Manage staff-student connections
 * - Super user emulation support
 * - Real-time updates
 * - Beautiful modern UI
 * 
 * Version: 1a
 * Date: November 27, 2025
 */

(function() {
  'use strict';
  
  const VERSION = '1b';
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
    
    // Get emulation state from upload system if available
    function getEmulationState() {
      try {
        const stored = sessionStorage.getItem('vespa_emulation_state');
        return stored ? JSON.parse(stored) : null;
      } catch (e) {
        return null;
      }
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
            
            // Environment check
            envReady: false,
            envError: null,
            
            // User context
            currentUser: null,
            isEmulating: false,
            emulatedSchool: null,
            
            // Search & filters
            searchQuery: '',
            accountType: 'student', // 'student' or 'staff'
            searchResults: [],
            loading: false,
            
            // Selected account
            selectedAccount: null,
            selectedRoles: [],
            selectedConnections: [],
            
            // Edit mode
            editing: false,
            editForm: {
              firstName: '',
              lastName: '',
              yearGroup: '',
              tutorGroup: '',
              gender: ''
            },
            
            // Role management
            availableRoles: [
              { value: 'staff_admin', label: 'Staff Admin' },
              { value: 'tutor', label: 'Tutor' },
              { value: 'head_of_year', label: 'Head of Year' },
              { value: 'subject_teacher', label: 'Subject Teacher' },
              { value: 'head_of_dept', label: 'Head of Department' },
              { value: 'general_staff', label: 'General Staff' }
            ],
            
            // Connection management
            connectionType: 'tutor',
            staffSearchQuery: '',
            staffSearchResults: [],
            
            // Feedback
            message: null,
            messageType: null
          };
        },
        
        computed: {
          emulatedSchoolId() {
            return this.emulatedSchool?.id || null;
          },
          
          searchPlaceholder() {
            return this.accountType === 'student' 
              ? 'Search by email, name, or year group...'
              : 'Search by email or name...';
          }
        },
        
        mounted() {
          debugLog('Vue app mounted');
          this.initializeContext();
          this.loadEmulationState();
          this.checkEnvironment();
        },
        
        methods: {
          // Initialize user context
          initializeContext() {
            if (typeof Knack !== 'undefined' && Knack.getUserAttributes) {
              this.currentUser = Knack.getUserAttributes();
              debugLog('Current user', this.currentUser);
            }
          },
          
          // Load emulation state from sessionStorage
          loadEmulationState() {
            const emulationState = getEmulationState();
            if (emulationState && emulationState.school) {
              this.isEmulating = true;
              this.emulatedSchool = emulationState.school;
              debugLog('Emulation state loaded', this.emulatedSchool);
              this.showMessage('Emulation mode active: ' + this.emulatedSchool.name, 'info');
            }
          },
          
          // Check if environment is ready
          async checkEnvironment() {
            try {
              debugLog('Checking API environment...');
              
              // Test API connection
              const response = await fetch(`${this.apiUrl}/api/status`, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json'
                }
              });
              
              if (!response.ok) {
                throw new Error(`API returned ${response.status}`);
              }
              
              const data = await response.json();
              debugLog('API Status:', data);
              
              this.envReady = true;
              this.showMessage('Connected to API', 'success');
              
            } catch (error) {
              console.error('Environment check failed:', error);
              this.envError = error.message;
              this.showMessage('⚠️ API Connection Issue: ' + error.message + '. Some features may not work.', 'warning');
            }
          },
          
          // Search for accounts
          async searchAccounts() {
            if (!this.searchQuery || this.searchQuery.length < 2) {
              this.showMessage('Please enter at least 2 characters', 'warning');
              return;
            }
            
            this.loading = true;
            this.searchResults = [];
            this.selectedAccount = null;
            
            try {
              debugLog('Searching accounts', { 
                query: this.searchQuery, 
                type: this.accountType 
              });
              
              // Call Supabase via the backend API
              const params = new URLSearchParams({
                q: this.searchQuery
              });
              if (this.emulatedSchoolId) {
                params.append('emulatedSchoolId', this.emulatedSchoolId);
              }
              
              const url = `${this.apiUrl}/api/v2/accounts/search/${this.accountType}?${params}`;
              debugLog('Fetching:', url);
              
              const response = await fetch(url, {
                method: 'GET',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                }
              });
              
              debugLog('Response status:', response.status);
              
              if (!response.ok) {
                const errorText = await response.text();
                debugLog('Error response:', errorText);
                throw new Error(`API returned ${response.status}: ${errorText}`);
              }
              
              const data = await response.json();
              debugLog('Search results:', data);
              
              if (data.success) {
                this.searchResults = data.results || [];
                if (this.searchResults.length === 0) {
                  this.showMessage('No accounts found matching your search', 'info');
                } else {
                  this.showMessage(`Found ${this.searchResults.length} account(s)`, 'success');
                }
              } else {
                this.showMessage(data.message || 'Search failed', 'error');
              }
              
            } catch (error) {
              console.error('Search error:', error);
              this.showMessage('Search failed: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          // Select an account for editing
          async selectAccount(account) {
            this.loading = true;
            this.selectedAccount = null;
            
            try {
              debugLog('Loading account details', { email: account.email });
              
              // Get full account details including roles and connections
              const params = new URLSearchParams();
              if (this.emulatedSchoolId) {
                params.append('emulatedSchoolId', this.emulatedSchoolId);
              }
              
              const response = await fetch(
                `${this.apiUrl}/api/v2/accounts/${encodeURIComponent(account.email)}?${params}`,
                {
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.selectedAccount = data.account;
                
                // Populate edit form
                const profile = data.account.vespa_students?.[0] || data.account.vespa_staff?.[0];
                if (profile) {
                  this.editForm.firstName = profile.first_name || '';
                  this.editForm.lastName = profile.last_name || '';
                  this.editForm.yearGroup = profile.year_group || '';
                  this.editForm.tutorGroup = profile.tutor_group || '';
                  this.editForm.gender = profile.gender || '';
                }
                
                // Load roles if staff
                if (data.account.account_type === 'staff') {
                  await this.loadStaffRoles(account.email);
                }
                
                // Load connections
                await this.loadConnections(account.email);
                
                this.showMessage('Account loaded', 'success');
              } else {
                this.showMessage(data.message || 'Failed to load account', 'error');
              }
              
            } catch (error) {
              console.error('Load account error:', error);
              this.showMessage('Failed to load account: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          // Load staff roles
          async loadStaffRoles(email) {
            try {
              const params = new URLSearchParams({ email });
              if (this.emulatedSchoolId) {
                params.append('emulatedSchoolId', this.emulatedSchoolId);
              }
              
              const response = await fetch(
                `${this.apiUrl}/api/v2/roles?${params}`,
                { headers: { 'Content-Type': 'application/json' } }
              );
              
              const data = await response.json();
              if (data.success) {
                this.selectedRoles = data.roles || [];
              }
            } catch (error) {
              console.error('Load roles error:', error);
            }
          },
          
          // Load connections
          async loadConnections(email) {
            try {
              const params = new URLSearchParams({ email });
              if (this.emulatedSchoolId) {
                params.append('emulatedSchoolId', this.emulatedSchoolId);
              }
              
              const response = await fetch(
                `${this.apiUrl}/api/v2/connections?${params}`,
                { headers: { 'Content-Type': 'application/json' } }
              );
              
              const data = await response.json();
              if (data.success) {
                this.selectedConnections = data.connections || [];
              }
            } catch (error) {
              console.error('Load connections error:', error);
            }
          },
          
          // Save account updates
          async saveAccount() {
            if (!this.selectedAccount) return;
            
            this.loading = true;
            
            try {
              debugLog('Saving account', this.editForm);
              
              const response = await fetch(
                `${this.apiUrl}/api/v2/accounts/${encodeURIComponent(this.selectedAccount.email)}`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    firstName: this.editForm.firstName,
                    lastName: this.editForm.lastName,
                    yearGroup: this.editForm.yearGroup,
                    tutorGroup: this.editForm.tutorGroup,
                    gender: this.editForm.gender,
                    emulatedSchoolId: this.emulatedSchoolId
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('Account updated successfully (Supabase → Knack)', 'success');
                this.editing = false;
                // Reload account
                await this.selectAccount(this.selectedAccount);
              } else {
                this.showMessage(data.message || 'Update failed', 'error');
              }
              
            } catch (error) {
              console.error('Save error:', error);
              this.showMessage('Update failed: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          // Toggle staff role
          async toggleRole(role) {
            if (!this.selectedAccount || this.selectedAccount.account_type !== 'staff') return;
            
            const hasRole = this.selectedRoles.some(r => r.role_type === role.value);
            const action = hasRole ? 'remove' : 'add';
            
            this.loading = true;
            
            try {
              const response = await fetch(
                `${this.apiUrl}/api/v2/accounts/${encodeURIComponent(this.selectedAccount.email)}/roles`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    roleType: role.value,
                    action: action,
                    emulatedSchoolId: this.emulatedSchoolId
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage(`Role ${action === 'add' ? 'added' : 'removed'}`, 'success');
                await this.loadStaffRoles(this.selectedAccount.email);
              } else {
                this.showMessage(data.message || 'Role update failed', 'error');
              }
              
            } catch (error) {
              console.error('Toggle role error:', error);
              this.showMessage('Role update failed: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          // Show message
          showMessage(text, type = 'info') {
            this.message = text;
            this.messageType = type;
            setTimeout(() => {
              this.message = null;
            }, 5000);
          },
          
          // Format date
          formatDate(dateString) {
            if (!dateString) return 'N/A';
            return new Date(dateString).toLocaleDateString('en-GB');
          },
          
          // Check if role is active
          hasRole(roleValue) {
            return this.selectedRoles.some(r => r.role_type === roleValue);
          },
          
          // Add connection
          async addConnection() {
            if (!this.selectedAccount || !this.staffSearchQuery) return;
            
            this.loading = true;
            
            try {
              const response = await fetch(
                `${this.apiUrl}/api/v2/connections`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    staffEmail: this.staffSearchQuery.trim(),
                    studentEmail: this.selectedAccount.email,
                    connectionType: this.connectionType,
                    emulatedSchoolId: this.emulatedSchoolId
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('Connection added successfully', 'success');
                this.staffSearchQuery = '';
                await this.loadConnections(this.selectedAccount.email);
              } else {
                this.showMessage(data.message || 'Failed to add connection', 'error');
              }
              
            } catch (error) {
              console.error('Add connection error:', error);
              this.showMessage('Failed to add connection: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          // Remove connection
          async removeConnection(connectionId) {
            if (!confirm('Are you sure you want to remove this connection?')) return;
            
            this.loading = true;
            
            try {
              const response = await fetch(
                `${this.apiUrl}/api/v2/connections/${connectionId}`,
                {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    emulatedSchoolId: this.emulatedSchoolId
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('Connection removed successfully', 'success');
                await this.loadConnections(this.selectedAccount.email);
              } else {
                this.showMessage(data.message || 'Failed to remove connection', 'error');
              }
              
            } catch (error) {
              console.error('Remove connection error:', error);
              this.showMessage('Failed to remove connection: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          }
        },
        
        template: `
          <div class="account-manager">
            <!-- Header -->
            <div class="am-header">
              <h1>
                <span class="icon">👤</span>
                Account Manager V2
                <span class="badge">Supabase-First</span>
              </h1>
              
              <!-- Emulation Status -->
              <div v-if="isEmulating" class="emulation-badge">
                <span class="icon">🏢</span>
                Emulating: {{ emulatedSchool.name }}
              </div>
            </div>
            
            <!-- Search Section -->
            <div class="am-search-section">
              <div class="am-tabs">
                <button 
                  class="am-tab" 
                  :class="{ active: accountType === 'student' }"
                  @click="accountType = 'student'; searchResults = []; selectedAccount = null;">
                  <span class="icon">🎓</span>
                  Students
                </button>
                <button 
                  class="am-tab" 
                  :class="{ active: accountType === 'staff' }"
                  @click="accountType = 'staff'; searchResults = []; selectedAccount = null;">
                  <span class="icon">👨‍🏫</span>
                  Staff
                </button>
              </div>
              
              <div class="am-search-box">
                <input 
                  type="text" 
                  v-model="searchQuery"
                  :placeholder="searchPlaceholder"
                  @keyup.enter="searchAccounts"
                  class="am-search-input"
                />
                <button 
                  @click="searchAccounts" 
                  class="am-search-btn"
                  :disabled="loading">
                  <span v-if="!loading">🔍 Search</span>
                  <span v-else>⏳ Searching...</span>
                </button>
              </div>
            </div>
            
            <!-- Message Display -->
            <div v-if="message" class="am-message" :class="'am-message-' + messageType">
              {{ message }}
            </div>
            
            <!-- Search Results -->
            <div v-if="searchResults.length > 0 && !selectedAccount" class="am-results">
              <h3>Search Results ({{ searchResults.length }})</h3>
              <div class="am-results-grid">
                <div 
                  v-for="account in searchResults" 
                  :key="account.email"
                  class="am-result-card"
                  @click="selectAccount(account)">
                  <div class="am-result-header">
                    <span class="icon">{{ accountType === 'student' ? '🎓' : '👨‍🏫' }}</span>
                    <strong>{{ account.first_name }} {{ account.last_name }}</strong>
                  </div>
                  <div class="am-result-details">
                    <div>📧 {{ account.email }}</div>
                    <div v-if="account.year_group">📚 Year {{ account.year_group }}</div>
                    <div v-if="account.school_name">🏫 {{ account.school_name }}</div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Account Details -->
            <div v-if="selectedAccount" class="am-details">
              <div class="am-details-header">
                <button @click="selectedAccount = null; editing = false;" class="am-back-btn">
                  ← Back to Search
                </button>
                <button 
                  v-if="!editing" 
                  @click="editing = true" 
                  class="am-edit-btn">
                  ✏️ Edit
                </button>
                <button 
                  v-if="editing" 
                  @click="editing = false" 
                  class="am-cancel-btn">
                  ✖️ Cancel
                </button>
              </div>
              
              <div class="am-details-content">
                <!-- Basic Info -->
                <div class="am-section">
                  <h3>
                    <span class="icon">📋</span>
                    Basic Information
                  </h3>
                  
                  <div v-if="!editing" class="am-info-grid">
                    <div class="am-info-item">
                      <label>Email</label>
                      <div>{{ selectedAccount.email }}</div>
                    </div>
                    <div class="am-info-item">
                      <label>First Name</label>
                      <div>{{ editForm.firstName || 'N/A' }}</div>
                    </div>
                    <div class="am-info-item">
                      <label>Last Name</label>
                      <div>{{ editForm.lastName || 'N/A' }}</div>
                    </div>
                    <div v-if="accountType === 'student'" class="am-info-item">
                      <label>Year Group</label>
                      <div>{{ editForm.yearGroup || 'N/A' }}</div>
                    </div>
                    <div v-if="accountType === 'student'" class="am-info-item">
                      <label>Tutor Group</label>
                      <div>{{ editForm.tutorGroup || 'N/A' }}</div>
                    </div>
                    <div v-if="accountType === 'student'" class="am-info-item">
                      <label>Gender</label>
                      <div>{{ editForm.gender || 'N/A' }}</div>
                    </div>
                    <div class="am-info-item">
                      <label>School</label>
                      <div>{{ selectedAccount.school_name || 'N/A' }}</div>
                    </div>
                    <div class="am-info-item">
                      <label>Account Type</label>
                      <div class="am-badge">{{ selectedAccount.account_type }}</div>
                    </div>
                  </div>
                  
                  <form v-else @submit.prevent="saveAccount" class="am-edit-form">
                    <div class="am-form-row">
                      <label>First Name</label>
                      <input type="text" v-model="editForm.firstName" required />
                    </div>
                    <div class="am-form-row">
                      <label>Last Name</label>
                      <input type="text" v-model="editForm.lastName" required />
                    </div>
                    <div v-if="accountType === 'student'" class="am-form-row">
                      <label>Year Group</label>
                      <select v-model="editForm.yearGroup">
                        <option value="">Select...</option>
                        <option value="7">Year 7</option>
                        <option value="8">Year 8</option>
                        <option value="9">Year 9</option>
                        <option value="10">Year 10</option>
                        <option value="11">Year 11</option>
                        <option value="12">Year 12</option>
                        <option value="13">Year 13</option>
                      </select>
                    </div>
                    <div v-if="accountType === 'student'" class="am-form-row">
                      <label>Tutor Group</label>
                      <input type="text" v-model="editForm.tutorGroup" />
                    </div>
                    <div v-if="accountType === 'student'" class="am-form-row">
                      <label>Gender</label>
                      <select v-model="editForm.gender">
                        <option value="">Select...</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                    
                    <div class="am-form-actions">
                      <button type="submit" class="am-save-btn" :disabled="loading">
                        <span v-if="!loading">💾 Save Changes</span>
                        <span v-else>⏳ Saving...</span>
                      </button>
                    </div>
                    
                    <div class="am-info-box">
                      <strong>ℹ️ Supabase-First:</strong> Changes save to Supabase first, then sync to Knack automatically
                    </div>
                  </form>
                </div>
                
                <!-- Staff Roles -->
                <div v-if="selectedAccount && selectedAccount.account_type === 'staff'" class="am-section">
                  <h3>
                    <span class="icon">🎭</span>
                    Staff Roles
                  </h3>
                  
                  <div class="am-roles-grid">
                    <button
                      v-for="role in availableRoles"
                      :key="role.value"
                      @click="toggleRole(role)"
                      class="am-role-badge"
                      :class="{ active: hasRole(role.value) }"
                      :disabled="loading">
                      <span v-if="hasRole(role.value)">✓</span>
                      <span v-else>+</span>
                      {{ role.label }}
                    </button>
                  </div>
                  
                  <div class="am-info-box">
                    Click to add/remove roles. Changes sync to Knack automatically.
                  </div>
                </div>
                
                <!-- Connections (for students) -->
                <div v-if="selectedAccount && selectedAccount.account_type === 'student'" class="am-section">
                  <h3>
                    <span class="icon">🔗</span>
                    Staff Connections
                  </h3>
                  
                  <div v-if="selectedConnections.length > 0" class="am-connections-list">
                    <div 
                      v-for="conn in selectedConnections" 
                      :key="conn.id"
                      class="am-connection-item">
                      <span class="icon">{{ conn.connection_type === 'tutor' ? '👨‍🏫' : '👔' }}</span>
                      <div class="am-connection-info">
                        <strong>{{ conn.staff_email }}</strong>
                        <small>{{ conn.connection_type.replace('_', ' ') }}</small>
                      </div>
                      <button 
                        @click="removeConnection(conn.id)"
                        class="am-remove-btn"
                        :disabled="loading">
                        ✖️
                      </button>
                    </div>
                  </div>
                  
                  <div v-else class="am-empty-state">
                    No connections found
                  </div>
                  
                  <div class="am-add-connection">
                    <h4>Add New Connection</h4>
                    <div class="am-connection-form">
                      <select v-model="connectionType" class="am-select">
                        <option value="tutor">Tutor</option>
                        <option value="head_of_year">Head of Year</option>
                        <option value="subject_teacher">Subject Teacher</option>
                        <option value="staff_admin">Staff Admin</option>
                      </select>
                      <input 
                        type="email" 
                        v-model="staffSearchQuery"
                        placeholder="Staff email..."
                        class="am-input"
                      />
                      <button 
                        @click="addConnection"
                        class="am-add-btn"
                        :disabled="loading || !staffSearchQuery">
                        + Add
                      </button>
                    </div>
                  </div>
                </div>
                
                <!-- Metadata -->
                <div class="am-section am-metadata">
                  <h3>
                    <span class="icon">🔧</span>
                    System Metadata
                  </h3>
                  <div class="am-metadata-grid">
                    <div>
                      <label>Account ID</label>
                      <code>{{ selectedAccount.id }}</code>
                    </div>
                    <div>
                      <label>School ID</label>
                      <code>{{ selectedAccount.school_id }}</code>
                    </div>
                    <div>
                      <label>Created</label>
                      <span>{{ formatDate(selectedAccount.created_at) }}</span>
                    </div>
                    <div>
                      <label>Last Updated</label>
                      <span>{{ formatDate(selectedAccount.updated_at) }}</span>
                    </div>
                    <div v-if="selectedAccount.vespa_students?.[0]">
                      <label>Last Synced from Knack</label>
                      <span>{{ formatDate(selectedAccount.vespa_students[0].last_synced_from_knack) }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Empty State -->
            <div v-if="searchResults.length === 0 && !selectedAccount && !loading" class="am-empty-state-main">
              <span class="icon-large">🔍</span>
              <h2>Search for an Account</h2>
              <p>Select {{ accountType === 'student' ? 'Students' : 'Staff' }} tab above and search by email or name</p>
              <div class="am-info-box">
                <strong>💡 Tip:</strong> This system writes to Supabase first, then syncs to Knack.<br/>
                Use this instead of editing Knack directly!
              </div>
            </div>
          </div>
        `
      });
      
      // Mount the app
      app.mount(container);
      debugLog('Vue app mounted to container');
    }
    
    function injectStyles() {
      if (document.getElementById('account-manager-styles')) return;
      
      const styles = document.createElement('style');
      styles.id = 'account-manager-styles';
      styles.textContent = `
        /* Account Manager Styles */
        .account-manager {
          padding: 20px;
          max-width: 1400px;
          margin: 0 auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }
        
        /* Header */
        .am-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding-bottom: 20px;
          border-bottom: 2px solid #e0e0e0;
        }
        
        .am-header h1 {
          font-size: 28px;
          color: #2a3c7a;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .am-header .badge {
          background: linear-gradient(135deg, #079baa, #00e5db);
          color: white;
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .emulation-badge {
          background: #fff3cd;
          border: 2px solid #ffc107;
          color: #856404;
          padding: 8px 16px;
          border-radius: 8px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        /* Search Section */
        .am-search-section {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          margin-bottom: 24px;
        }
        
        .am-tabs {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
        }
        
        .am-tab {
          flex: 1;
          padding: 12px 24px;
          border: 2px solid #e0e0e0;
          background: white;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        
        .am-tab:hover {
          border-color: #079baa;
          transform: translateY(-2px);
        }
        
        .am-tab.active {
          background: linear-gradient(135deg, #079baa, #00e5db);
          color: white;
          border-color: #079baa;
        }
        
        .am-search-box {
          display: flex;
          gap: 12px;
        }
        
        .am-search-input {
          flex: 1;
          padding: 14px 20px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 16px;
          transition: all 0.3s;
        }
        
        .am-search-input:focus {
          outline: none;
          border-color: #079baa;
          box-shadow: 0 0 0 3px rgba(7, 155, 170, 0.1);
        }
        
        .am-search-btn {
          padding: 14px 32px;
          background: linear-gradient(135deg, #079baa, #00e5db);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          white-space: nowrap;
        }
        
        .am-search-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(7, 155, 170, 0.3);
        }
        
        .am-search-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        /* Messages */
        .am-message {
          padding: 14px 20px;
          border-radius: 8px;
          margin-bottom: 20px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .am-message-success {
          background: #d4edda;
          border: 1px solid #c3e6cb;
          color: #155724;
        }
        
        .am-message-error {
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          color: #721c24;
        }
        
        .am-message-warning {
          background: #fff3cd;
          border: 1px solid #ffeeba;
          color: #856404;
        }
        
        .am-message-info {
          background: #d1ecf1;
          border: 1px solid #bee5eb;
          color: #0c5460;
        }
        
        /* Search Results */
        .am-results {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .am-results h3 {
          margin: 0 0 20px 0;
          color: #2a3c7a;
          font-size: 20px;
        }
        
        .am-results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }
        
        .am-result-card {
          padding: 16px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .am-result-card:hover {
          border-color: #079baa;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(7, 155, 170, 0.2);
        }
        
        .am-result-header {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
          font-size: 16px;
          color: #2a3c7a;
        }
        
        .am-result-details {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 14px;
          color: #666;
        }
        
        /* Details View */
        .am-details {
          background: white;
          border-radius: 12px;
          padding: 24px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .am-details-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 2px solid #e0e0e0;
        }
        
        .am-back-btn {
          padding: 10px 20px;
          background: #6c757d;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .am-back-btn:hover {
          background: #5a6268;
          transform: translateX(-4px);
        }
        
        .am-edit-btn {
          padding: 10px 20px;
          background: linear-gradient(135deg, #079baa, #00e5db);
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .am-edit-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(7, 155, 170, 0.3);
        }
        
        .am-cancel-btn {
          padding: 10px 20px;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .am-cancel-btn:hover {
          background: #c82333;
        }
        
        .am-section {
          margin-bottom: 32px;
        }
        
        .am-section h3 {
          margin: 0 0 20px 0;
          color: #2a3c7a;
          font-size: 20px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        
        .am-info-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 20px;
        }
        
        .am-info-item label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }
        
        .am-info-item div {
          font-size: 16px;
          color: #333;
          font-weight: 500;
        }
        
        .am-badge {
          display: inline-block;
          background: #e3f2fd;
          color: #1976d2;
          padding: 4px 12px;
          border-radius: 4px;
          font-size: 14px;
          font-weight: 600;
          text-transform: capitalize;
        }
        
        /* Edit Form */
        .am-edit-form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .am-form-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .am-form-row label {
          font-size: 14px;
          font-weight: 600;
          color: #333;
        }
        
        .am-form-row input,
        .am-form-row select {
          padding: 12px 16px;
          border: 2px solid #e0e0e0;
          border-radius: 6px;
          font-size: 16px;
          transition: all 0.3s;
        }
        
        .am-form-row input:focus,
        .am-form-row select:focus {
          outline: none;
          border-color: #079baa;
          box-shadow: 0 0 0 3px rgba(7, 155, 170, 0.1);
        }
        
        .am-form-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 8px;
        }
        
        .am-save-btn {
          padding: 14px 32px;
          background: linear-gradient(135deg, #079baa, #00e5db);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .am-save-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(7, 155, 170, 0.3);
        }
        
        .am-save-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        /* Roles */
        .am-roles-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }
        
        .am-role-badge {
          padding: 12px 16px;
          border: 2px solid #e0e0e0;
          background: white;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .am-role-badge:hover:not(:disabled) {
          border-color: #079baa;
          transform: translateY(-2px);
        }
        
        .am-role-badge.active {
          background: linear-gradient(135deg, #079baa, #00e5db);
          color: white;
          border-color: #079baa;
        }
        
        .am-role-badge:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        /* Connections */
        .am-connections-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 20px;
        }
        
        .am-connection-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #f8f9fa;
          border: 1px solid #e0e0e0;
          border-radius: 6px;
        }
        
        .am-connection-info {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .am-connection-info strong {
          color: #2a3c7a;
          font-size: 14px;
        }
        
        .am-connection-info small {
          color: #666;
          font-size: 12px;
          text-transform: capitalize;
        }
        
        .am-remove-btn {
          padding: 6px 12px;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: all 0.3s;
          font-size: 14px;
        }
        
        .am-remove-btn:hover:not(:disabled) {
          background: #c82333;
        }
        
        .am-add-connection {
          margin-top: 20px;
          padding: 20px;
          background: #f8f9fa;
          border-radius: 8px;
        }
        
        .am-add-connection h4 {
          margin: 0 0 16px 0;
          color: #2a3c7a;
          font-size: 16px;
        }
        
        .am-connection-form {
          display: flex;
          gap: 12px;
        }
        
        .am-select,
        .am-input {
          padding: 10px 14px;
          border: 2px solid #e0e0e0;
          border-radius: 6px;
          font-size: 14px;
        }
        
        .am-select {
          min-width: 180px;
        }
        
        .am-input {
          flex: 1;
        }
        
        .am-add-btn {
          padding: 10px 24px;
          background: #28a745;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
        }
        
        .am-add-btn:hover:not(:disabled) {
          background: #218838;
        }
        
        .am-add-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        /* Metadata */
        .am-metadata-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 16px;
        }
        
        .am-metadata-grid label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #666;
          margin-bottom: 4px;
        }
        
        .am-metadata-grid code {
          background: #f8f9fa;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-family: 'Courier New', monospace;
          color: #d63384;
        }
        
        /* Info Box */
        .am-info-box {
          background: #e3f2fd;
          border-left: 4px solid #2196f3;
          padding: 12px 16px;
          border-radius: 4px;
          font-size: 14px;
          color: #0d47a1;
          margin-top: 16px;
        }
        
        /* Empty States */
        .am-empty-state {
          padding: 40px;
          text-align: center;
          color: #999;
          font-style: italic;
        }
        
        .am-empty-state-main {
          background: white;
          border-radius: 12px;
          padding: 60px 40px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          text-align: center;
        }
        
        .icon-large {
          font-size: 64px;
          display: block;
          margin-bottom: 20px;
        }
        
        .am-empty-state-main h2 {
          color: #2a3c7a;
          margin: 0 0 12px 0;
        }
        
        .am-empty-state-main p {
          color: #666;
          font-size: 16px;
          margin: 0 0 24px 0;
        }
        
        /* Icons */
        .icon {
          font-size: 20px;
        }
        
        /* Responsive */
        @media (max-width: 768px) {
          .account-manager {
            padding: 16px;
          }
          
          .am-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
          
          .am-search-box {
            flex-direction: column;
          }
          
          .am-results-grid {
            grid-template-columns: 1fr;
          }
          
          .am-info-grid {
            grid-template-columns: 1fr;
          }
          
          .am-connection-form {
            flex-direction: column;
          }
        }
      `;
      
      document.head.appendChild(styles);
      debugLog('Styles injected');
    }
  };
  
  debugLog('Initialization function registered');
})();

