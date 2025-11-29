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
 * Version: 1k
 * Date: November 27, 2025
 * Fixes: Checkbox event handler, bulk connection UI, better click handling
 */

(function() {
  'use strict';
  
  const VERSION = '2a';
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
            searchDebounceTimer: null, // For auto-search on typing
            selectedYearGroup: '',
            selectedGroup: '', // Tutor group filter (students)
            selectedStaffGroup: '', // Group filter for staff
            selectedSchool: null,
            allSchools: [], // For super user dropdown
            availableGroups: [], // For group dropdown (students)
            availableStaffGroups: [], // For staff group dropdown
            
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
            
            // Connection dropdown v-models (FIXED: Added missing properties!)
            newTutorEmail: '',
            newHoyEmail: '',
            newTeacherEmail: '',
            newAdminEmail: '',
            
            // Bulk operations
            showBulkMenu: false,
            bulkAction: null,
            bulkOperationInProgress: false,
            bulkProgress: { current: 0, total: 0, status: '' },
            showBulkConnectionMenu: false,
            showBulkRemoveMenu: false,
            showBulkGroupUpdateMenu: false,
            bulkConnectionType: '',
            bulkStaffEmail: '',
            bulkGroupName: '',
            
            // Background job tracking
            activeJobs: [], // { jobId, type, total, description }
            jobPollingInterval: null,
            
            // Role management
            showRoleModal: false,
            roleEditingStaff: null,
            roleForm: {
              tutor: false,
              head_of_year: false,
              subject_teacher: false,
              staff_admin: false
            },
            showTutorAssignmentModal: false,
            showHoyAssignmentModal: false,
            tutorGroupSelections: [], // Selected groups for tutor
            hoyYearSelections: [], // Selected years for HOY
            allStudentGroups: [], // All unique groups from students
            
            // Group management
            showGroupManagementModal: false,
            schoolGroups: [], // Master list from school_groups table
            newGroupName: '',
            newGroupType: 'tutor_group',
            editingGroup: null,
            renameGroupName: '',
            groupToDelete: null,
            deleteGroupUsage: null,
            
            // CSV Upload
            showCSVUploadModal: false,
            csvUploadType: 'students', // 'students' or 'staff'
            selectedCSVFile: null,
            csvData: null,
            csvValidationResults: null,
            csvUploading: false,
            csvJobId: null,
            
            // Manual Add
            showManualAddModal: false,
            manualAddType: 'students', // 'students' or 'staff'
            manualAddForm: {
              // Staff fields
              title: '',
              firstName: '',
              lastName: '',
              email: '',
              staffTypes: [],
              yearGroup: '',
              group: '',
              subject: '',
              
              // Student fields
              upn: '',
              gender: '',
              dob: '',
              level: '',
              tutors: [],
              headOfYear: '',
              subjectTeachers: []
            },
            manualAddSubmitting: false,
            
            // QR Generation
            showQRModal: false,
            
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
          },
          
          canSubmitManualAdd() {
            const form = this.manualAddForm;
            if (this.manualAddType === 'staff') {
              return form.title && form.firstName && form.lastName && form.email && form.staffTypes.length > 0;
            } else {
              return form.firstName && form.lastName && form.email && form.yearGroup && form.level;
            }
          }
        },
        
        async mounted() {
          debugLog('Vue app mounted');
          await this.checkAuth();
          if (this.isSuperUser) {
            await this.loadAllSchools();
          }
          // Load groups for dropdowns (critical for filters and editing)
          await this.loadAllStudentGroups();
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
              debugLog('Full Knack user attributes', userAttrs);
              
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
                
                // CRITICAL FIX: Extract customerId directly from Knack if not in backend response
                // This matches the working approach from index10d.js
                if (!this.isSuperUser && this.schoolContext && !this.schoolContext.customerId && !this.schoolContext.knackCustomerId) {
                  debugLog('Backend did not provide customerId, extracting from Knack field_122...');
                  
                  if (userAttrs.values?.field_122_raw && userAttrs.values.field_122_raw.length > 0) {
                    this.schoolContext.customerId = userAttrs.values.field_122_raw[0].id;
                    this.schoolContext.customerName = this.schoolContext.customerName || userAttrs.values.field_122_raw[0].identifier;
                    debugLog('Extracted customerId from Knack field_122_raw:', this.schoolContext.customerId);
                  }
                }
                
                this.authChecked = true;
                
                debugLog('Auth check complete', {
                  isSuperUser: this.isSuperUser,
                  schoolContext: this.schoolContext
                });
                
                if (!this.isSuperUser && this.schoolContext) {
                  this.showMessage(`Logged in as: ${this.schoolContext.customerName}`, 'info');
                } else if (this.isSuperUser) {
                  this.showMessage('Super User Mode Active - All Schools', 'info');
                } else if (!this.isSuperUser && !this.schoolContext) {
                  // Staff admin but no school context - this is a problem
                  console.error('Staff admin user has no school context!', {
                    userEmail: this.userEmail,
                    response: data
                  });
                  this.showMessage('⚠️ Your school context could not be determined. Contact support if this persists.', 'warning');
                  // Still set authChecked to true so UI shows
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
          
          // Load all schools for super user dropdown
          async loadAllSchools() {
            try {
              debugLog('Loading all schools for super user...');
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/schools`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              if (data.success && data.schools) {
                this.allSchools = data.schools;
                debugLog('Schools loaded', { count: this.allSchools.length });
              }
              
            } catch (error) {
              console.error('Load schools error:', error);
              this.showMessage('Failed to load schools list', 'error');
            }
          },
          
          // Select a school (super user only)
          async selectSchool(school) {
            this.selectedSchool = school;
            debugLog('School selected', school);
            // Reload groups for the new school
            if (school) {
              await this.loadAllStudentGroups();
            }
            this.loadAccounts();
          },
          
          // Update available groups from loaded accounts
          updateAvailableGroups() {
            try {
              // Get unique groups from current accounts
              const groups = [...new Set(
                this.accounts
                  .map(a => a.tutorGroup)
                  .filter(g => g && g !== '-' && g !== '')
              )].sort();
              
              this.availableGroups = groups;
              debugLog('Available groups updated', groups);
            } catch (error) {
              console.error('Update groups error:', error);
            }
          },
          
          // Update available staff groups from loaded staff accounts
          updateAvailableStaffGroups() {
            try {
              // Get unique groups from current staff accounts
              const groups = [...new Set(
                this.accounts
                  .map(a => a.tutorGroup || a.department)
                  .filter(g => g && g !== '-' && g !== '')
              )].sort();
              
              this.availableStaffGroups = groups;
              debugLog('Available staff groups updated', groups);
            } catch (error) {
              console.error('Update staff groups error:', error);
            }
          },
          
          // Debounced search - triggers automatically after user stops typing
          debouncedSearch() {
            if (this.searchDebounceTimer) {
              clearTimeout(this.searchDebounceTimer);
            }
            this.searchDebounceTimer = setTimeout(() => {
              this.loadAccounts();
            }, 300); // 300ms delay
          },
          
          // ========== DATA LOADING ==========
          
          // Deduplicate accounts by email (strip HTML tags)
          deduplicateAccounts(accounts) {
            const seen = new Map();
            const deduped = [];
            
            for (const account of accounts) {
              // Strip HTML tags from email if present
              let cleanEmail = account.email;
              if (cleanEmail && cleanEmail.includes('<')) {
                const match = cleanEmail.match(/mailto:([^"]+)/);
                if (match) {
                  cleanEmail = match[1];
                } else {
                  cleanEmail = cleanEmail.replace(/<[^>]*>/g, '').trim();
                }
              }
              
              // Use clean email as key
              if (!seen.has(cleanEmail)) {
                seen.set(cleanEmail, true);
                account.email = cleanEmail; // Update to clean email
                deduped.push(account);
              } else {
                debugLog('Skipping duplicate', { email: account.email, cleanEmail });
              }
            }
            
            return deduped;
          },
          
          async loadAccounts() {
            this.loading = true;
            this.loadingText = 'Loading accounts...';
            
            try {
              // Determine which school UUID to use for RLS
              let schoolUuidForRls = null;
              
              if (this.isSuperUser) {
                // Super user - use selected school if any
                if (this.selectedSchool && this.selectedSchool.supabaseUuid) {
                  schoolUuidForRls = this.selectedSchool.supabaseUuid;
                }
                // If no school selected, load ALL (no filter)
              } else {
                // Staff admin - use their school UUID (CRITICAL!)
                if (this.schoolContext && this.schoolContext.schoolId) {
                  schoolUuidForRls = this.schoolContext.schoolId;
                } else {
                  // No school context - RLS will return 0 results, but let UI show
                  debugLog('Warning: Staff admin has no schoolId, RLS will return no results');
                }
              }
              
              debugLog('Loading accounts', {
                tab: this.currentTab,
                page: this.currentPage,
                search: this.searchQuery,
                schoolUuidForRls: schoolUuidForRls,
                isSuperUser: this.isSuperUser
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
              
              if (this.selectedGroup && this.currentTab === 'students') {
                params.append('group', this.selectedGroup);
              }
              
              // Add staff group filter
              if (this.selectedStaffGroup && this.currentTab === 'staff') {
                params.append('group', this.selectedStaffGroup);
              }
              
              // CRITICAL: Add school UUID for RLS filtering
              if (schoolUuidForRls) {
                params.append('emulatedSchoolId', schoolUuidForRls);
                debugLog('Added schoolId filter for RLS', schoolUuidForRls);
              } else {
                debugLog('No schoolId for RLS - will return all accounts (super user) or none (staff admin with RLS)');
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
                // Deduplicate accounts (strip HTML from emails)
                this.accounts = this.deduplicateAccounts(data.accounts || []);
                this.totalAccounts = data.total || 0;
                debugLog('Accounts loaded', { count: this.accounts.length });
                
                // Update available groups for dropdown
                if (this.currentTab === 'students') {
                  this.updateAvailableGroups();
                } else if (this.currentTab === 'staff') {
                  this.updateAvailableStaffGroups();
                }
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
          
          async startEdit(account) {
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
            
            // Load groups for dropdowns - always reload to ensure fresh list
            if (this.currentTab === 'students') {
              await this.loadAllStudentGroups();
            } else if (this.currentTab === 'staff') {
              await this.loadAllDepartments();
            }
            
            debugLog('Started editing', account);
          },
          
          async loadAllDepartments() {
            try {
              const schoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              if (!schoolId) {
                debugLog('No school context for loading departments');
                return;
              }
              
              // Load from centralized school_groups table (source of truth!)
              const response = await fetch(
                `${this.apiUrl}/api/v3/schools/${schoolId}/groups?groupType=department`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                // Extract just the group names
                this.availableStaffGroups = (data.groups || [])
                  .map(g => g.group_name)
                  .sort();
                
                debugLog('Loaded all departments from school_groups', this.availableStaffGroups);
              }
              
            } catch (error) {
              console.error('Error loading departments:', error);
            }
          },
          
          cancelEdit() {
            this.editingAccount = null;
            this.editForm = {};
          },
          
          async startEditStaffGroups(account) {
            // Quick edit for staff tutor groups only
            this.editingAccount = account;
            this.editForm = {
              tutorGroup: account.tutorGroup || ''
            };
            
            // Load groups if not already loaded
            if (this.allStudentGroups.length === 0) {
              await this.loadAllStudentGroups();
            }
            
            debugLog('Started editing staff groups', account);
          },
          
          async quickSaveStaffGroups() {
            if (!this.editingAccount) {
              return;
            }
            
            // Allow clearing groups (empty value)
            if (!this.editForm.tutorGroup && !confirm('Clear all group assignments for this staff member?')) {
              this.editingAccount = null;
              this.editForm = {};
              return;
            }
            
            this.loading = true;
            this.loadingText = 'Updating groups...';
            
            try {
              const staffEmail = this.editingAccount.email;
              const newGroups = this.editForm.tutorGroup.trim();
              const roles = this.editingAccount.roles || [];
              
              // Determine if tutor or HOY
              const isTutor = roles.includes('tutor');
              const isHOY = roles.includes('head_of_year');
              
              if (!isTutor && !isHOY) {
                throw new Error('Staff member must be a Tutor or Head of Year to have groups');
              }
              
              // Build assignments
              const assignments = {};
              if (isTutor) {
                assignments.tutor = newGroups.split(',').map(g => g.trim()).filter(Boolean);
              }
              if (isHOY) {
                assignments.head_of_year = newGroups.split(',').map(g => g.trim()).filter(Boolean);
              }
              
              // Submit via role assignment (uses worker)
              const emulatedSchoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/staff/${encodeURIComponent(staffEmail)}/roles`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    roles: roles, // Keep existing roles
                    assignments: assignments,
                    emulatedSchoolId: emulatedSchoolId,
                    userEmail: this.userEmail
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('✅ Groups updated! Processing in background...', 'success');
                this.editingAccount = null;
                this.editForm = {};
                
                // Reload after delay
                setTimeout(() => this.loadAccounts(), 3000);
              } else {
                throw new Error(data.message || 'Failed to update groups');
              }
              
            } catch (error) {
              console.error('Quick save staff groups error:', error);
              this.showMessage('Failed to update groups: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          async saveEdit() {
            if (!this.editingAccount) return;
            
            this.loading = true;
            this.loadingText = 'Saving changes...';
            
            try {
              // Get emulated school ID if applicable
              const emulatedSchoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(this.editingAccount.email)}`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    accountType: this.currentTab === 'students' ? 'student' : 'staff',
                    emulatedSchoolId: emulatedSchoolId,
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
            
            // Reset dropdown selections
            this.newTutorEmail = '';
            this.newHoyEmail = '';
            this.newTeacherEmail = '';
            this.newAdminEmail = '';
            
            // Load full account details with connections
            try {
              const emulatedSchoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              const params = new URLSearchParams({
                accountType: 'student'
              });
              
              if (emulatedSchoolId) {
                params.append('emulatedSchoolId', emulatedSchoolId);
              }
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(account.email)}?${params}`,
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
              // Get the school UUID (not Knack customer ID)
              const schoolId = this.connectionAccount?.schoolId || this.schoolContext?.schoolId;
              
              if (!schoolId) {
                debugLog('No schoolId available for loading staff');
                return;
              }
              
              // Load tutors
              const tutorsResponse = await fetch(
                `${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=tutor`,
                { headers: { 'Content-Type': 'application/json' } }
              );
              const tutorsData = await tutorsResponse.json();
              if (tutorsData.success) this.availableStaff.tutors = tutorsData.staff || [];
              
              // Load heads of year
              const hoyResponse = await fetch(
                `${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=head_of_year`,
                { headers: { 'Content-Type': 'application/json' } }
              );
              const hoyData = await hoyResponse.json();
              if (hoyData.success) this.availableStaff.headsOfYear = hoyData.staff || [];
              
              // Load subject teachers
              const teachersResponse = await fetch(
                `${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=subject_teacher`,
                { headers: { 'Content-Type': 'application/json' } }
              );
              const teachersData = await teachersResponse.json();
              if (teachersData.success) this.availableStaff.subjectTeachers = teachersData.staff || [];
              
              // Load staff admins
              const adminsResponse = await fetch(
                `${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=staff_admin`,
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
            this.loadingText = 'Adding connection...';
            
            try {
              const emulatedSchoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              debugLog('Adding connection', { connectionType, staffEmail, emulatedSchoolId });
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(this.connectionAccount.email)}/connections`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    connectionType: connectionType,
                    staffEmail: staffEmail,
                    action: 'add',
                    emulatedSchoolId: emulatedSchoolId
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('Connection added successfully!', 'success');
                // Reset dropdown
                if (connectionType === 'tutor') this.newTutorEmail = '';
                if (connectionType === 'head_of_year') this.newHoyEmail = '';
                if (connectionType === 'subject_teacher') this.newTeacherEmail = '';
                if (connectionType === 'staff_admin') this.newAdminEmail = '';
                // Reload connections
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
            
            // Extract email if identifier contains name
            const actualEmail = staffEmail.includes('(') ? staffEmail.match(/\(([^)]+)\)/)?.[1] : staffEmail;
            
            if (!actualEmail) {
              this.showMessage('Could not determine staff email', 'error');
              return;
            }
            
            const typeName = connectionType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            if (!confirm(`Remove ${typeName} connection for ${actualEmail}?`)) return;
            
            this.loading = true;
            this.loadingText = 'Removing connection...';
            
            try {
              const emulatedSchoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              debugLog('Removing connection', { connectionType, staffEmail: actualEmail, emulatedSchoolId });
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(this.connectionAccount.email)}/connections`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    connectionType: connectionType,
                    staffEmail: actualEmail,
                    action: 'remove',
                    emulatedSchoolId: emulatedSchoolId
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('Connection removed successfully!', 'success');
                // Reload connections
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
            this.newTutorEmail = '';
            this.newHoyEmail = '';
            this.newTeacherEmail = '';
            this.newAdminEmail = '';
          },
          
          // ========== ROLE MANAGEMENT ==========
          
          async openRoleEditor(staff) {
            this.roleEditingStaff = staff;
            this.showRoleModal = true;
            
            // Set current roles
            const currentRoles = staff.roles || [];
            this.roleForm = {
              tutor: currentRoles.includes('tutor'),
              head_of_year: currentRoles.includes('head_of_year'),
              subject_teacher: currentRoles.includes('subject_teacher'),
              staff_admin: currentRoles.includes('staff_admin')
            };
            
            // Load all unique student groups for tutor assignment
            await this.loadAllStudentGroups();
            
            // Load current assignments (groups for tutor, years for HOY)
            await this.loadCurrentAssignments(staff);
            
            debugLog('Opened role editor', { staff, currentRoles: this.roleForm });
          },
          
          async loadCurrentAssignments(staff) {
            try {
              // Load current tutor groups if they're a tutor
              if (staff.roles?.includes('tutor')) {
                // Query Knack Object_7 to get their current groups
                const response = await fetch(
                  `${this.apiUrl}/api/v3/accounts/staff/${encodeURIComponent(staff.email)}/assignments`,
                  {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                  }
                );
                
                const data = await response.json();
                
                if (data.success && data.assignments) {
                  // Pre-populate selections
                  if (data.assignments.tutorGroups) {
                    this.tutorGroupSelections = data.assignments.tutorGroups.split(',').map(g => g.trim()).filter(Boolean);
                  }
                  if (data.assignments.hoyYears) {
                    this.hoyYearSelections = data.assignments.hoyYears.split(',').map(y => y.trim()).filter(Boolean);
                  }
                  
                  debugLog('Loaded current assignments', data.assignments);
                }
              }
            } catch (error) {
              console.error('Error loading current assignments:', error);
              // Non-critical, just means they start empty
            }
          },
          
          async loadAllStudentGroups() {
            try {
              const schoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              if (!schoolId) {
                debugLog('No school context for loading student groups');
                return;
              }
              
              // Load from centralized school_groups table (source of truth!)
              const response = await fetch(
                `${this.apiUrl}/api/v3/schools/${schoolId}/groups?groupType=tutor_group`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                // Extract just the group names
                this.allStudentGroups = (data.groups || [])
                  .map(g => g.group_name)
                  .sort();
                
                debugLog('Loaded all student groups from school_groups', this.allStudentGroups);
              }
              
            } catch (error) {
              console.error('Error loading student groups:', error);
            }
          },
          
          async saveRoles() {
            if (!this.roleEditingStaff) return;
            
            // Check which roles are selected
            const selectedRoles = Object.keys(this.roleForm).filter(role => this.roleForm[role]);
            
            debugLog('Saving roles', { staff: this.roleEditingStaff.email, selectedRoles });
            
            // Check if NEW tutor or HOY roles need assignment (first time only)
            const needsTutorAssignment = this.roleForm.tutor && 
              !this.roleEditingStaff.roles?.includes('tutor') && 
              this.tutorGroupSelections.length === 0;
            
            const needsHoyAssignment = this.roleForm.head_of_year && 
              !this.roleEditingStaff.roles?.includes('head_of_year') &&
              this.hoyYearSelections.length === 0;
            
            if (needsTutorAssignment) {
              // NEW tutor - must select groups first
              this.showMessage('⚠️ Please click "Manage Groups" to assign tutor groups', 'warning');
              return;
            }
            
            if (needsHoyAssignment) {
              // NEW HOY - must select years first
              this.showMessage('⚠️ Please click "Manage Years" to assign year groups', 'warning');
              return;
            }
            
            // Build assignments from current selections
            const assignments = {};
            if (this.roleForm.tutor && this.tutorGroupSelections.length > 0) {
              assignments.tutor = this.tutorGroupSelections;
            }
            if (this.roleForm.head_of_year && this.hoyYearSelections.length > 0) {
              assignments.head_of_year = this.hoyYearSelections;
            }
            
            // Submit role changes
            await this.submitRoleChanges(selectedRoles, assignments);
          },
          
          async submitRoleChanges(selectedRoles, assignments) {
            this.loading = true;
            this.loadingText = 'Submitting role assignment...';
            
            try {
              const emulatedSchoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/staff/${encodeURIComponent(this.roleEditingStaff.email)}/roles`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    roles: selectedRoles,
                    assignments: assignments,
                    emulatedSchoolId: emulatedSchoolId,
                    userEmail: this.userEmail
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('✅ Role assignment submitted! Processing in background...', 'success');
                
                // Add to active jobs for tracking
                this.activeJobs.push({
                  jobId: data.jobId,
                  type: 'staff-role-assignment',
                  staffEmail: this.roleEditingStaff.email,
                  roles: selectedRoles,
                  total: 1,
                  current: 0,
                  status: 'Queued...',
                  startTime: Date.now()
                });
                
                // Start polling
                if (!this.jobPollingInterval) {
                  this.startJobPolling();
                }
                
                // Close modals
                this.closeRoleModals();
                
                // Reload accounts after worker completes (longer delay for role sync)
                setTimeout(() => this.loadAccounts(), 5000);
              } else {
                throw new Error(data.message || 'Failed to submit role assignment');
              }
              
            } catch (error) {
              console.error('Save roles error:', error);
              this.showMessage('Failed to save roles: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          confirmTutorAssignment() {
            if (this.tutorGroupSelections.length === 0) {
              this.showMessage('Please select at least one group', 'warning');
              return;
            }
            
            // Just close the modal and return to role editor
            this.showTutorAssignmentModal = false;
            this.showMessage(`✅ Selected ${this.tutorGroupSelections.length} group(s). Click "Save & Assign" to apply.`, 'info');
          },
          
          confirmHoyAssignment() {
            if (this.hoyYearSelections.length === 0) {
              this.showMessage('Please select at least one year group', 'warning');
              return;
            }
            
            // Just close the modal and return to role editor
            this.showHoyAssignmentModal = false;
            this.showMessage(`✅ Selected ${this.hoyYearSelections.length} year group(s). Click "Save & Assign" to apply.`, 'info');
          },
          
          closeRoleModals() {
            this.showRoleModal = false;
            this.showTutorAssignmentModal = false;
            this.showHoyAssignmentModal = false;
            this.roleEditingStaff = null;
            this.tutorGroupSelections = [];
            this.hoyYearSelections = [];
          },
          
          // ========== GROUP MANAGEMENT ==========
          
          async openGroupManagement() {
            this.showGroupManagementModal = true;
            await this.loadSchoolGroups();
          },
          
          async loadSchoolGroups() {
            try {
              const schoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId;
              
              if (!schoolId) {
                this.showMessage('No school context available', 'error');
                return;
              }
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/schools/${schoolId}/groups`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.schoolGroups = data.groups || [];
                debugLog('Loaded school groups', this.schoolGroups);
              }
              
            } catch (error) {
              console.error('Load groups error:', error);
              this.showMessage('Failed to load groups', 'error');
            }
          },
          
          async addNewGroup() {
            if (!this.newGroupName.trim()) {
              this.showMessage('Please enter a group name', 'warning');
              return;
            }
            
            this.loading = true;
            
            try {
              const schoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId;
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/schools/${schoolId}/groups`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    groupName: this.newGroupName.trim(),
                    groupType: this.newGroupType,
                    createdBy: this.userEmail
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage(`✅ Group "${this.newGroupName}" added!`, 'success');
                this.newGroupName = '';
                await this.loadSchoolGroups();
              } else {
                throw new Error(data.message || 'Failed to add group');
              }
              
            } catch (error) {
              console.error('Add group error:', error);
              this.showMessage('Failed to add group: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          startRenameGroup(group) {
            this.editingGroup = group;
            this.renameGroupName = group.group_name;
          },
          
          cancelRenameGroup() {
            this.editingGroup = null;
            this.renameGroupName = '';
          },
          
          async confirmRenameGroup() {
            if (!this.renameGroupName.trim() || !this.editingGroup) return;
            
            this.loading = true;
            
            try {
              const schoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId;
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/schools/${schoolId}/groups/${this.editingGroup.id}`,
                {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    newGroupName: this.renameGroupName.trim()
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage(`✅ Group renamed to "${this.renameGroupName}"`, 'success');
                this.cancelRenameGroup();
                await this.loadSchoolGroups();
              } else {
                throw new Error(data.message || 'Failed to rename group');
              }
              
            } catch (error) {
              console.error('Rename group error:', error);
              this.showMessage('Failed to rename group: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          async checkGroupUsageAndDelete(group) {
            this.groupToDelete = group;
            this.loading = true;
            
            try {
              const schoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId;
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/schools/${schoolId}/groups/${group.id}/usage`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.deleteGroupUsage = data;
                
                // If no usage, delete immediately
                if (data.totalUsage === 0) {
                  await this.confirmDeleteGroup();
                } else {
                  // Show confirmation with usage count
                  const confirmMsg = `⚠️ Delete group "${group.group_name}"?\n\n` +
                    `This will affect:\n` +
                    `• ${data.studentCount} student(s)\n` +
                    `• ${data.staffCount} staff member(s)\n\n` +
                    `Their group will be cleared. Continue?`;
                  
                  if (confirm(confirmMsg)) {
                    await this.confirmDeleteGroup();
                  } else {
                    this.groupToDelete = null;
                    this.deleteGroupUsage = null;
                  }
                }
              }
              
            } catch (error) {
              console.error('Check group usage error:', error);
              this.showMessage('Failed to check group usage', 'error');
            } finally {
              this.loading = false;
            }
          },
          
          async confirmDeleteGroup() {
            if (!this.groupToDelete) return;
            
            this.loading = true;
            
            try {
              const schoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId;
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/schools/${schoolId}/groups/${this.groupToDelete.id}`,
                {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage(`✅ Group "${this.groupToDelete.group_name}" deleted`, 'success');
                this.groupToDelete = null;
                this.deleteGroupUsage = null;
                await this.loadSchoolGroups();
              } else {
                throw new Error(data.message || 'Failed to delete group');
              }
              
            } catch (error) {
              console.error('Delete group error:', error);
              this.showMessage('Failed to delete group: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          closeGroupManagement() {
            this.showGroupManagementModal = false;
            this.newGroupName = '';
            this.editingGroup = null;
            this.renameGroupName = '';
            this.groupToDelete = null;
            this.deleteGroupUsage = null;
          },
          
          // ========== CSV UPLOAD ==========
          
          openCSVUploadModal() {
            this.showCSVUploadModal = true;
            this.csvUploadType = this.currentTab === 'students' ? 'students' : 'staff';
            this.selectedCSVFile = null;
            this.csvData = null;
            this.csvValidationResults = null;
          },
          
          handleCSVFileSelect(event) {
            const file = event.target.files[0];
            if (file) {
              this.selectedCSVFile = file;
              debugLog('CSV file selected', { name: file.name, size: file.size });
            }
          },
          
          async parseCSVFile(file) {
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              
              reader.onload = (event) => {
                try {
                  const csvText = event.target.result;
                  const rows = [];
                  let currentRow = [];
                  let inQuotes = false;
                  let value = "";
                  
                  // Robust CSV parsing
                  for (let i = 0; i < csvText.length; i++) {
                    const char = csvText[i];
                    
                    if (char === '"') {
                      if (inQuotes && i + 1 < csvText.length && csvText[i+1] === '"') {
                        value += '"';
                        i++;
                      } else {
                        inQuotes = !inQuotes;
                      }
                    } else if (char === ',' && !inQuotes) {
                      currentRow.push(value);
                      value = "";
                    } else if ((char === '\r' || char === '\n') && !inQuotes) {
                      if (csvText[i] === '\r' && csvText[i+1] === '\n') i++;
                      currentRow.push(value);
                      if (currentRow.some(cell => cell.trim() !== "")) {
                        rows.push(currentRow);
                      }
                      currentRow = [];
                      value = "";
                    } else {
                      value += char;
                    }
                  }
                  
                  currentRow.push(value);
                  if (currentRow.some(cell => cell.trim() !== "")) {
                    rows.push(currentRow);
                  }
                  
                  if (rows.length === 0) {
                    reject(new Error('CSV file is empty'));
                    return;
                  }
                  
                  const headers = rows[0].map(h => h.trim());
                  const data = rows.slice(1).map(row => {
                    const obj = {};
                    headers.forEach((header, index) => {
                      obj[header] = index < row.length ? row[index].trim() : '';
                    });
                    return obj;
                  });
                  
                  resolve(data);
                } catch (error) {
                  reject(error);
                }
              };
              
              reader.onerror = () => reject(new Error('Error reading file'));
              reader.readAsText(file);
            });
          },
          
          async validateCSV() {
            if (!this.selectedCSVFile) {
              this.showMessage('Please select a CSV file', 'error');
              return;
            }
            
            this.loading = true;
            this.loadingText = 'Validating CSV...';
            
            try {
              // Parse CSV
              this.csvData = await this.parseCSVFile(this.selectedCSVFile);
              debugLog('CSV parsed', { rows: this.csvData.length });
              
              // Call validation endpoint
              const endpoint = this.csvUploadType === 'students' 
                ? 'students/onboard/validate'
                : 'staff/validate';
              
              const response = await fetch(
                `${this.apiUrl}/api/${endpoint}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    csvData: this.csvData,
                    uploaderContext: this.getUploaderContext()
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success || data.isValid) {
                this.csvValidationResults = data;
                this.showMessage(`Validation passed: ${this.csvData.length} rows ready`, 'success');
              } else {
                this.csvValidationResults = data;
                this.showMessage(`Validation failed: ${data.errors?.length || 0} errors found`, 'error');
              }
              
            } catch (error) {
              console.error('CSV validation error:', error);
              this.showMessage('CSV validation failed: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          async submitCSVUpload() {
            if (!this.csvValidationResults || (!this.csvValidationResults.success && !this.csvValidationResults.isValid)) {
              this.showMessage('Please validate CSV first', 'error');
              return;
            }
            
            this.csvUploading = true;
            this.loading = true;
            this.loadingText = 'Submitting CSV for processing...';
            
            try {
              const endpoint = this.csvUploadType === 'students'
                ? 'students/onboard/process'
                : 'staff/process';
              
              const response = await fetch(
                `${this.apiUrl}/api/${endpoint}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    csvData: this.csvData,
                    options: {
                      sendNotifications: true,
                      notificationEmail: this.userEmail
                    },
                    context: this.getUploaderContext()
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success && data.jobId) {
                this.csvJobId = data.jobId;
                this.showMessage(`Upload queued successfully! Job ID: ${data.jobId}. You'll receive an email when complete.`, 'success');
                
                // Add to active jobs for tracking
                this.activeJobs.push({
                  jobId: data.jobId,
                  type: this.csvUploadType === 'students' ? 'Student Upload' : 'Staff Upload',
                  total: this.csvData.length,
                  description: `${this.csvUploadType === 'students' ? 'Student' : 'Staff'} CSV Upload`
                });
                
                // Start polling if not already running
                if (!this.jobPollingInterval) {
                  this.startJobPolling();
                }
                
                // Close modal and reload
                this.closeCSVUploadModal();
                setTimeout(() => this.loadAccounts(), 5000);
              } else {
                throw new Error(data.message || 'Upload failed');
              }
              
            } catch (error) {
              console.error('CSV upload error:', error);
              this.showMessage('Upload failed: ' + error.message, 'error');
            } finally {
              this.csvUploading = false;
              this.loading = false;
            }
          },
          
          closeCSVUploadModal() {
            this.showCSVUploadModal = false;
            this.selectedCSVFile = null;
            this.csvData = null;
            this.csvValidationResults = null;
            this.csvUploading = false;
          },
          
          getUploaderContext() {
            // Build context similar to upload system
            const isEmulating = this.isSuperUser && this.selectedSchool;
            
            if (isEmulating) {
              return {
                userId: Knack.getUserAttributes().id,
                userEmail: this.userEmail,
                isEmulating: true,
                loggedInUser: {
                  userId: Knack.getUserAttributes().id,
                  userEmail: this.userEmail
                },
                emulatedSchool: {
                  customerId: this.selectedSchool.id,
                  customerName: this.selectedSchool.name,
                  admins: [] // Could fetch from API if needed
                }
              };
            } else {
              return {
                userId: Knack.getUserAttributes().id,
                userEmail: this.userEmail,
                isEmulating: false,
                customerId: this.schoolContext?.customerId || this.schoolContext?.knackCustomerId || this.schoolContext?.knackId
              };
            }
          },
          
          // ========== MANUAL ADD ==========
          
          async openManualAddModal() {
            this.showManualAddModal = true;
            this.manualAddType = this.currentTab === 'students' ? 'students' : 'staff';
            this.resetManualAddForm();
            
            // Load dropdown options
            await this.loadManualAddOptions();
          },
          
          async loadManualAddOptions() {
            try {
              // SUPABASE-FIRST: Try schoolId (Supabase UUID) first, then customerId (Knack ID)
              const customerId = this.isSuperUser && this.selectedSchool?.id
                ? this.selectedSchool.id
                : (this.schoolContext?.customerId || this.schoolContext?.knackCustomerId || this.schoolContext?.knackId);
              
              const schoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId;
              
              if (!customerId && !schoolId) {
                console.error('No customerId or schoolId available for loadManualAddOptions');
                console.error('schoolContext:', this.schoolContext);
                console.error('selectedSchool:', this.selectedSchool);
                console.error('isSuperUser:', this.isSuperUser);
                return;
              }
              
              debugLog('Loading manual add options', { customerId, schoolId });
              
              // Build query params - prefer customerId if available, otherwise use schoolId
              const params = new URLSearchParams();
              if (customerId) params.append('customerId', customerId);
              if (schoolId) params.append('schoolId', schoolId);
              
              const response = await fetch(
                `${this.apiUrl}/api/validation/get-form-options?${params}`,
                {
                  method: 'GET',
                  headers: { 'Content-Type': 'application/json' }
                }
              );
              
              const data = await response.json();
              
              debugLog('get-form-options response', data);
              
              if (data.success && data.options) {
                // The API returns { name, email } format - normalize it
                this.availableStaff = {
                  tutors: (data.options.tutors || []).map(t => ({
                    ...t,
                    name: t.name || t.fullName || t.email,
                    email: t.email
                  })),
                  headsOfYear: (data.options.headsOfYear || []).map(h => ({
                    ...h,
                    name: h.name || h.fullName || h.email,
                    email: h.email
                  })),
                  subjectTeachers: (data.options.subjectTeachers || []).map(st => ({
                    ...st,
                    name: st.name || st.fullName || st.email,
                    email: st.email,
                    subject: st.subject
                  })),
                  staffAdmins: []
                };
                this.availableGroups = data.options.groups || [];
                
                debugLog('Manual add options loaded', {
                  tutors: this.availableStaff.tutors.length,
                  headsOfYear: this.availableStaff.headsOfYear.length,
                  subjectTeachers: this.availableStaff.subjectTeachers.length,
                  groups: this.availableGroups.length
                });
              } else {
                console.error('get-form-options failed', data);
              }
              
            } catch (error) {
              console.error('Error loading manual add options:', error);
            }
          },
          
          async submitManualAdd() {
            this.manualAddSubmitting = true;
            this.loading = true;
            this.loadingText = `Adding ${this.manualAddType === 'students' ? 'student' : 'staff member'}...`;
            
            try {
              const form = this.manualAddForm;
              let csvData = {};
              
              if (this.manualAddType === 'staff') {
                csvData = {
                  'Title': form.title,
                  'First Name': form.firstName,
                  'Last Name': form.lastName,
                  'Email Address': form.email,
                  'Staff Type': form.staffTypes.join(','),
                  'Year Group': form.yearGroup,
                  'Group': form.group,
                  'Subject': form.subject
                };
              } else {
                csvData = {
                  'UPN': form.upn,
                  'Firstname': form.firstName,
                  'Lastname': form.lastName,
                  'Student Email': form.email,
                  'Gender': form.gender,
                  'DOB': form.dob,
                  'Group': form.group,
                  'Year Gp': form.yearGroup,
                  'Level': form.level,
                  'Tutors': form.tutors.join(','),
                  'Head of Year': form.headOfYear,
                  'Subject Teachers': form.subjectTeachers.join(',')
                };
              }
              
              const endpoint = this.manualAddType === 'staff'
                ? 'staff/process'
                : 'students/onboard/process';
              
              const response = await fetch(
                `${this.apiUrl}/api/${endpoint}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    csvData: [csvData],
                    options: {
                      sendNotifications: true,
                      notificationEmail: this.userEmail,
                      manualEntry: true
                    },
                    context: this.getUploaderContext()
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage(`${this.manualAddType === 'staff' ? 'Staff member' : 'Student'} added successfully!`, 'success');
                this.closeManualAddModal();
                
                // Reload accounts
                setTimeout(() => this.loadAccounts(), 2000);
              } else {
                throw new Error(data.message || 'Failed to add account');
              }
              
            } catch (error) {
              console.error('Manual add error:', error);
              this.showMessage('Failed to add account: ' + error.message, 'error');
            } finally {
              this.manualAddSubmitting = false;
              this.loading = false;
            }
          },
          
          closeManualAddModal() {
            this.showManualAddModal = false;
            this.resetManualAddForm();
          },
          
          resetManualAddForm() {
            this.manualAddForm = {
              title: '',
              firstName: '',
              lastName: '',
              email: '',
              staffTypes: [],
              yearGroup: '',
              group: '',
              subject: '',
              upn: '',
              gender: '',
              dob: '',
              level: '',
              tutors: [],
              headOfYear: '',
              subjectTeachers: []
            };
          },
          
          // ========== QR GENERATION ==========
          
          openQRGenerationModal() {
            this.showQRModal = true;
          },
          
          closeQRModal() {
            this.showQRModal = false;
          },
          
          async generateStudentQR() {
            try {
              // Get customer ID - try multiple property names
              const customerId = this.isSuperUser && this.selectedSchool?.id
                ? this.selectedSchool.id
                : (this.schoolContext?.customerId || this.schoolContext?.knackCustomerId || this.schoolContext?.knackId);
              
              // Note: QR generation endpoint still requires Knack customerId
              // Backend will need to be updated to accept schoolId if we want full Supabase migration
              if (!customerId) {
                console.error('Unable to determine school for QR generation');
                console.error('schoolContext:', this.schoolContext);
                console.error('selectedSchool:', this.selectedSchool);
                this.showMessage('Unable to determine school. QR generation requires Knack customer ID.', 'error');
                return;
              }
              
              this.loading = true;
              this.loadingText = 'Generating QR code...';
              
              const response = await fetch(
                `${this.apiUrl}/api/self-registration/generate-link`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    customerId,
                    requireSchoolEmail: true,
                    autoApprove: true,
                    expiresIn: 365,
                    webinarMode: false
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                // Load QR code library
                await this.loadQRCodeLibrary();
                
                // Show QR in modal
                this.showQRResult(data, 'student');
              } else {
                throw new Error(data.message || 'Failed to generate QR');
              }
              
            } catch (error) {
              console.error('QR generation error:', error);
              this.showMessage('Failed to generate QR code: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          async generateStaffQR() {
            try {
              // Get customer ID - try multiple property names
              const customerId = this.isSuperUser && this.selectedSchool?.id
                ? this.selectedSchool.id
                : (this.schoolContext?.customerId || this.schoolContext?.knackCustomerId || this.schoolContext?.knackId);
              
              if (!customerId) {
                console.error('Unable to determine school for staff QR generation');
                console.error('schoolContext:', this.schoolContext);
                console.error('selectedSchool:', this.selectedSchool);
                this.showMessage('Unable to determine school. Please refresh.', 'error');
                return;
              }
              
              this.loading = true;
              this.loadingText = 'Generating staff QR code...';
              
              const response = await fetch(
                `${this.apiUrl}/api/staff-registration/generate-link`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    customerId,
                    customerName: this.isSuperUser && this.selectedSchool?.name
                      ? this.selectedSchool.name
                      : this.schoolContext?.customerName || 'Your School',
                    requireSchoolEmail: true,
                    autoApprove: true,
                    includeRoles: true,
                    expiresIn: 30,
                    adminIds: []
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                await this.loadQRCodeLibrary();
                this.showQRResult(data, 'staff');
              } else {
                throw new Error(data.message || 'Failed to generate QR');
              }
              
            } catch (error) {
              console.error('Staff QR generation error:', error);
              this.showMessage('Failed to generate staff QR: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          async loadQRCodeLibrary() {
            if (typeof QRCode !== 'undefined') return;
            
            return new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
              script.onload = resolve;
              script.onerror = reject;
              document.head.appendChild(script);
            });
          },
          
          showQRResult(data, type) {
            const schoolName = this.isSuperUser && this.selectedSchool?.name
              ? this.selectedSchool.name
              : this.schoolContext?.customerName || 'Your School';
            
            const title = type === 'student' ? 'Student Registration QR Code' : 'Staff Registration QR Code';
            const icon = type === 'student' ? '🎓' : '👥';
            
            // Create modal HTML
            const modalHtml = `
              <div style="text-align: center;">
                <h4 style="margin: 0 0 20px 0; color: #2a3c7a; font-size: 20px;">
                  ${icon} QR Code Generated Successfully!
                </h4>
                
                <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
                  <strong>School:</strong> ${schoolName}
                </div>
                
                <div id="qr-code-display" style="display: inline-block; background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-bottom: 20px;"></div>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: left;">
                  <div style="font-weight: 600; margin-bottom: 8px;">Registration URL:</div>
                  <div style="word-break: break-all; font-family: monospace; font-size: 12px; padding: 12px; background: white; border: 1px solid #dee2e6; border-radius: 4px;">
                    ${data.registrationUrl}
                  </div>
                  <button onclick="navigator.clipboard.writeText('${data.registrationUrl}').then(() => alert('Copied!'))" 
                    class="am-button secondary" style="margin-top: 10px; width: 100%;">
                    📋 Copy Link
                  </button>
                </div>
                
                <div style="background: #e3f2fd; padding: 12px; border-radius: 6px; border-left: 4px solid #2196f3; text-align: left; font-size: 13px;">
                  <div style="font-weight: 600; color: #1976d2; margin-bottom: 6px;">Details:</div>
                  <div>Valid until: ${new Date(data.expiresAt).toLocaleDateString()}</div>
                  <div>Link ID: ${data.linkId}</div>
                </div>
              </div>
            `;
            
            this.closeQRModal();
            this.$nextTick(() => {
              // Use native modal since we need to inject QR code
              const backdrop = document.createElement('div');
              backdrop.className = 'am-modal-overlay';
              backdrop.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 99999;';
              
              const modalDiv = document.createElement('div');
              modalDiv.className = 'am-modal';
              modalDiv.style.cssText = 'background: white; border-radius: 12px; max-width: 600px; width: 90%; max-height: 90vh; overflow-y: auto;';
              
              modalDiv.innerHTML = `
                <div class="am-modal-header" style="background: linear-gradient(135deg, #2a3c7a 0%, #079baa 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
                  <h3 style="margin: 0; font-size: 24px;">${title}</h3>
                  <button onclick="this.closest('.am-modal-overlay').remove()" class="am-modal-close" style="color: white; font-size: 28px;">✖</button>
                </div>
                <div class="am-modal-body" style="padding: 32px;">
                  ${modalHtml}
                </div>
                <div class="am-modal-footer" style="padding: 20px; background: #f5f7fa; border-top: 1px solid #e0e0e0;">
                  <button onclick="this.closest('.am-modal-overlay').remove()" class="am-button primary">Close</button>
                </div>
              `;
              
              backdrop.appendChild(modalDiv);
              document.body.appendChild(backdrop);
              
              // Generate QR code
              setTimeout(() => {
                new QRCode(document.getElementById('qr-code-display'), {
                  text: data.registrationUrl,
                  width: 256,
                  height: 256,
                  colorDark: "#000000",
                  colorLight: "#ffffff",
                  correctLevel: QRCode.CorrectLevel.H
                });
              }, 100);
            });
          },
          
          // ========== EMAIL ACTIONS ==========
          
          async resetPassword(account) {
            if (!confirm(`Send password reset email to ${account.email}?\n\nA new temporary password will be generated and sent.`)) return;
            
            this.loading = true;
            this.loadingText = 'Sending password reset...';
            
            try {
              // Get emulated school ID if applicable
              const emulatedSchoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(account.email)}/reset-password`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    accountType: this.currentTab === 'students' ? 'student' : 'staff',
                    emulatedSchoolId: emulatedSchoolId
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('✅ Password reset email sent with new temporary password!', 'success');
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
            if (!confirm(`Resend welcome email to ${account.email}?\n\nA new temporary password will be generated and sent.`)) return;
            
            this.loading = true;
            this.loadingText = 'Sending welcome email...';
            
            try {
              // Get emulated school ID if applicable
              const emulatedSchoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(account.email)}/resend-welcome`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    accountType: this.currentTab === 'students' ? 'student' : 'staff',
                    firstName: account.firstName,
                    lastName: account.lastName,
                    schoolName: account.schoolName,
                    emulatedSchoolId: emulatedSchoolId
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage('✅ Welcome email sent with new temporary password!', 'success');
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
            debugLog('Toggle select called', { email, currentlySelected: this.isSelected(email) });
            const index = this.selectedAccounts.indexOf(email);
            if (index > -1) {
              this.selectedAccounts.splice(index, 1);
              debugLog('Deselected', { email, remaining: this.selectedAccounts.length });
            } else {
              this.selectedAccounts.push(email);
              debugLog('Selected', { email, total: this.selectedAccounts.length });
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
            const accountTypeName = this.currentTab === 'students' ? 'student' : 'staff';
            const isDelete = action === 'delete';
            
            // Enhanced confirmation for delete
            if (isDelete) {
              const warningMessage = this.currentTab === 'students'
                ? `⚠️ PERMANENTLY DELETE ${count} STUDENTS?\n\n` +
                  `This will PERMANENTLY delete:\n` +
                  `• ${count} student accounts (login access)\n` +
                  `• ALL VESPA results (Object_10/vespa_results)\n` +
                  `• ALL questionnaires (Object_29/vespa_questionnaires)\n` +
                  `• Student master records (Object_6/vespa_students)\n` +
                  `• Supabase and Knack records\n\n` +
                  `⚠️ THIS CANNOT BE UNDONE ⚠️\n\n` +
                  `Type "DELETE ${count} STUDENTS" to confirm:`
                : `⚠️ PERMANENTLY DELETE ${count} STAFF MEMBERS?\n\n` +
                  `This will PERMANENTLY delete:\n` +
                  `• ${count} staff accounts (login access)\n` +
                  `• All role assignments\n` +
                  `• All student connections\n` +
                  `• Supabase and Knack records\n\n` +
                  `⚠️ THIS CANNOT BE UNDONE ⚠️\n\n` +
                  `Type "DELETE ${count} STAFF" to confirm:`;
              
              const expectedConfirmation = this.currentTab === 'students' 
                ? `DELETE ${count} STUDENTS`
                : `DELETE ${count} STAFF`;
              
              const userConfirmation = prompt(warningMessage);
              
              if (userConfirmation !== expectedConfirmation) {
                if (userConfirmation !== null) {
                  this.showMessage(`Deletion cancelled. Must type "${expectedConfirmation}" exactly.`, 'info');
                }
                return;
              }
              
              // Use background queue for bulk delete
              await this.executeBulkDelete();
              return;
            }
            
            // Non-delete actions (reset-password, resend-welcome)
            const confirmMessage = action === 'reset-password'
              ? `Send password reset emails to ${count} account(s)?`
              : action === 'resend-welcome'
              ? `Resend welcome emails to ${count} account(s)?`
              : `Execute action on ${count} account(s)?`;
            
            if (!confirm(confirmMessage)) return;
            
            this.bulkOperationInProgress = true;
            this.bulkProgress = { current: 0, total: count, status: 'Starting...' };
            
            let successCount = 0;
            let failCount = 0;
            
            try {
              for (let i = 0; i < this.selectedAccounts.length; i++) {
                const email = this.selectedAccounts[i];
                const account = this.accounts.find(a => a.email === email);
                
                this.bulkProgress.current = i + 1;
                this.bulkProgress.status = `Processing ${email}...`;
                
                if (!account) continue;
                
                try {
                  if (action === 'reset-password') {
                    await this.resetPassword(account);
                  } else if (action === 'resend-welcome') {
                    await this.resendWelcome(account);
                  }
                  successCount++;
                } catch (err) {
                  failCount++;
                  console.error(`Failed for ${email}:`, err);
                }
                
                // Small delay to prevent overwhelming server
                if (i < this.selectedAccounts.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 100));
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
              this.bulkOperationInProgress = false;
              this.bulkProgress = { current: 0, total: 0, status: '' };
              this.showBulkMenu = false;
            }
          },
          
          // NEW: Execute bulk delete via background queue
          async executeBulkDelete() {
            const count = this.selectedAccounts.length;
            
            try {
              const emulatedSchoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              // Submit to background queue
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/bulk-delete`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    emails: this.selectedAccounts,
                    accountType: this.currentTab === 'students' ? 'student' : 'staff',
                    emulatedSchoolId: emulatedSchoolId,
                    userEmail: this.userEmail
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                // Add to active jobs for tracking
                this.activeJobs.push({
                  jobId: data.jobId,
                  type: 'bulk-delete',
                  action: 'delete',
                  accountType: this.currentTab === 'students' ? 'Students' : 'Staff',
                  total: count,
                  current: 0,
                  status: 'Queued...',
                  startTime: Date.now()
                });
                
                this.showMessage(
                  `🗑️ Bulk deletion queued! Processing ${count} ${this.currentTab} in background...`,
                  'success'
                );
                
                // Start polling if not already running
                if (!this.jobPollingInterval) {
                  this.startJobPolling();
                }
                
                // Clear selection
                this.selectedAccounts = [];
                this.allSelected = false;
                this.showBulkMenu = false;
                
              } else {
                throw new Error(data.message || 'Failed to submit bulk deletion');
              }
              
            } catch (error) {
              console.error('Bulk deletion submission error:', error);
              this.showMessage('Failed to submit bulk deletion: ' + error.message, 'error');
            }
          },
          
          // Open bulk connection add modal
          async openBulkConnectionAdd() {
            this.showBulkMenu = false;
            this.bulkConnectionType = '';
            this.bulkStaffEmail = '';
            
            // Load available staff if not already loaded
            if (this.schoolContext || this.selectedSchool) {
              const schoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId;
              
              if (schoolId) {
                // Quick load of all staff types
                try {
                  const [tutors, hoy, teachers, admins] = await Promise.all([
                    fetch(`${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=tutor`).then(r => r.json()),
                    fetch(`${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=head_of_year`).then(r => r.json()),
                    fetch(`${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=subject_teacher`).then(r => r.json()),
                    fetch(`${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=staff_admin`).then(r => r.json())
                  ]);
                  
                  if (tutors.success) this.availableStaff.tutors = tutors.staff || [];
                  if (hoy.success) this.availableStaff.headsOfYear = hoy.staff || [];
                  if (teachers.success) this.availableStaff.subjectTeachers = teachers.staff || [];
                  if (admins.success) this.availableStaff.staffAdmins = admins.staff || [];
                } catch (error) {
                  console.error('Error loading staff for bulk operation:', error);
                }
              }
            }
            
            this.showBulkConnectionMenu = true;
          },
          
          // Open bulk group update modal
          async openBulkGroupUpdate() {
            this.showBulkMenu = false;
            this.bulkGroupName = '';
            
            // Load available groups based on current tab
            if (this.currentTab === 'students') {
              await this.loadAllStudentGroups();
            } else if (this.currentTab === 'staff') {
              await this.loadAllDepartments();
            }
            
            this.showBulkGroupUpdateMenu = true;
          },
          
          // Execute bulk group update
          async executeBulkGroupUpdate() {
            if (!this.bulkGroupName) {
              this.showMessage('Please select a group', 'warning');
              return;
            }
            
            const isStaff = this.currentTab === 'staff';
            const fieldName = isStaff ? 'department' : 'group';
            const confirmMsg = isStaff
              ? `Update department for ${this.selectedAccounts.length} staff member(s) to "${this.bulkGroupName}"?`
              : `Update group for ${this.selectedAccounts.length} student(s) to "${this.bulkGroupName}"?`;
            
            if (!confirm(confirmMsg)) {
              return;
            }
            
            this.loading = true;
            this.loadingText = `Updating ${fieldName}s...`;
            
            let successCount = 0;
            let failCount = 0;
            
            try {
              for (const email of this.selectedAccounts) {
                const account = this.accounts.find(a => a.email === email);
                if (!account) continue;
                
                try {
                  const emulatedSchoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                    ? this.selectedSchool.supabaseUuid
                    : this.schoolContext?.schoolId || null;
                  
                  const updateData = {
                    accountType: isStaff ? 'staff' : 'student',
                    emulatedSchoolId: emulatedSchoolId
                  };
                  
                  // Set the appropriate field
                  if (isStaff) {
                    updateData.subject = this.bulkGroupName; // Department goes in subject field
                  } else {
                    updateData.tutorGroup = this.bulkGroupName;
                  }
                  
                  const response = await fetch(
                    `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(email)}`,
                    {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(updateData)
                    }
                  );
                  
                  const data = await response.json();
                  if (data.success) {
                    successCount++;
                  } else {
                    failCount++;
                  }
                } catch (err) {
                  failCount++;
                  console.error(`Failed to update ${email}:`, err);
                }
                
                // Small delay
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              
              this.showMessage(
                `✅ Bulk ${fieldName} update complete: ${successCount} success, ${failCount} failed`,
                failCount === 0 ? 'success' : 'warning'
              );
              
              // Clear selection and reload
              this.selectedAccounts = [];
              this.allSelected = false;
              this.showBulkGroupUpdateMenu = false;
              await this.loadAccounts();
              
            } catch (error) {
              console.error('Bulk group update error:', error);
              this.showMessage('Bulk group update failed: ' + error.message, 'error');
            } finally {
              this.loading = false;
            }
          },
          
          // Open bulk connection remove modal
          async openBulkConnectionRemove() {
            this.showBulkMenu = false;
            this.bulkConnectionType = '';
            this.bulkStaffEmail = '';
            
            // Load available staff if not already loaded
            if (this.schoolContext || this.selectedSchool) {
              const schoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId;
              
              if (schoolId) {
                try {
                  const [tutors, hoy, teachers, admins] = await Promise.all([
                    fetch(`${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=tutor`).then(r => r.json()),
                    fetch(`${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=head_of_year`).then(r => r.json()),
                    fetch(`${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=subject_teacher`).then(r => r.json()),
                    fetch(`${this.apiUrl}/api/v3/accounts/staff/available?schoolId=${schoolId}&roleType=staff_admin`).then(r => r.json())
                  ]);
                  
                  if (tutors.success) this.availableStaff.tutors = tutors.staff || [];
                  if (hoy.success) this.availableStaff.headsOfYear = hoy.staff || [];
                  if (teachers.success) this.availableStaff.subjectTeachers = teachers.staff || [];
                  if (admins.success) this.availableStaff.staffAdmins = admins.staff || [];
                } catch (error) {
                  console.error('Error loading staff for bulk operation:', error);
                }
              }
            }
            
            this.showBulkRemoveMenu = true;
          },
          
          // NEW: Bulk connection update (background job)
          async bulkUpdateConnections(connectionType, staffEmail, action) {
            if (!this.hasSelectedAccounts) {
              this.showMessage('Please select at least one account', 'warning');
              return;
            }
            
            const count = this.selectedAccounts.length;
            const typeName = connectionType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
            
            try {
              const emulatedSchoolId = this.isSuperUser && this.selectedSchool?.supabaseUuid
                ? this.selectedSchool.supabaseUuid
                : this.schoolContext?.schoolId || null;
              
              // Submit job to queue
              const response = await fetch(
                `${this.apiUrl}/api/v3/bulk/submit`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    operationType: 'connection-update',
                    emails: this.selectedAccounts,
                    connectionData: {
                      connectionType: connectionType,
                      staffEmail: staffEmail,
                      action: action
                    },
                    userContext: {
                      emulatedSchoolId: emulatedSchoolId,
                      userEmail: this.userEmail
                    }
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                // Add to active jobs for background tracking
                this.activeJobs.push({
                  jobId: data.jobId,
                  type: 'connection-update',
                  action: action,
                  connectionType: typeName,
                  staffEmail: staffEmail,
                  total: count,
                  current: 0,
                  status: 'Queued...',
                  startTime: Date.now()
                });
                
                this.showMessage(
                  `✅ Bulk operation queued! Processing ${count} students in background...`,
                  'success'
                );
                
                // Start polling if not already running
                if (!this.jobPollingInterval) {
                  this.startJobPolling();
                }
                
                // Clear selection
                this.selectedAccounts = [];
                this.allSelected = false;
                
              } else {
                throw new Error(data.message || 'Failed to submit bulk operation');
              }
              
            } catch (error) {
              console.error('Bulk operation submission error:', error);
              this.showMessage('Failed to submit bulk operation: ' + error.message, 'error');
            }
          },
          
          // Start polling for job status
          startJobPolling() {
            if (this.jobPollingInterval) return; // Already polling
            
            debugLog('Starting job polling');
            
            this.jobPollingInterval = setInterval(async () => {
              if (this.activeJobs.length === 0) {
                // No active jobs, stop polling
                clearInterval(this.jobPollingInterval);
                this.jobPollingInterval = null;
                debugLog('No active jobs, stopping polling');
                return;
              }
              
              // Poll each active job
              for (let i = this.activeJobs.length - 1; i >= 0; i--) {
                const job = this.activeJobs[i];
                
                try {
                  const response = await fetch(
                    `${this.apiUrl}/api/v3/bulk/status/${job.jobId}`,
                    { headers: { 'Content-Type': 'application/json' } }
                  );
                  
                  const data = await response.json();
                  
                  if (data.success) {
                    // Update job progress
                    if (data.progress) {
                      job.current = data.progress.current || 0;
                      job.status = data.progress.status || 'Processing...';
                    }
                    
                    // Check if completed or failed
                    if (data.completed) {
                      const result = data.result || {};
                      this.showMessage(
                        `✅ Bulk ${job.action} completed: ${result.successful || 0} success, ${result.failed || 0} failed`,
                        result.failed === 0 ? 'success' : 'warning'
                      );
                      
                      // Remove from active jobs
                      this.activeJobs.splice(i, 1);
                      
                      // Reload accounts to see changes
                      await this.loadAccounts();
                      
                    } else if (data.failed) {
                      this.showMessage(
                        `❌ Bulk ${job.action} failed: ${data.failedReason || 'Unknown error'}`,
                        'error'
                      );
                      this.activeJobs.splice(i, 1);
                    }
                  }
                } catch (error) {
                  console.error('Job polling error:', error);
                }
              }
            }, 5000); // Poll every 5 seconds (reduced from 2s to avoid rate limiting)
          },
          
          // ========== DELETE ==========
          
          async deleteAccount(account) {
            const accountTypeName = this.currentTab === 'students' ? 'student' : 'staff member';
            const isStudent = this.currentTab === 'students';
            
            // Comprehensive warning message
            const warningMessage = isStudent 
              ? `⚠️ PERMANENTLY DELETE STUDENT?\n\n` +
                `Email: ${account.email}\n` +
                `Name: ${account.firstName} ${account.lastName}\n\n` +
                `This will PERMANENTLY delete:\n` +
                `✓ Student account (login access)\n` +
                `✓ ALL VESPA results (Object_10/vespa_results)\n` +
                `✓ ALL questionnaires (Object_29/vespa_questionnaires)\n` +
                `✓ Student master record (Object_6/vespa_students)\n` +
                `✓ Supabase and Knack records\n\n` +
                `⚠️ THIS CANNOT BE UNDONE ⚠️\n\n` +
                `Type "DELETE" to confirm:`
              : `⚠️ PERMANENTLY DELETE STAFF MEMBER?\n\n` +
                `Email: ${account.email}\n` +
                `Name: ${account.firstName} ${account.lastName}\n\n` +
                `This will PERMANENTLY delete:\n` +
                `✓ Staff account (login access)\n` +
                `✓ All role assignments\n` +
                `✓ Connections to students\n` +
                `✓ Supabase and Knack records\n\n` +
                `⚠️ THIS CANNOT BE UNDONE ⚠️\n\n` +
                `Type "DELETE" to confirm:`;
            
            const userConfirmation = prompt(warningMessage);
            
            if (userConfirmation !== 'DELETE') {
              if (userConfirmation !== null) {
                this.showMessage('Deletion cancelled. Must type "DELETE" exactly.', 'info');
              }
              return;
            }
            
            this.loading = true;
            this.loadingText = `Permanently deleting ${accountTypeName}...`;
            
            try {
              const response = await fetch(
                `${this.apiUrl}/api/v3/accounts/${encodeURIComponent(account.email)}`,
                {
                  method: 'DELETE',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    accountType: this.currentTab === 'students' ? 'student' : 'staff',
                    emulatedSchoolId: this.isSuperUser && this.selectedSchool?.supabaseUuid
                      ? this.selectedSchool.supabaseUuid
                      : this.schoolContext?.schoolId
                  })
                }
              );
              
              const data = await response.json();
              
              if (data.success) {
                this.showMessage(`✅ Account permanently deleted: ${account.email}`, 'success');
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
            // Clear search and filters when switching tabs
            this.searchQuery = '';
            this.selectedYearGroup = '';
            this.selectedGroup = '';
            this.selectedStaffGroup = '';
            debugLog('Tab switched, filters cleared', { newTab: tab });
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
            
            <!-- Background Job Tracker (Non-blocking) -->
            <div v-if="activeJobs.length > 0" class="am-job-tracker">
              <div v-for="job in activeJobs" :key="job.jobId" class="am-job-card">
                <div class="am-job-header">
                  <span class="am-job-title">
                    {{ job.action === 'add' ? '➕' : '➖' }} {{ job.connectionType }}
                  </span>
                  <span class="am-job-count">{{ job.current }}/{{ job.total }}</span>
                </div>
                <div class="am-job-progress-bar">
                  <div class="am-job-progress-fill" :style="{ width: (job.current / job.total * 100) + '%' }"></div>
                </div>
                <div class="am-job-status">{{ job.status }}</div>
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
              
              <!-- Quick Action Buttons in Header -->
              <div class="am-header-actions" v-if="(selectedSchool || (!isSuperUser && schoolContext))">
                <button 
                  @click="openGroupManagement" 
                  class="am-button-header"
                  title="Manage school groups">
                  ⚙️ Manage Groups
                </button>
                <button 
                  @click="openCSVUploadModal" 
                  class="am-button-header"
                  title="Upload staff or students via CSV">
                  📤 Upload CSV
                </button>
                <button 
                  @click="openManualAddModal" 
                  class="am-button-header"
                  title="Add individual account">
                  ➕ Add Account
                </button>
                <button 
                  @click="openQRGenerationModal" 
                  class="am-button-header"
                  title="Generate QR codes for self-registration">
                  📱 Generate QR
                </button>
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
                <!-- School selector (super user only) -->
                <select 
                  v-if="isSuperUser" 
                  v-model="selectedSchool" 
                  @change="loadAccounts"
                  class="am-select am-school-select">
                  <option :value="null">🌍 All Schools</option>
                  <option 
                    v-for="school in allSchools" 
                    :key="school.id"
                    :value="school">
                    {{ school.name }}
                  </option>
                </select>
                
                <!-- Message for super user when no school selected -->
                <div v-if="!hasSelectedAccounts && isSuperUser && !selectedSchool" style="padding: 10px 16px; background: #fff3cd; border-radius: 8px; color: #856404; font-size: 14px; font-weight: 500;">
                  ℹ️ Select a school to use upload features (see blue header above)
                </div>
                
                <!-- Bulk selection info -->
                <div v-if="hasSelectedAccounts" class="am-selection-info">
                  <span class="am-icon">✓</span>
                  {{ selectedAccounts.length }} selected
                </div>
                
                <!-- Bulk actions dropdown (STUDENTS) -->
                <div v-if="hasSelectedAccounts && currentTab === 'students'" class="am-bulk-actions">
                  <button class="am-button secondary" @click="showBulkMenu = !showBulkMenu">
                    ⋮ Bulk Actions ({{ selectedAccounts.length }})
                  </button>
                  <div v-if="showBulkMenu" class="am-dropdown-menu am-dropdown-wide">
                    <div class="am-dropdown-section">
                      <div class="am-dropdown-label">📧 Email Actions</div>
                      <button @click="executeBulkAction('reset-password')" class="am-dropdown-item">
                        🔐 Reset Passwords
                      </button>
                      <button @click="executeBulkAction('resend-welcome')" class="am-dropdown-item">
                        📧 Resend Welcome Emails
                      </button>
                    </div>
                    
                    <div class="am-dropdown-section">
                      <div class="am-dropdown-label">📝 Update Actions</div>
                      <button @click="openBulkGroupUpdate" class="am-dropdown-item">
                        🏷️ Update Group
                      </button>
                    </div>
                    
                    <div class="am-dropdown-section">
                      <div class="am-dropdown-label">🔗 Connection Actions</div>
                      <button @click="openBulkConnectionAdd" class="am-dropdown-item">
                        ➕ Add Connections
                      </button>
                      <button @click="openBulkConnectionRemove" class="am-dropdown-item">
                        ➖ Remove Connections
                      </button>
                    </div>
                    
                    <div class="am-dropdown-section">
                      <button @click="executeBulkAction('delete')" class="am-dropdown-item danger">
                        🗑️ Delete Selected
                      </button>
                    </div>
                  </div>
                </div>
                
                <!-- Bulk actions dropdown (STAFF) -->
                <div v-if="hasSelectedAccounts && currentTab === 'staff'" class="am-bulk-actions">
                  <button class="am-button secondary" @click="showBulkMenu = !showBulkMenu">
                    ⋮ Bulk Actions ({{ selectedAccounts.length }})
                  </button>
                  <div v-if="showBulkMenu" class="am-dropdown-menu am-dropdown-wide">
                    <div class="am-dropdown-section">
                      <div class="am-dropdown-label">📧 Email Actions</div>
                      <button @click="executeBulkAction('reset-password')" class="am-dropdown-item">
                        🔐 Reset Passwords
                      </button>
                      <button @click="executeBulkAction('resend-welcome')" class="am-dropdown-item">
                        📧 Resend Welcome Emails
                      </button>
                    </div>
                    
                    <div class="am-dropdown-section">
                      <button @click="executeBulkAction('delete')" class="am-dropdown-item danger">
                        🗑️ Delete Selected
                      </button>
                    </div>
                    
                    <div class="am-dropdown-info" style="padding: 12px 16px; background: #f5f7fa; font-size: 12px; color: #666;">
                      💡 To manage staff groups, use the 👔 Edit Roles button
                    </div>
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
                
                <!-- Tutor/Student Group filter (students only) -->
                <select 
                  v-if="currentTab === 'students'" 
                  v-model="selectedGroup" 
                  @change="loadAccounts"
                  class="am-select">
                  <option value="">All Groups</option>
                  <option v-for="group in allStudentGroups" :key="group" :value="group">
                    {{ group }}
                  </option>
                </select>
                
                <!-- Group filter (staff only) -->
                <select 
                  v-if="currentTab === 'staff'" 
                  v-model="selectedStaffGroup" 
                  @change="loadAccounts"
                  class="am-select">
                  <option value="">All Groups</option>
                  <option v-for="group in availableStaffGroups" :key="group" :value="group">
                    {{ group }}
                  </option>
                </select>
                
                <!-- Search (auto-search on typing) -->
                <div class="am-search-box">
                  <input 
                    type="text" 
                    v-model="searchQuery"
                    @input="debouncedSearch"
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
                        :checked="allSelected"
                        @click="toggleSelectAll"
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
                    <th v-if="currentTab === 'staff'">Group</th>
                    
                    <th class="am-th-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="accounts.length === 0 && !loading">
                    <td :colspan="currentTab === 'students' ? 9 : 7" class="am-td-empty">
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
                        @click="toggleSelect(account.email)"
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
                        <select 
                          v-else 
                          v-model="editForm.tutorGroup" 
                          class="am-select-inline">
                          <option value="">-</option>
                          <option v-for="group in allStudentGroups" :key="group" :value="group">
                            {{ group }}
                          </option>
                        </select>
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
                            {{ role.replace('_', ' ') }}
                          </span>
                        </div>
                      </td>
                      
                      <!-- Group (editable for tutors/HOYs) -->
                      <td class="am-td-editable" @dblclick="account.roles?.includes('tutor') || account.roles?.includes('head_of_year') ? startEditStaffGroups(account) : null">
                        <span v-if="editingAccount?.email !== account.email || (!account.roles?.includes('tutor') && !account.roles?.includes('head_of_year'))">
                          {{ account.tutorGroup || '-' }}
                        </span>
                        <select 
                          v-else-if="editingAccount?.email === account.email"
                          v-model="editForm.tutorGroup" 
                          class="am-select-inline"
                          @change="quickSaveStaffGroups">
                          <option value="">-</option>
                          <option v-for="group in allStudentGroups" :key="group" :value="group">
                            {{ group }}
                          </option>
                        </select>
                      </td>
                    </template>
                    
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
                        <button v-if="currentTab === 'staff'" @click="openRoleEditor(account)" class="am-button-icon" title="Edit Roles">
                          👔
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
                          @click="removeConnection('tutor', tutor.email)"
                          class="am-button-icon-small danger"
                          title="Remove connection">
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
                          @click="removeConnection('head_of_year', hoy.email)"
                          class="am-button-icon-small danger"
                          title="Remove connection">
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
                          @click="removeConnection('subject_teacher', teacher.email)"
                          class="am-button-icon-small danger"
                          title="Remove connection">
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
                          @click="removeConnection('staff_admin', admin.email)"
                          class="am-button-icon-small danger"
                          title="Remove connection">
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
            
            <!-- Bulk Connection Add Modal -->
            <div v-if="showBulkConnectionMenu" class="am-modal-overlay" @click.self="showBulkConnectionMenu = false">
              <div class="am-modal am-modal-small">
                <div class="am-modal-header">
                  <h3>➕ Bulk Add Connections ({{ selectedAccounts.length }} students)</h3>
                  <button @click="showBulkConnectionMenu = false" class="am-modal-close">✖</button>
                </div>
                
                <div class="am-modal-body">
                  <p class="am-modal-description">
                    Add the same staff member as a connection to all {{ selectedAccounts.length }} selected students.
                  </p>
                  
                  <div class="am-form-group">
                    <label>Connection Type:</label>
                    <select v-model="bulkConnectionType" class="am-select">
                      <option value="">Select type...</option>
                      <option value="tutor">Tutor</option>
                      <option value="head_of_year">Head of Year</option>
                      <option value="subject_teacher">Subject Teacher</option>
                      <option value="staff_admin">Staff Admin</option>
                    </select>
                  </div>
                  
                  <div class="am-form-group" v-if="bulkConnectionType">
                    <label>Select Staff Member:</label>
                    <select v-model="bulkStaffEmail" class="am-select">
                      <option value="">Select staff...</option>
                      <option 
                        v-for="staff in availableStaff[bulkConnectionType === 'tutor' ? 'tutors' : bulkConnectionType === 'head_of_year' ? 'headsOfYear' : bulkConnectionType === 'subject_teacher' ? 'subjectTeachers' : 'staffAdmins']" 
                        :key="staff.email"
                        :value="staff.email">
                        {{ staff.fullName }} ({{ staff.email }})
                      </option>
                    </select>
                  </div>
                </div>
                
                <div class="am-modal-footer">
                  <button @click="showBulkConnectionMenu = false" class="am-button secondary">
                    Cancel
                  </button>
                  <button 
                    @click="bulkUpdateConnections(bulkConnectionType, bulkStaffEmail, 'add'); showBulkConnectionMenu = false"
                    :disabled="!bulkConnectionType || !bulkStaffEmail"
                    class="am-button primary">
                    Add to {{ selectedAccounts.length }} Students
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Bulk Group Update Modal (Students & Staff) -->
            <div v-if="showBulkGroupUpdateMenu" class="am-modal-overlay" @click.self="showBulkGroupUpdateMenu = false">
              <div class="am-modal am-modal-small">
                <div class="am-modal-header">
                  <h3 v-if="currentTab === 'students'">🏷️ Bulk Update Group ({{ selectedAccounts.length }} students)</h3>
                  <h3 v-else>🏷️ Bulk Update Department ({{ selectedAccounts.length }} staff)</h3>
                  <button @click="showBulkGroupUpdateMenu = false" class="am-modal-close">✖</button>
                </div>
                
                <div class="am-modal-body">
                  <p class="am-modal-description" v-if="currentTab === 'students'">
                    Set the same tutor group for all {{ selectedAccounts.length }} selected students.
                  </p>
                  <p class="am-modal-description" v-else>
                    Set the same department for all {{ selectedAccounts.length }} selected staff members.
                  </p>
                  
                  <div class="am-form-group">
                    <label v-if="currentTab === 'students'">Select Group:</label>
                    <label v-else>Select Department:</label>
                    <select v-model="bulkGroupName" class="am-select">
                      <option value="">{{ currentTab === 'students' ? 'Select group...' : 'Select department...' }}</option>
                      <option 
                        v-for="group in (currentTab === 'students' ? allStudentGroups : availableStaffGroups)" 
                        :key="group" 
                        :value="group">
                        {{ group }}
                      </option>
                    </select>
                  </div>
                  
                  <div v-if="(currentTab === 'students' ? allStudentGroups : availableStaffGroups).length === 0" style="padding: 16px; background: #fff3cd; border-radius: 6px; color: #856404; margin-top: 12px;">
                    ℹ️ No {{ currentTab === 'students' ? 'groups' : 'departments' }} available. Use "Manage Groups" to create them first.
                  </div>
                </div>
                
                <div class="am-modal-footer">
                  <button @click="showBulkGroupUpdateMenu = false" class="am-button secondary">
                    Cancel
                  </button>
                  <button 
                    @click="executeBulkGroupUpdate"
                    :disabled="!bulkGroupName"
                    class="am-button primary">
                    Update {{ selectedAccounts.length }} {{ currentTab === 'students' ? 'Students' : 'Staff' }}
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Bulk Connection Remove Modal -->
            <div v-if="showBulkRemoveMenu" class="am-modal-overlay" @click.self="showBulkRemoveMenu = false">
              <div class="am-modal am-modal-small">
                <div class="am-modal-header">
                  <h3>➖ Bulk Remove Connections ({{ selectedAccounts.length }} students)</h3>
                  <button @click="showBulkRemoveMenu = false" class="am-modal-close">✖</button>
                </div>
                
                <div class="am-modal-body">
                  <p class="am-modal-description">
                    Remove the same staff member connection from all {{ selectedAccounts.length }} selected students.
                  </p>
                  
                  <div class="am-form-group">
                    <label>Connection Type:</label>
                    <select v-model="bulkConnectionType" class="am-select">
                      <option value="">Select type...</option>
                      <option value="tutor">Tutor</option>
                      <option value="head_of_year">Head of Year</option>
                      <option value="subject_teacher">Subject Teacher</option>
                      <option value="staff_admin">Staff Admin</option>
                    </select>
                  </div>
                  
                  <div class="am-form-group" v-if="bulkConnectionType">
                    <label>Select Staff Member to Remove:</label>
                    <select v-model="bulkStaffEmail" class="am-select">
                      <option value="">Select staff...</option>
                      <option 
                        v-for="staff in availableStaff[bulkConnectionType === 'tutor' ? 'tutors' : bulkConnectionType === 'head_of_year' ? 'headsOfYear' : bulkConnectionType === 'subject_teacher' ? 'subjectTeachers' : 'staffAdmins']" 
                        :key="staff.email"
                        :value="staff.email">
                        {{ staff.fullName }} ({{ staff.email }})
                      </option>
                    </select>
                  </div>
                </div>
                
                <div class="am-modal-footer">
                  <button @click="showBulkRemoveMenu = false" class="am-button secondary">
                    Cancel
                  </button>
                  <button 
                    @click="bulkUpdateConnections(bulkConnectionType, bulkStaffEmail, 'remove'); showBulkRemoveMenu = false"
                    :disabled="!bulkConnectionType || !bulkStaffEmail"
                    class="am-button primary danger">
                    Remove from {{ selectedAccounts.length }} Students
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Role Management Modal -->
            <div v-if="showRoleModal" class="am-modal-overlay" @click.self="closeRoleModals">
              <div class="am-modal am-modal-small">
                <div class="am-modal-header">
                  <h3>👔 Edit Roles: {{ roleEditingStaff?.firstName }} {{ roleEditingStaff?.lastName }}</h3>
                  <button @click="closeRoleModals" class="am-modal-close">✖</button>
                </div>
                
                <div class="am-modal-body">
                  <p class="am-modal-description">
                    Select the roles for this staff member. Changes will be processed in the background.
                  </p>
                  
                  <div class="am-form-group">
                    <label style="margin-bottom: 12px; display: block;">Roles:</label>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                      <!-- Tutor Role -->
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <label style="flex: 1; display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px; background: #f5f7fa; border-radius: 6px; transition: all 0.2s;">
                          <input type="checkbox" v-model="roleForm.tutor" class="am-checkbox" />
                          <span style="font-weight: 600;">👨‍🏫 Tutor</span>
                        </label>
                        <button 
                          v-if="roleForm.tutor"
                          @click="showTutorAssignmentModal = true"
                          class="am-button secondary"
                          style="white-space: nowrap; font-size: 13px; padding: 8px 16px;">
                          📋 Manage Groups
                        </button>
                      </div>
                      
                      <!-- HOY Role -->
                      <div style="display: flex; align-items: center; gap: 10px;">
                        <label style="flex: 1; display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px; background: #f5f7fa; border-radius: 6px;">
                          <input type="checkbox" v-model="roleForm.head_of_year" class="am-checkbox" />
                          <span style="font-weight: 600;">🎓 Head of Year</span>
                        </label>
                        <button 
                          v-if="roleForm.head_of_year"
                          @click="showHoyAssignmentModal = true"
                          class="am-button secondary"
                          style="white-space: nowrap; font-size: 13px; padding: 8px 16px;">
                          📋 Manage Years
                        </button>
                      </div>
                      
                      <!-- Other Roles -->
                      <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px; background: #f5f7fa; border-radius: 6px;">
                        <input type="checkbox" v-model="roleForm.subject_teacher" class="am-checkbox" />
                        <span style="font-weight: 600;">📚 Subject Teacher</span>
                      </label>
                      
                      <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px; background: #f5f7fa; border-radius: 6px;">
                        <input type="checkbox" v-model="roleForm.staff_admin" class="am-checkbox" />
                        <span style="font-weight: 600;">👔 Staff Admin</span>
                      </label>
                    </div>
                  </div>
                  
                  <!-- Assignment Summary -->
                  <div v-if="tutorGroupSelections.length > 0 || hoyYearSelections.length > 0" style="margin-top: 20px; padding: 16px; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 6px;">
                    <h4 style="margin: 0 0 12px 0; color: #2e7d32; font-size: 14px; font-weight: 600;">📌 Assignment Summary:</h4>
                    <div v-if="tutorGroupSelections.length > 0" style="margin-bottom: 8px;">
                      <strong>Tutor Groups:</strong> {{ tutorGroupSelections.join(', ') }}
                    </div>
                    <div v-if="hoyYearSelections.length > 0">
                      <strong>HOY Years:</strong> Year {{ hoyYearSelections.join(', ') }}
                    </div>
                  </div>
                </div>
                
                <div class="am-modal-footer">
                  <button @click="closeRoleModals" class="am-button secondary">
                    Cancel
                  </button>
                  <button @click="saveRoles" class="am-button primary">
                    Save & Assign
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Tutor Group Assignment Modal -->
            <div v-if="showTutorAssignmentModal" class="am-modal-overlay" @click.self="closeRoleModals">
              <div class="am-modal am-modal-small">
                <div class="am-modal-header">
                  <h3>👨‍🏫 Assign Tutor Groups</h3>
                  <button @click="closeRoleModals" class="am-modal-close">✖</button>
                </div>
                
                <div class="am-modal-body">
                  <p class="am-modal-description">
                    Select which groups this tutor will be assigned to. They will be automatically connected to all matching students.
                  </p>
                  
                  <!-- Current Assignments Display -->
                  <div v-if="tutorGroupSelections.length > 0" style="margin-bottom: 20px; padding: 16px; background: #e3f2fd; border-left: 4px solid #079baa; border-radius: 6px;">
                    <h4 style="margin: 0 0 8px 0; color: #2a3c7a; font-size: 14px; font-weight: 600;">📌 Current Assignments:</h4>
                    <p style="margin: 0; color: #1976d2; font-weight: 500;">
                      {{ tutorGroupSelections.join(', ') }}
                    </p>
                  </div>
                  
                  <div class="am-form-group">
                    <label style="margin-bottom: 12px; display: block;">Select Groups:</label>
                    
                    <div style="max-height: 300px; overflow-y: auto; border: 2px solid #e0e0e0; border-radius: 8px; padding: 12px;">
                      <label 
                        v-for="group in allStudentGroups" 
                        :key="group"
                        style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 10px; margin-bottom: 8px; background: #f5f7fa; border-radius: 6px; transition: all 0.2s;"
                        :style="{ background: tutorGroupSelections.includes(group) ? '#e3f2fd' : '#f5f7fa' }">
                        <input 
                          type="checkbox" 
                          :value="group"
                          v-model="tutorGroupSelections"
                          class="am-checkbox" />
                        <span style="font-weight: 500;">{{ group }}</span>
                      </label>
                      
                      <div v-if="allStudentGroups.length === 0" class="am-empty" style="padding: 20px;">
                        No student groups available in this school
                      </div>
                    </div>
                    
                    <div v-if="tutorGroupSelections.length > 0" style="margin-top: 12px; padding: 12px; background: #e3f2fd; border-radius: 6px;">
                      <strong>Selected:</strong> {{ tutorGroupSelections.join(', ') }}
                    </div>
                  </div>
                </div>
                
                <div class="am-modal-footer">
                  <button @click="closeRoleModals" class="am-button secondary">
                    Cancel
                  </button>
                  <button 
                    @click="confirmTutorAssignment" 
                    :disabled="tutorGroupSelections.length === 0"
                    class="am-button primary">
                    Assign to {{ tutorGroupSelections.length }} Group(s)
                  </button>
                </div>
              </div>
            </div>
            
            <!-- HOY Year Group Assignment Modal -->
            <div v-if="showHoyAssignmentModal" class="am-modal-overlay" @click.self="closeRoleModals">
              <div class="am-modal am-modal-small">
                <div class="am-modal-header">
                  <h3>🎓 Assign Year Groups (Head of Year)</h3>
                  <button @click="closeRoleModals" class="am-modal-close">✖</button>
                </div>
                
                <div class="am-modal-body">
                  <p class="am-modal-description">
                    Select which year groups this Head of Year will be responsible for. They will be automatically connected to all matching students.
                  </p>
                  
                  <!-- Current Assignments Display -->
                  <div v-if="hoyYearSelections.length > 0" style="margin-bottom: 20px; padding: 16px; background: #e3f2fd; border-left: 4px solid #079baa; border-radius: 6px;">
                    <h4 style="margin: 0 0 8px 0; color: #2a3c7a; font-size: 14px; font-weight: 600;">📌 Current Assignments:</h4>
                    <p style="margin: 0; color: #1976d2; font-weight: 500;">
                      Year {{ hoyYearSelections.join(', ') }}
                    </p>
                  </div>
                  
                  <div class="am-form-group">
                    <label style="margin-bottom: 12px; display: block;">Select Year Groups:</label>
                    
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                      <label 
                        v-for="year in yearGroups" 
                        :key="year"
                        style="display: flex; align-items: center; gap: 10px; cursor: pointer; padding: 12px; border-radius: 6px; transition: all 0.2s;"
                        :style="{ background: hoyYearSelections.includes(year) ? '#e3f2fd' : '#f5f7fa' }">
                        <input 
                          type="checkbox" 
                          :value="year"
                          v-model="hoyYearSelections"
                          class="am-checkbox" />
                        <span style="font-weight: 600; font-size: 16px;">Year {{ year }}</span>
                      </label>
                    </div>
                    
                    <div v-if="hoyYearSelections.length > 0" style="margin-top: 12px; padding: 12px; background: #e3f2fd; border-radius: 6px;">
                      <strong>Selected:</strong> Year {{ hoyYearSelections.join(', ') }}
                    </div>
                  </div>
                </div>
                
                <div class="am-modal-footer">
                  <button @click="closeRoleModals" class="am-button secondary">
                    Cancel
                  </button>
                  <button 
                    @click="confirmHoyAssignment" 
                    :disabled="hoyYearSelections.length === 0"
                    class="am-button primary">
                    Assign to {{ hoyYearSelections.length }} Year Group(s)
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Group Management Modal -->
            <div v-if="showGroupManagementModal" class="am-modal-overlay" @click.self="closeGroupManagement">
              <div class="am-modal">
                <div class="am-modal-header">
                  <h3>⚙️ Manage School Groups</h3>
                  <button @click="closeGroupManagement" class="am-modal-close">✖</button>
                </div>
                
                <div class="am-modal-body">
                  <!-- Add New Group -->
                  <div style="background: #f5f7fa; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
                    <h4 style="margin: 0 0 16px 0; color: #2a3c7a;">➕ Add New Group</h4>
                    <div style="display: flex; gap: 12px; align-items: flex-end;">
                      <div style="flex: 1;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px;">Group Name:</label>
                        <input 
                          v-model="newGroupName"
                          @keyup.enter="addNewGroup"
                          placeholder="e.g., 12A, L.Durant, Intervention 1"
                          class="am-input-inline"
                          style="width: 100%; padding: 10px;" />
                      </div>
                      <div style="width: 180px;">
                        <label style="display: block; margin-bottom: 6px; font-weight: 600; font-size: 13px;">Type:</label>
                        <select v-model="newGroupType" class="am-select-inline" style="width: 100%; padding: 10px;">
                          <option value="tutor_group">Tutor Group</option>
                          <option value="year_group">Year Group</option>
                          <option value="department">Department</option>
                        </select>
                      </div>
                      <button @click="addNewGroup" class="am-button primary" style="white-space: nowrap;">
                        Add Group
                      </button>
                    </div>
                  </div>
                  
                  <!-- Tutor Groups -->
                  <div class="am-connection-section">
                    <h4>👨‍🏫 Tutor Groups ({{ schoolGroups.filter(g => g.group_type === 'tutor_group').length }})</h4>
                    <div class="am-connection-list" style="max-height: 200px; overflow-y: auto;">
                      <div 
                        v-for="group in schoolGroups.filter(g => g.group_type === 'tutor_group')"
                        :key="group.id"
                        class="am-connection-item">
                        <!-- Rename Mode -->
                        <div v-if="editingGroup && editingGroup.id === group.id" style="display: flex; gap: 8px; flex: 1; align-items: center;">
                          <input 
                            v-model="renameGroupName"
                            @keyup.enter="confirmRenameGroup"
                            class="am-input-inline"
                            style="flex: 1; padding: 6px;" />
                          <button @click="confirmRenameGroup" class="am-button-icon-small" style="background: #28a745; color: white;">
                            ✓
                          </button>
                          <button @click="cancelRenameGroup" class="am-button-icon-small danger">
                            ✖
                          </button>
                        </div>
                        <!-- View Mode -->
                        <div v-else style="display: flex; gap: 8px; flex: 1; align-items: center; justify-content: space-between;">
                          <span style="font-weight: 500;">{{ group.group_name }}</span>
                          <div style="display: flex; gap: 4px;">
                            <button 
                              @click="startRenameGroup(group)"
                              class="am-button-icon-small"
                              title="Rename group">
                              ✏️
                            </button>
                            <button 
                              @click="checkGroupUsageAndDelete(group)"
                              class="am-button-icon-small danger"
                              title="Delete group">
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                      <div v-if="schoolGroups.filter(g => g.group_type === 'tutor_group').length === 0" class="am-empty">
                        No tutor groups. Add one above!
                      </div>
                    </div>
                  </div>
                  
                  <!-- Year Groups -->
                  <div class="am-connection-section">
                    <h4>🎓 Year Groups ({{ schoolGroups.filter(g => g.group_type === 'year_group').length }})</h4>
                    <div class="am-connection-list" style="max-height: 200px; overflow-y: auto;">
                      <div 
                        v-for="group in schoolGroups.filter(g => g.group_type === 'year_group')"
                        :key="group.id"
                        class="am-connection-item">
                        <!-- Rename Mode -->
                        <div v-if="editingGroup && editingGroup.id === group.id" style="display: flex; gap: 8px; flex: 1; align-items: center;">
                          <input 
                            v-model="renameGroupName"
                            @keyup.enter="confirmRenameGroup"
                            class="am-input-inline"
                            style="flex: 1; padding: 6px;" />
                          <button @click="confirmRenameGroup" class="am-button-icon-small" style="background: #28a745; color: white;">
                            ✓
                          </button>
                          <button @click="cancelRenameGroup" class="am-button-icon-small danger">
                            ✖
                          </button>
                        </div>
                        <!-- View Mode -->
                        <div v-else style="display: flex; gap: 8px; flex: 1; align-items: center; justify-content: space-between;">
                          <span style="font-weight: 500;">Year {{ group.group_name }}</span>
                          <div style="display: flex; gap: 4px;">
                            <button 
                              @click="startRenameGroup(group)"
                              class="am-button-icon-small"
                              title="Rename year group">
                              ✏️
                            </button>
                            <button 
                              @click="checkGroupUsageAndDelete(group)"
                              class="am-button-icon-small danger"
                              title="Delete year group">
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                      <div v-if="schoolGroups.filter(g => g.group_type === 'year_group').length === 0" class="am-empty">
                        No year groups. Add one above!
                      </div>
                    </div>
                  </div>
                  
                  <!-- Departments -->
                  <div class="am-connection-section">
                    <h4>📚 Departments ({{ schoolGroups.filter(g => g.group_type === 'department').length }})</h4>
                    <div class="am-connection-list" style="max-height: 200px; overflow-y: auto;">
                      <div 
                        v-for="group in schoolGroups.filter(g => g.group_type === 'department')"
                        :key="group.id"
                        class="am-connection-item">
                        <!-- Rename Mode -->
                        <div v-if="editingGroup && editingGroup.id === group.id" style="display: flex; gap: 8px; flex: 1; align-items: center;">
                          <input 
                            v-model="renameGroupName"
                            @keyup.enter="confirmRenameGroup"
                            class="am-input-inline"
                            style="flex: 1; padding: 6px;" />
                          <button @click="confirmRenameGroup" class="am-button-icon-small" style="background: #28a745; color: white;">
                            ✓
                          </button>
                          <button @click="cancelRenameGroup" class="am-button-icon-small danger">
                            ✖
                          </button>
                        </div>
                        <!-- View Mode -->
                        <div v-else style="display: flex; gap: 8px; flex: 1; align-items: center; justify-content: space-between;">
                          <span style="font-weight: 500;">{{ group.group_name }}</span>
                          <div style="display: flex; gap: 4px;">
                            <button 
                              @click="startRenameGroup(group)"
                              class="am-button-icon-small"
                              title="Rename department">
                              ✏️
                            </button>
                            <button 
                              @click="checkGroupUsageAndDelete(group)"
                              class="am-button-icon-small danger"
                              title="Delete department">
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>
                      <div v-if="schoolGroups.filter(g => g.group_type === 'department').length === 0" class="am-empty">
                        No departments. Add one above!
                      </div>
                    </div>
                  </div>
                </div>
                
                <div class="am-modal-footer">
                  <button @click="closeGroupManagement" class="am-button primary">
                    Done
                  </button>
                </div>
              </div>
            </div>
            
            <!-- CSV Upload Modal -->
            <div v-if="showCSVUploadModal" class="am-modal-overlay" @click.self="closeCSVUploadModal">
              <div class="am-modal">
                <div class="am-modal-header">
                  <h3>📤 CSV Upload - {{ csvUploadType === 'students' ? 'Students' : 'Staff' }}</h3>
                  <button @click="closeCSVUploadModal" class="am-modal-close">✖</button>
                </div>
                
                <div class="am-modal-body">
                  <div class="am-modal-description">
                    Upload multiple {{ csvUploadType }} accounts via CSV file. The same validation and processing as the main upload system.
                  </div>
                  
                  <!-- File Selection -->
                  <div style="margin: 20px 0;">
                    <label style="display: block; margin-bottom: 10px; font-weight: 600;">
                      Select CSV File:
                    </label>
                    <input 
                      type="file" 
                      accept=".csv"
                      @change="handleCSVFileSelect"
                      style="padding: 10px; border: 1px solid #ddd; border-radius: 6px; width: 100%;" />
                    
                    <div v-if="selectedCSVFile" style="margin-top: 10px; padding: 10px; background: #e3f2fd; border-radius: 6px;">
                      <strong>Selected:</strong> {{ selectedCSVFile.name }} ({{ (selectedCSVFile.size / 1024).toFixed(1) }} KB)
                    </div>
                  </div>
                  
                  <!-- Validation Results -->
                  <div v-if="csvValidationResults" style="margin: 20px 0; padding: 15px; border-radius: 6px;"
                    :style="{ background: (csvValidationResults.success || csvValidationResults.isValid) ? '#d4edda' : '#f8d7da' }">
                    <div style="font-weight: 600; margin-bottom: 8px;">
                      {{ (csvValidationResults.success || csvValidationResults.isValid) ? '✅ Validation Passed' : '❌ Validation Failed' }}
                    </div>
                    <div>Total Rows: {{ csvData?.length || 0 }}</div>
                    <div v-if="csvValidationResults.errors && csvValidationResults.errors.length > 0">
                      Errors: {{ csvValidationResults.errors.length }}
                    </div>
                  </div>
                  
                  <!-- Template Download -->
                  <div style="margin: 20px 0; padding: 15px; background: #f5f7fa; border-radius: 6px;">
                    <div style="font-weight: 600; margin-bottom: 8px;">Need a template?</div>
                    <div style="font-size: 13px; color: #666; margin-bottom: 10px;">
                      Download the {{ csvUploadType }} CSV template to see the required format.
                    </div>
                    <a 
                      :href="csvUploadType === 'students' 
                        ? 'data:text/csv;charset=utf-8,UPN,Firstname,Lastname,Student Email,Gender,DOB,Group,Year Gp,Level,Tutors,Head of Year,Subject Teachers\\n' 
                        : 'data:text/csv;charset=utf-8,Title,First Name,Last Name,Email Address,Staff Type,Year Group,Group,Faculty/Dept,Subject\\n'"
                      :download="csvUploadType === 'students' ? 'StudentData.csv' : 'staff_template.csv'"
                      class="am-button secondary">
                      📥 Download Template
                    </a>
                  </div>
                </div>
                
                <div class="am-modal-footer">
                  <button @click="closeCSVUploadModal" class="am-button secondary">
                    Cancel
                  </button>
                  <button 
                    v-if="!csvValidationResults"
                    @click="validateCSV" 
                    :disabled="!selectedCSVFile || csvUploading"
                    class="am-button primary">
                    Validate CSV
                  </button>
                  <button 
                    v-if="csvValidationResults && (csvValidationResults.success || csvValidationResults.isValid)"
                    @click="submitCSVUpload" 
                    :disabled="csvUploading"
                    class="am-button primary">
                    {{ csvUploading ? 'Uploading...' : 'Upload & Process' }}
                  </button>
                </div>
              </div>
            </div>
            
            <!-- Manual Add Modal -->
            <div v-if="showManualAddModal" class="am-modal-overlay" @click.self="closeManualAddModal">
              <div class="am-modal am-modal-large">
                <div class="am-modal-header" style="background: linear-gradient(135deg, #2a3c7a 0%, #079baa 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
                  <h3 style="margin: 0; font-size: 24px; display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 32px;">{{ manualAddType === 'students' ? '🎓' : '👨‍🏫' }}</span>
                    Add {{ manualAddType === 'students' ? 'Student' : 'Staff Member' }}
                  </h3>
                  <button @click="closeManualAddModal" class="am-modal-close" style="color: white; font-size: 28px; opacity: 0.9;">✖</button>
                </div>
                
                <div class="am-modal-body" style="padding: 32px; max-height: 70vh; overflow-y: auto;">
                  <!-- Staff Form -->
                  <div v-if="manualAddType === 'staff'" style="background: #f8f9fa; padding: 24px; border-radius: 8px;">
                    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 20px;">
                      <h4 style="margin: 0 0 16px 0; color: #2a3c7a; font-size: 16px; border-bottom: 2px solid #079baa; padding-bottom: 8px;">👤 Personal Information</h4>
                      <div style="display: grid; grid-template-columns: 100px 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Title *</label>
                          <input v-model="manualAddForm.title" placeholder="Mr/Ms/Dr" class="am-input-inline" required style="padding: 10px; font-size: 14px;" />
                        </div>
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">First Name *</label>
                          <input v-model="manualAddForm.firstName" class="am-input-inline" required style="padding: 10px; font-size: 14px;" />
                        </div>
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Last Name *</label>
                          <input v-model="manualAddForm.lastName" class="am-input-inline" required style="padding: 10px; font-size: 14px;" />
                        </div>
                      </div>
                      
                      <div style="margin-bottom: 0;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Email Address *</label>
                        <input v-model="manualAddForm.email" type="email" class="am-input-inline" required style="padding: 10px; font-size: 14px;" />
                      </div>
                    </div>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 20px;">
                      <h4 style="margin: 0 0 16px 0; color: #2a3c7a; font-size: 16px; border-bottom: 2px solid #079baa; padding-bottom: 8px;">👔 Role & Assignment</h4>
                      <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Staff Type(s) *</label>
                        <select v-model="manualAddForm.staffTypes" multiple class="am-select-inline" style="height: 140px; padding: 10px; font-size: 14px;">
                          <option value="admin">👑 Staff Admin</option>
                          <option value="tut">👨‍🏫 Tutor</option>
                          <option value="hoy">🎓 Head of Year</option>
                          <option value="hod">📚 Head of Department</option>
                          <option value="sub">📖 Subject Teacher</option>
                          <option value="gen">👤 General Staff</option>
                        </select>
                        <small style="color: #666; display: block; margin-top: 6px;">💡 Hold Ctrl/Cmd to select multiple roles</small>
                      </div>
                      
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Year Group</label>
                          <select v-model="manualAddForm.yearGroup" class="am-select-inline" style="padding: 10px; font-size: 14px;">
                            <option value="">-- Optional --</option>
                            <option v-for="year in yearGroups" :key="year" :value="year">Year {{ year }}</option>
                          </select>
                        </div>
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Tutor Group</label>
                          <select v-model="manualAddForm.group" class="am-select-inline" style="padding: 10px; font-size: 14px;">
                            <option value="">-- Optional --</option>
                            <option v-for="group in availableGroups" :key="group" :value="group">{{ group }}</option>
                          </select>
                          <small v-if="availableGroups.length === 0" style="color: #dc3545; display: block; margin-top: 4px;">⚠️ No groups available - will be added to school_groups table</small>
                        </div>
                      </div>
                    </div>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                      <h4 style="margin: 0 0 16px 0; color: #2a3c7a; font-size: 16px; border-bottom: 2px solid #079baa; padding-bottom: 8px;">📖 Teaching Details</h4>
                      <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Subject</label>
                        <input v-model="manualAddForm.subject" placeholder="e.g., Physics, Mathematics, English" class="am-input-inline" style="padding: 10px; font-size: 14px;" />
                      </div>
                    </div>
                  </div>
                  
                  <!-- Student Form -->
                  <div v-if="manualAddType === 'students'" style="background: #f8f9fa; padding: 24px; border-radius: 8px;">
                    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 20px;">
                      <h4 style="margin: 0 0 16px 0; color: #2a3c7a; font-size: 16px; border-bottom: 2px solid #079baa; padding-bottom: 8px;">👤 Personal Information</h4>
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">First Name *</label>
                          <input v-model="manualAddForm.firstName" class="am-input-inline" required style="padding: 10px; font-size: 14px;" />
                        </div>
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Last Name *</label>
                          <input v-model="manualAddForm.lastName" class="am-input-inline" required style="padding: 10px; font-size: 14px;" />
                        </div>
                      </div>
                      
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Email Address *</label>
                          <input v-model="manualAddForm.email" type="email" class="am-input-inline" required style="padding: 10px; font-size: 14px;" />
                        </div>
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">UPN</label>
                          <input v-model="manualAddForm.upn" placeholder="Auto-generated if blank" class="am-input-inline" style="padding: 10px; font-size: 14px;" />
                          <small style="color: #666; display: block; margin-top: 4px;">Leave blank to auto-generate</small>
                        </div>
                      </div>
                    </div>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); margin-bottom: 20px;">
                      <h4 style="margin: 0 0 16px 0; color: #2a3c7a; font-size: 16px; border-bottom: 2px solid #079baa; padding-bottom: 8px;">📚 Academic Details</h4>
                      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Year Group *</label>
                          <select v-model="manualAddForm.yearGroup" class="am-select-inline" required style="padding: 10px; font-size: 14px;">
                            <option value="">-- Select --</option>
                            <option v-for="year in yearGroups" :key="year" :value="year">Year {{ year }}</option>
                          </select>
                        </div>
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Level *</label>
                          <select v-model="manualAddForm.level" class="am-select-inline" required style="padding: 10px; font-size: 14px;">
                            <option value="">-- Select --</option>
                            <option value="Level 2">📘 Level 2</option>
                            <option value="Level 3">📗 Level 3</option>
                          </select>
                        </div>
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Tutor Group</label>
                          <select v-model="manualAddForm.group" class="am-select-inline" style="padding: 10px; font-size: 14px;">
                            <option value="">-- Optional --</option>
                            <option v-for="group in availableGroups" :key="group" :value="group">{{ group }}</option>
                          </select>
                          <small v-if="availableGroups.length === 0" style="color: #dc3545; display: block; margin-top: 4px;">⚠️ Upload CSV first to populate groups</small>
                        </div>
                      </div>
                      
                      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Gender</label>
                          <select v-model="manualAddForm.gender" class="am-select-inline" style="padding: 10px; font-size: 14px;">
                            <option value="">-- Optional --</option>
                            <option value="Male">👨 Male</option>
                            <option value="Female">👩 Female</option>
                            <option value="Non-Binary">⚧ Non-Binary</option>
                            <option value="Prefer Not to Say">🤐 Prefer Not to Say</option>
                          </select>
                        </div>
                        <div>
                          <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">Date of Birth</label>
                          <input v-model="manualAddForm.dob" type="date" class="am-input-inline" style="padding: 10px; font-size: 14px;" />
                        </div>
                      </div>
                    </div>
                    
                    <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                      <h4 style="margin: 0 0 16px 0; color: #2a3c7a; font-size: 16px; border-bottom: 2px solid #079baa; padding-bottom: 8px;">🔗 Staff Connections</h4>
                      <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">👨‍🏫 Tutors</label>
                        <select v-model="manualAddForm.tutors" multiple class="am-select-inline" style="height: 120px; padding: 10px; font-size: 14px;">
                          <option v-for="tutor in availableStaff.tutors" :key="tutor.email" :value="tutor.email">
                            {{ tutor.name }} ({{ tutor.email }})
                          </option>
                        </select>
                        <small style="color: #666; display: block; margin-top: 6px;">💡 Hold Ctrl/Cmd to select multiple tutors ({{ availableStaff.tutors.length }} available)</small>
                      </div>
                      
                      <div style="margin-bottom: 16px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">🎓 Head of Year</label>
                        <select v-model="manualAddForm.headOfYear" class="am-select-inline" style="padding: 10px; font-size: 14px;">
                          <option value="">-- Optional --</option>
                          <option v-for="hoy in availableStaff.headsOfYear" :key="hoy.email" :value="hoy.email">
                            {{ hoy.name }} ({{ hoy.email }})
                          </option>
                        </select>
                        <small style="color: #666; display: block; margin-top: 4px;">{{ availableStaff.headsOfYear.length }} available</small>
                      </div>
                      
                      <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; font-size: 14px; color: #333;">📖 Subject Teachers</label>
                        <select v-model="manualAddForm.subjectTeachers" multiple class="am-select-inline" style="height: 120px; padding: 10px; font-size: 14px;">
                          <option v-for="teacher in availableStaff.subjectTeachers" :key="teacher.email" :value="teacher.email">
                            {{ teacher.name }}{{ teacher.subject ? ' - ' + teacher.subject : '' }}
                          </option>
                        </select>
                        <small style="color: #666; display: block; margin-top: 6px;">💡 Hold Ctrl/Cmd to select multiple ({{ availableStaff.subjectTeachers.length }} available)</small>
                      </div>
                    </div>
                  </div>
                  
                  <div style="margin-top: 24px; padding: 16px; background: linear-gradient(135deg, #e3f2fd 0%, #e1f5fe 100%); border-left: 4px solid #2196f3; border-radius: 6px;">
                    <div style="display: flex; align-items: center; gap: 12px;">
                      <span style="font-size: 24px;">🔐</span>
                      <div>
                        <div style="font-weight: 600; color: #1976d2; margin-bottom: 4px;">Auto-Generated Password</div>
                        <div style="font-size: 13px; color: #666;">A secure temporary password will be created and sent via welcome email</div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div class="am-modal-footer" style="background: #f5f7fa; padding: 20px 32px; border-top: 1px solid #e0e0e0;">
                  <button @click="closeManualAddModal" class="am-button secondary" style="padding: 12px 24px; font-size: 14px;">
                    Cancel
                  </button>
                  <button 
                    @click="submitManualAdd" 
                    :disabled="manualAddSubmitting || !canSubmitManualAdd"
                    class="am-button primary"
                    style="padding: 12px 32px; font-size: 14px; min-width: 140px;">
                    {{ manualAddSubmitting ? '⏳ Adding...' : '✓ Add Account' }}
                  </button>
                </div>
              </div>
            </div>
            
            <!-- QR Generation Modal -->
            <div v-if="showQRModal" class="am-modal-overlay" @click.self="closeQRModal">
              <div class="am-modal am-modal-small">
                <div class="am-modal-header" style="background: linear-gradient(135deg, #2a3c7a 0%, #079baa 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
                  <h3 style="margin: 0; font-size: 24px; display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 32px;">📱</span>
                    Generate QR Code
                  </h3>
                  <button @click="closeQRModal" class="am-modal-close" style="color: white; font-size: 28px; opacity: 0.9;">✖</button>
                </div>
                
                <div class="am-modal-body" style="padding: 32px;">
                  <div style="margin-bottom: 24px; text-align: center;">
                    <div style="font-size: 64px; margin-bottom: 16px;">🎯</div>
                    <h4 style="font-size: 20px; color: #2a3c7a; margin-bottom: 12px;">Quick QR Generation</h4>
                    <p style="color: #666; font-size: 15px; line-height: 1.6;">
                      Generate QR codes for self-registration with default settings.
                    </p>
                  </div>
                  
                  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <div style="font-weight: 600; margin-bottom: 12px; color: #333;">School:</div>
                    <div style="font-size: 18px; color: #2a3c7a; font-weight: 600;">
                      🏫 {{ isSuperUser && selectedSchool ? selectedSchool.name : schoolContext?.customerName || 'Your School' }}
                    </div>
                  </div>
                  
                  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <button @click="generateStudentQR(); closeQRModal();" class="am-button primary" style="padding: 20px; font-size: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                      <span style="font-size: 48px;">🎓</span>
                      <span>Student QR</span>
                    </button>
                    <button @click="generateStaffQR(); closeQRModal();" class="am-button primary" style="padding: 20px; font-size: 16px; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                      <span style="font-size: 48px;">👥</span>
                      <span>Staff QR</span>
                    </button>
                  </div>
                  
                  <div style="margin-top: 24px; padding: 16px; background: #e3f2fd; border-radius: 6px; border-left: 4px solid #2196f3; font-size: 13px; text-align: left;">
                    <div style="font-weight: 600; color: #1976d2; margin-bottom: 6px;">Default Settings:</div>
                    <ul style="margin: 6px 0 0 20px; padding: 0; color: #666;">
                      <li>Valid for 365 days (students) / 30 days (staff)</li>
                      <li>School email required</li>
                      <li>Auto-approve enabled</li>
                    </ul>
                  </div>
                </div>
                
                <div class="am-modal-footer" style="background: #f5f7fa; padding: 20px 32px;">
                  <button @click="closeQRModal" class="am-button secondary">
                    Close
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
        
        .am-progress-bar {
          width: 300px;
          height: 8px;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 4px;
          margin: 20px auto;
          overflow: hidden;
        }
        
        .am-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00e5db, #079baa);
          transition: width 0.3s ease;
        }
        
        .am-progress-text {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 8px;
        }
        
        .am-progress-status {
          font-size: 14px;
          opacity: 0.9;
        }
        
        /* ========== Header ========== */
        .am-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          padding: 30px;
          background: linear-gradient(135deg, #2a3c7a, #3a4c8a);
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        .am-header h1 {
          font-size: 32px;
          color: white;
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
        
        /* Header Action Buttons */
        .am-header-actions {
          display: flex;
          gap: 12px;
          align-items: center;
        }
        
        .am-button-header {
          padding: 12px 20px;
          background: rgba(255, 255, 255, 0.15);
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 8px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
          white-space: nowrap;
        }
        
        .am-button-header:hover {
          background: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.5);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        
        .am-button-header:active {
          transform: translateY(0);
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
        
        .am-dropdown-wide {
          min-width: 280px;
        }
        
        .am-dropdown-section {
          border-bottom: 1px solid #e0e0e0;
          padding: 8px 0;
        }
        
        .am-dropdown-section:last-child {
          border-bottom: none;
        }
        
        .am-dropdown-label {
          padding: 8px 16px;
          font-size: 12px;
          font-weight: 700;
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.5px;
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
        
        .am-input-filter {
          width: 180px;
          padding: 10px 16px;
          border: 2px solid #e0e0e0;
          border-radius: 8px;
          font-size: 14px;
          transition: all 0.3s;
        }
        
        .am-input-filter:focus {
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
        
        .am-school-select {
          min-width: 250px;
          font-weight: 600;
          color: #2a3c7a;
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
        }
        
        .am-table th {
          padding: 16px;
          text-align: left;
          font-weight: 700;
          font-size: 14px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #ffffff !important; /* CRITICAL: Force white text for contrast */
          text-shadow: 0 1px 2px rgba(0,0,0,0.3); /* Add shadow for extra readability */
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
        
        .am-modal-small {
          max-width: 500px;
        }
        
        .am-modal-large {
          max-width: 900px;
        }
        
        .am-modal-description {
          color: #666;
          margin-bottom: 24px;
          line-height: 1.6;
        }
        
        .am-form-group {
          margin-bottom: 20px;
        }
        
        .am-form-group label {
          display: block;
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
          font-size: 14px;
        }
        
        .am-form-group .am-select {
          width: 100%;
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
        
        .am-button-icon-small.danger {
          background: #dc3545;
          color: white;
          border-color: #dc3545;
        }
        
        .am-button-icon-small.danger:hover {
          background: #c82333;
          transform: scale(1.1);
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
        
        /* ========== Background Job Tracker (Non-blocking) ========== */
        .am-job-tracker {
          position: fixed;
          bottom: 20px;
          right: 20px;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          gap: 12px;
          max-width: 350px;
        }
        
        .am-job-card {
          background: white;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          border-left: 4px solid #079baa;
          animation: am-slideInRight 0.3s ease-out;
        }
        
        @keyframes am-slideInRight {
          from {
            opacity: 0;
            transform: translateX(100px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        
        .am-job-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        
        .am-job-title {
          font-weight: 600;
          color: #2a3c7a;
          font-size: 14px;
        }
        
        .am-job-count {
          background: #e3f2fd;
          color: #1976d2;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
        }
        
        .am-job-progress-bar {
          height: 6px;
          background: #e0e0e0;
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 8px;
        }
        
        .am-job-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #079baa, #00e5db);
          transition: width 0.5s ease;
        }
        
        .am-job-status {
          font-size: 12px;
          color: #666;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
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
          
          .am-header-actions {
            flex-direction: column;
            width: 100%;
            gap: 8px;
          }
          
          .am-button-header {
            width: 100%;
            justify-content: center;
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


