/**
 * VESPA Universal Header System - Enhanced Version 2.0
 * Two-row navigation layout with conditional logic and improved styling
 * Centralized navigation to replace dashboard-specific buttons
 */

(function() {
    'use strict';
    
    // Only show script load message if debug mode is enabled
    if (window.GENERAL_HEADER_CONFIG && window.GENERAL_HEADER_CONFIG.debugMode) {
        console.log('[General Header] Script loaded, waiting for initialization...');
    }
    
    function initializeGeneralHeader() {
        const config = window.GENERAL_HEADER_CONFIG;
        
        if (!config) {
            console.error('[General Header] Configuration not found');
            return;
        }
        
        // Configuration
        const DEBUG = config.debugMode || false; // Use config debug mode
        const currentScene = config.sceneKey;
        const currentView = config.viewKey;
        const userRoles = config.userRoles || [];
        const userAttributes = config.userAttributes || {};
        
        // Track the last scene for cleanup purposes
        let lastScene = null;
        
        // Helper function for debug logging
        function log(message, data) {
            if (DEBUG) {
                console.log(`[General Header] ${message}`, data || '');
            }
        }
        
        // Helper function for warning logging
        function logWarn(message, data) {
            if (DEBUG) {
                console.warn(`[General Header] ${message}`, data || '');
            }
        }
        
        log('Initializing with config:', config);
        
        // Check visibility preferences for conditional display
        function getVisibilityPreferences() {
            const preferences = {
                showAcademicProfile: true,
                showProductivityHub: true
            };
            
            // Check field_3646 for Academic Profile visibility
            const academicProfileValue = userAttributes.values?.field_3646;
            if (academicProfileValue !== undefined) {
                preferences.showAcademicProfile = academicProfileValue !== false;
            }
            
            // Check field_3647 for Productivity Hub visibility
            const productivityHubValue = userAttributes.values?.field_3647;
            if (productivityHubValue !== undefined) {
                preferences.showProductivityHub = productivityHubValue !== false;
            }
            
            log('Visibility preferences:', preferences);
            return preferences;
        }
        
        // Detect user type
        // Helper function to determine available roles for super users
        function determineAvailableRoles(hasStaffAdminRole, hasStaffRole, hasStudentRole, isResourceOnly) {
            const roles = [];
            
            // Always add Super User option
            roles.push({
                id: 'superUser',
                label: 'Super User',
                description: 'Full administrative access',
                available: true
            });
            
            // Add Staff Admin options if available
            if (hasStaffAdminRole) {
                if (isResourceOnly) {
                    roles.push({
                        id: 'staffAdminResource',
                        label: 'Staff Admin (Resources)',
                        description: 'Administrative access to resources',
                        available: true
                    });
                } else {
                    roles.push({
                        id: 'staffAdminCoaching',
                        label: 'Staff Admin (Coaching)',
                        description: 'Administrative access to coaching tools',
                        available: true
                    });
                }
            }
            
            // Add Teaching Staff options if available
            if (hasStaffRole) {
                if (isResourceOnly) {
                    roles.push({
                        id: 'staffResource',
                        label: 'Teaching Staff (Resources)',
                        description: 'Access to teaching resources',
                        available: true
                    });
                } else {
                    roles.push({
                        id: 'staffCoaching',
                        label: 'Teaching Staff (Coaching)',
                        description: 'Access to coaching and student management',
                        available: true
                    });
                }
            }
            
            // Add Student option if available
            if (hasStudentRole) {
                roles.push({
                    id: 'student',
                    label: 'Student',
                    description: 'Student learning interface',
                    available: true
                });
            }
            
            return roles;
        }
        
        // Function to show role selection modal
        function showRoleSelectionModal(availableRoles) {
            return new Promise((resolve) => {
                // Check if modal already exists
                if (document.getElementById('roleSelectionModal')) {
                    log('DEBUG - Modal already exists, not creating another');
                    return;
                }
                
                // Create modal HTML
                const modalHTML = `
                    <div id="roleSelectionModal" class="role-selection-modal-overlay">
                        <div class="role-selection-modal">
                            <div class="modal-header">
                                <h2><i class="fa fa-user-circle"></i> Choose Your Login Mode</h2>
                                <p>You have multiple roles available. Please select how you'd like to access VESPA:</p>
                            </div>
                            <div class="modal-body">
                                <div class="role-options">
                                    ${availableRoles.map(role => `
                                        <button class="role-option ${role.available ? 'available' : 'unavailable'}" 
                                                data-role="${role.id}" 
                                                ${!role.available ? 'disabled' : ''}>
                                            <div class="role-icon">
                                                <i class="fa ${getRoleIcon(role.id)}"></i>
                                            </div>
                                            <div class="role-content">
                                                <h3>${role.label}</h3>
                                                <p>${role.description}</p>
                                            </div>
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                            <div class="modal-footer">
                                <p class="session-note">
                                    <i class="fa fa-info-circle"></i>
                                    Your selection will be remembered for this session. You can change it by logging out and logging back in.
                                </p>
                            </div>
                        </div>
                    </div>
                `;
                
                // Add modal styles
                const modalStyles = `
                    <style id="roleSelectionModalStyles">
                        .role-selection-modal-overlay {
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            background: rgba(0, 0, 0, 0.8);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            z-index: 10000;
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                        }
                        
                        .role-selection-modal {
                            background: white;
                            border-radius: 16px;
                            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                            max-width: 600px;
                            width: 90%;
                            max-height: 90vh;
                            overflow-y: auto;
                        }
                        
                        .modal-header {
                            padding: 30px 30px 20px;
                            text-align: center;
                            border-bottom: 1px solid #e0e0e0;
                        }
                        
                        .modal-header h2 {
                            color: #2a3c7a;
                            font-size: 1.8rem;
                            font-weight: 700;
                            margin: 0 0 15px 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 12px;
                        }
                        
                        .modal-header h2 i {
                            color: #079baa;
                            font-size: 1.6rem;
                        }
                        
                        .modal-header p {
                            color: #5899a8;
                            font-size: 1.1rem;
                            margin: 0;
                            line-height: 1.5;
                        }
                        
                        .modal-body {
                            padding: 30px;
                        }
                        
                        .role-options {
                            display: grid;
                            gap: 15px;
                        }
                        
                        .role-option {
                            display: flex;
                            align-items: center;
                            gap: 20px;
                            padding: 20px;
                            border: 2px solid #e0e0e0;
                            border-radius: 12px;
                            background: white;
                            cursor: pointer;
                            transition: all 0.3s ease;
                            text-align: left;
                            width: 100%;
                        }
                        
                        .role-option.available:hover {
                            border-color: #079baa;
                            background: #f0fdfe;
                            transform: translateY(-2px);
                            box-shadow: 0 4px 12px rgba(7, 155, 170, 0.2);
                        }
                        
                        .role-option.unavailable {
                            opacity: 0.5;
                            cursor: not-allowed;
                            background: #f5f5f5;
                        }
                        
                        .role-icon {
                            flex-shrink: 0;
                            width: 50px;
                            height: 50px;
                            border-radius: 10px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            font-size: 20px;
                            color: white;
                            background: linear-gradient(135deg, #2a3c7a 0%, #079baa 100%);
                        }
                        
                        .role-option.unavailable .role-icon {
                            background: #ccc;
                        }
                        
                        .role-content h3 {
                            color: #2a3c7a;
                            font-size: 1.2rem;
                            font-weight: 600;
                            margin: 0 0 5px 0;
                        }
                        
                        .role-content p {
                            color: #5899a8;
                            font-size: 0.95rem;
                            margin: 0;
                            line-height: 1.4;
                        }
                        
                        .role-option.unavailable .role-content h3,
                        .role-option.unavailable .role-content p {
                            color: #999;
                        }
                        
                        .modal-footer {
                            padding: 20px 30px 30px;
                            text-align: center;
                            border-top: 1px solid #e0e0e0;
                        }
                        
                        .session-note {
                            color: #5899a8;
                            font-size: 0.9rem;
                            margin: 0;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                        }
                        
                        .session-note i {
                            color: #079baa;
                        }
                        
                        @media (max-width: 768px) {
                            .role-selection-modal {
                                margin: 20px;
                                width: calc(100% - 40px);
                            }
                            
                            .modal-header {
                                padding: 25px 20px 15px;
                            }
                            
                            .modal-header h2 {
                                font-size: 1.5rem;
                                flex-direction: column;
                                gap: 8px;
                            }
                            
                            .modal-body {
                                padding: 20px;
                            }
                            
                            .role-option {
                                padding: 15px;
                                gap: 15px;
                            }
                            
                            .role-icon {
                                width: 40px;
                                height: 40px;
                                font-size: 16px;
                            }
                            
                            .role-content h3 {
                                font-size: 1.1rem;
                            }
                            
                            .role-content p {
                                font-size: 0.9rem;
                            }
                        }
                    </style>
                `;
                
                // Inject styles and modal
                document.head.insertAdjacentHTML('beforeend', modalStyles);
                document.body.insertAdjacentHTML('beforeend', modalHTML);
                
                // Add small delay to ensure modal is fully rendered
                setTimeout(() => {
                    // Add click handlers
                    const modal = document.getElementById('roleSelectionModal');
                    const roleButtons = modal.querySelectorAll('.role-option.available');
                
                    log('DEBUG - Found role buttons:', roleButtons.length);
                    
                    roleButtons.forEach((button, index) => {
                        log('DEBUG - Setting up button', index, button.getAttribute('data-role'));
                        
                        // Add multiple event types to ensure click is captured
                        const handleClick = (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            const selectedRole = button.getAttribute('data-role');
                            log('DEBUG - Button clicked, selected role:', selectedRole);
                            
                            // Clean up
                            modal.remove();
                            document.getElementById('roleSelectionModalStyles')?.remove();
                            
                            // Reset modal flag
                            window._roleModalShowing = false;
                            
                            resolve(selectedRole);
                        };
                        
                        button.addEventListener('click', handleClick);
                        button.addEventListener('mousedown', handleClick);
                        button.addEventListener('touchstart', handleClick);
                        
                        // Also add a direct onclick for backup
                        button.onclick = handleClick;
                    });
                    
                    // Prevent modal from closing when clicking outside
                    modal.addEventListener('click', (e) => {
                        if (e.target === modal) {
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    });
                }, 100); // Small delay to ensure DOM is ready
            });
        }
        
        // Helper function to get role icons
        function getRoleIcon(roleId) {
            const iconMap = {
                'superUser': 'fa-shield',
                'staffAdminResource': 'fa-cog',
                'staffAdminCoaching': 'fa-tachometer-alt',
                'staffResource': 'fa-book',
                'staffCoaching': 'fa-users',
                'student': 'fa-graduation-cap'
            };
            return iconMap[roleId] || 'fa-user';
        }

        function getUserType() {
            log('User attributes:', userAttributes);
            
            // SPECIAL CHECK: If we're in student emulator mode, always return 'student'
            // Check URL parameter or special marker
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('student_emulator') === 'true' || 
                window.location.hash.includes('student_emulator=true')) {
                log('Student emulator mode detected via URL parameter - forcing student view');
                // Store emulator mode in a variable we can check later
                window._isStudentEmulatorMode = true;
                return 'student';
            }
            
            // Not in emulator mode
            window._isStudentEmulatorMode = false;
            
            // Check if user is logged in at all
            if (!userAttributes || (!userAttributes.email && !userAttributes.id)) {
                log('No user attributes found - user might not be logged in');
                return null; // Don't show header if not logged in
            }
            
            // Get the user role from field_73
            let userRole = userAttributes.values?.field_73 || userAttributes.field_73;
            log('User role from field_73:', userRole);
            
            // If no role found, user might not be logged in properly
            if (!userRole) {
                log('No role found in field_73');
                return null;
            }
            
            // Handle different field formats
            let roleText = '';
            
            // If it's an array (like ['profile_6']), get the first element
            if (Array.isArray(userRole) && userRole.length > 0) {
                userRole = userRole[0];
            }
            
            // Check if we have raw field data
            const rawRole = userAttributes.values?.field_73_raw || userAttributes.field_73_raw;
            if (rawRole && rawRole.length > 0) {
                // Try to get the identifier from raw data
                const roleIdentifier = rawRole[0]?.identifier || rawRole[0];
                log('Role identifier from raw:', roleIdentifier);
                roleText = roleIdentifier;
            } else {
                roleText = userRole.toString();
            }
            
            // Profile mapping - map profile IDs to user types (both profile_XX and object_XX formats)
            const profileMapping = {
                'profile_6': 'student',      // Student profile
                'profile_7': 'staff',        // Tutor profile
                'profile_5': 'staffAdmin',   // Staff Admin profile
                'profile_4': 'student',      // Alternative student profile
                'profile_21': 'superUser',   // Super User profile
                'object_6': 'student',       // Student profile (object format)
                'object_7': 'staff',         // Tutor profile (object format)
                'object_5': 'staffAdmin',    // Staff Admin profile (object format)
                'object_4': 'student',       // Alternative student profile (object format)
                'object_21': 'superUser',    // Super User profile (object format)
                // Add more mappings as needed
            };
            
            // Check ALL roles if it's an array (staff might have multiple roles including student)
            let hasStaffRole = false;
            let hasStudentRole = false;
            let hasStaffAdminRole = false;
            let hasSuperUserRole = false;
            
            log('DEBUG - Raw field_73:', userAttributes.values?.field_73);
            log('DEBUG - Raw profile_keys:', userAttributes.values?.profile_keys);
            log('DEBUG - Profile mapping check for profile_21:', profileMapping['profile_21']);
            log('DEBUG - Profile mapping check for object_21:', profileMapping['object_21']);
            
            // Check both field_73 and profile_keys
            const field73Roles = userAttributes.values?.field_73 ? (Array.isArray(userAttributes.values.field_73) ? userAttributes.values.field_73 : [userAttributes.values.field_73]) : [];
            const profileKeys = userAttributes.values?.profile_keys ? (Array.isArray(userAttributes.values.profile_keys) ? userAttributes.values.profile_keys : [userAttributes.values.profile_keys]) : [];
            const allRoles = [...field73Roles, ...profileKeys];
            
            log('Checking all roles (field_73 + profile_keys):', allRoles);
            
            // If we have roles to check
            if (allRoles.length > 0) {
                
                for (const role of allRoles) {
                    const roleStr = role.toString();
                    log('DEBUG - Checking role:', roleStr, 'maps to:', profileMapping[roleStr]);
                    
                    if (profileMapping[roleStr] === 'staff') {
                        hasStaffRole = true;
                    } else if (profileMapping[roleStr] === 'student') {
                        hasStudentRole = true;
                    } else if (profileMapping[roleStr] === 'staffAdmin') {
                        hasStaffAdminRole = true;
                    } else if (profileMapping[roleStr] === 'superUser') {
                        log('DEBUG - Found super user role!');
                        hasSuperUserRole = true;
                    }
                }
            }
            
            // Get account type from field_441
            const accountType = userAttributes.values?.field_441 || userAttributes.field_441;
            log('Account type field_441:', accountType);
            
            // Check if account type contains "RESOURCE" (case-insensitive)
            const isResourceOnly = accountType && accountType.toString().toUpperCase().includes('RESOURCE');
            
            log('DEBUG - Final role detection results:', {
                hasStaffRole,
                hasStudentRole,
                hasStaffAdminRole,
                hasSuperUserRole,
                accountType,
                isResourceOnly
            });
            
            // PRIORITY: Super User gets role selection modal, then Staff Admin, then regular staff, then student
            if (hasSuperUserRole) {
                log('DEBUG - Super user role detected!');
                log('User has super user role - checking for role selection');
                
                // Check if user has already selected a role in this session
                const selectedRole = sessionStorage.getItem('selectedUserRole');
                log('DEBUG - Selected role from session:', selectedRole);
                
                if (selectedRole) {
                    log('Using previously selected role:', selectedRole);
                    return selectedRole;
                }
                
                // Prevent multiple modals
                if (window._roleModalShowing) {
                    log('DEBUG - Role modal already showing, returning superUser');
                    return 'superUser';
                }
                window._roleModalShowing = true;
                
                // Show role selection modal and return based on available roles
                const availableRoles = determineAvailableRoles(hasStaffAdminRole, hasStaffRole, hasStudentRole, isResourceOnly);
                
                // Show modal immediately and return temporary role
                setTimeout(() => {
                    showRoleSelectionModal(availableRoles).then(chosenRole => {
                        if (chosenRole) {
                            sessionStorage.setItem('selectedUserRole', chosenRole);
                            
                            // Clean up any existing modals before reload
                            const existingModal = document.getElementById('roleSelectionModal');
                            if (existingModal) {
                                existingModal.remove();
                            }
                            const existingStyles = document.getElementById('roleSelectionModalStyles');
                            if (existingStyles) {
                                existingStyles.remove();
                            }
                            
                            // Reload the page to apply the new role
                            window.location.reload();
                        }
                    });
                }, 100);
                
                // Return super user as default while modal is shown
                return 'superUser';
            } else if (hasStaffAdminRole) {
                log('User has staff admin role');
                if (isResourceOnly) {
                    log('Detected as staffAdminResource');
                    return 'staffAdminResource';
                }
                log('Detected as staffAdminCoaching');
                return 'staffAdminCoaching';
            } else if (hasStaffRole) {
                log('User has staff role');
                if (isResourceOnly) {
                    log('Detected as staffResource');
                    return 'staffResource';
                }
                log('Detected as staffCoaching');
                return 'staffCoaching';
            } else if (hasStudentRole) {
                log('User has ONLY student role');
                return 'student';
            }
            
            // Fallback to text comparison if we have actual role text
            if (roleText.toLowerCase() === 'student') {
                log('Detected as student');
                return 'student';
            } else if (roleText.toLowerCase().includes('admin')) {
                log('Detected as staff admin via text');
                if (isResourceOnly) {
                    return 'staffAdminResource';
                }
                return 'staffAdminCoaching';
            } else if (roleText.toLowerCase().includes('staff') || roleText.toLowerCase().includes('tutor') || 
                      roleText.toLowerCase().includes('super')) {
                log(`Detected as staff with role: ${roleText}`);
                if (isResourceOnly) {
                    return 'staffResource';
                }
                return 'staffCoaching';
            }
            
            // Default based on which landing page they can access
            log('Could not determine role from field_73, checking current page');
            const currentUrl = window.location.href;
            if (currentUrl.includes('landing-page') && !currentUrl.includes('staff-landing-page')) {
                log('On student landing page, assuming student');
                return 'student';
            }
            
            log('Defaulting to staff');
            return 'staffCoaching';
        }
        
        // Build productivity hub buttons for students (conditional)
        function getProductivityButtons(showProductivityHub) {
            if (!showProductivityHub) {
                return [];
            }
            
            return [
                { label: 'Study Planner', icon: 'fa-calendar', href: '#studyplanner', scene: 'scene_1208' },
                { label: 'Flashcards', icon: 'fa-clone', href: '#flashcards', scene: 'scene_1206' },
                { label: 'Taskboard', icon: 'fa-clipboard-list', href: '#task-board', scene: 'scene_1188' }
            ];
        }
        
        // ENHANCED Navigation configurations with 2-row layout
        const navigationConfig = {
            student: {
                brand: 'VESPA Student',
                brandIcon: 'fa-graduation-cap',
                color: '#079baa', // Main teal - bright and welcoming for students
                accentColor: '#06206e', // Dark blue for accents
                primaryRow: [
                    { label: 'Home', icon: 'fa-home', href: '#landing-page/', scene: 'scene_1210' },
                    { label: 'VESPA Questionnaire', icon: 'fa-question-circle', href: '#add-q', scene: 'scene_358' },
                    { label: 'Coaching Report', icon: 'fa-comments', href: '#vespa-results', scene: 'scene_43' },
                    { label: 'My Activities', icon: 'fa-book', href: '#my-vespa-activities', scene: 'scene_1258' }
                ],
                secondaryRow: [], // Will be filled conditionally with productivity buttons
                utilityButtons: [
                    { label: 'Settings', icon: 'fa-cog', href: '#account-settings', scene: 'scene_2', isSettings: true },
                    { label: 'Log Out', icon: 'fa-sign-out', href: '#', scene: 'logout', isLogout: true }
                ]
            },
            staffResource: {
                brand: 'VESPA Resources',
                brandIcon: 'fa-book',
                color: '#5899a8', // Muted blue-green - professional yet approachable
                accentColor: '#06206e',
                primaryRow: [
                    { label: 'Home', icon: 'fa-home', href: '#resources-homepage/', scene: 'scene_1278' }, // Using correct Knack slug
                    { label: 'Resources', icon: 'fa-folder-open', href: '#tutor-activities/resources-levels/', scene: 'scene_481' },
                    { label: 'Worksheets', icon: 'fa-files-o', href: '#worksheets/', scene: 'scene_1169' },
                    { label: 'Curriculum', icon: 'fa-calendar', href: '#suggested-curriculum2/', scene: 'scene_1234' }
                ],
                secondaryRow: [
                    { label: 'Newsletter', icon: 'fa-newspaper-o', href: '#vespa-newsletter/', scene: 'scene_1214' },
                    { label: 'Videos', icon: 'fa-book-open', href: '#vespa-videos/', scene: 'scene_1266' }
                ],
                utilityButtons: [
                    { label: 'Settings', icon: 'fa-cog', href: '#account-settings/', scene: 'scene_2', isSettings: true },
                    { label: 'Log Out', icon: 'fa-sign-out', href: '#', scene: 'logout', isLogout: true }
                ]
            },
            staffCoaching: {
                brand: 'VESPA Coaching',
                brandIcon: 'fa-users',
                color: '#2f8dcb', // Bright blue - energetic and engaging for coaching
                accentColor: '#06206e',
                primaryRow: [
                    { label: 'Home', icon: 'fa-home', href: '#staff-landing-page/', scene: 'scene_1215' },
                    { label: 'Coaching', icon: 'fa-comments', href: '#mygroup-vespa-results2/', scene: 'scene_1095' },
                    { label: 'Results', icon: 'fa-bar-chart', href: '#vesparesults', scene: 'scene_1270' },
                    { label: 'Activities', icon: 'fa-book', href: '#activity-manage', scene: 'scene_1256' },
                    { label: 'Study Plans', icon: 'fa-graduation-cap', href: '#student-revision', scene: 'scene_855' }
                ],
                secondaryRow: [
                    { label: 'Resources', icon: 'fa-folder-open', href: '#tutor-activities/resources-levels', scene: 'scene_481' },
                    { label: 'Worksheets', icon: 'fa-files-o', href: '#worksheets', scene: 'scene_1169' },
                    { label: 'Videos', icon: 'fa-book-open', href: '#vespa-videos', scene: 'scene_1266' },
                    { label: 'Curriculum', icon: 'fa-calendar', href: '#suggested-curriculum2/', scene: 'scene_1234' }

                ],
                utilityButtons: [
                    { label: 'Refresh', icon: 'fa-sync-alt', href: '#', scene: 'refresh', isRefresh: true },
                    { label: 'Settings', icon: 'fa-cog', href: '#account-settings', scene: 'scene_2', isSettings: true },
                    { label: 'Log Out', icon: 'fa-sign-out', href: '#', scene: 'logout', isLogout: true }
                ]
            },
            staffAdminResource: {
                brand: 'VESPA Admin',
                brandIcon: 'fa-shield',
                color: '#2a3c7a', // Dark blue - authoritative and professional for admins
                accentColor: '#06206e',
                primaryRow: [
                    { label: 'Home', icon: 'fa-home', href: '#resources-homepage/', scene: 'scene_1278' }, // Using correct Knack slug
                    { label: 'Manage', icon: 'fa-users-cog', href: '#resource-staff-management/', scene: 'scene_1272', isManagement: true },
                    { label: 'Resources', icon: 'fa-folder-open', href: '#tutor-activities/resources-levels/', scene: 'scene_481' },
                    { label: 'Worksheets', icon: 'fa-files-o', href: '#worksheets/', scene: 'scene_1169' }
                ],
                secondaryRow: [
                    { label: 'Curriculum', icon: 'fa-calendar', href: '#suggested-curriculum2/', scene: 'scene_1234' },
                    { label: 'Newsletter', icon: 'fa-newspaper-o', href: '#vespa-newsletter/', scene: 'scene_1214' },
                    { label: 'Videos', icon: 'fa-book-open', href: '#vespa-videos/', scene: 'scene_1266' }
                ],
                utilityButtons: [
                    { label: 'Settings', icon: 'fa-cog', href: '#account-settings/', scene: 'scene_2', isSettings: true },
                    { label: 'Log Out', icon: 'fa-sign-out', href: '#', scene: 'logout', isLogout: true }
                ]
            },
            staffAdminCoaching: {
                brand: 'VESPA Admin',
                brandIcon: 'fa-shield',
                color: '#2a3c7a', // Dark blue - authoritative and professional for admins
                accentColor: '#06206e',
                primaryRow: [
                    { label: 'Home', icon: 'fa-home', href: '#staff-landing-page/', scene: 'scene_1215' },
                    { label: 'Manage', icon: 'fa-cog', href: '#upload-manager', scene: 'scene_1212', isManagement: true },
                    { label: 'Coaching', icon: 'fa-comments', href: '#admin-coaching', scene: 'scene_1014', isManagement: true },
                    { label: 'Print Reports', icon: 'fa-print', href: '#report-printing', scene: 'scene_1227', isManagement: true },
                    { label: 'Dashboard', icon: 'fa-tachometer-alt', href: '#dashboard', scene: 'scene_1225', isManagement: true },
                    { label: 'Curriculum', icon: 'fa-calendar', href: '#suggested-curriculum2', scene: 'scene_1234', isManagement: true },
                ],
                secondaryRow: [
                    { label: 'Results', icon: 'fa-bar-chart', href: '#vesparesults', scene: 'scene_1270' },
                    { label: 'Resources', icon: 'fa-folder-open', href: '#tutor-activities/resources-levels/', scene: 'scene_481' },
                    { label: 'Worksheets', icon: 'fa-files-o', href: '#worksheets', scene: 'scene_1169' },
                    { label: 'Videos', icon: 'fa-book-open', href: '#vespa-videos/', scene: 'scene_1266' },
                    { label: 'Newsletter', icon: 'fa-newspaper-o', href: '#vespa-newsletter/', scene: 'scene_1214' },
                ],
                utilityButtons: [
                    { label: 'Refresh', icon: 'fa-sync-alt', href: '#', scene: 'refresh', isRefresh: true },
                    { label: 'Settings', icon: 'fa-cog', href: '#account-settings', scene: 'scene_2', isSettings: true },
                    { label: 'Log Out', icon: 'fa-sign-out', href: '#', scene: 'logout', isLogout: true }
                ]
            },
            superUser: {
                brand: 'VESPA Super User',
                brandIcon: 'fa-shield',
                color: '#2a3c7a', // Dark blue - authoritative and professional for super users
                accentColor: '#079baa', // Teal accent
                primaryRow: [
                    { label: 'Home', icon: 'fa-home', href: '#oversight-page/', scene: 'scene_1268' },
                    { label: 'Upload Manager', icon: 'fa-upload', href: '#upload-manager', scene: 'scene_1212', isManagement: true },
                    { label: 'Dashboard', icon: 'fa-tachometer-alt', href: '#dashboard', scene: 'scene_1225', isManagement: true },
                    { label: 'CRM', icon: 'fa-users', href: '#vespa-customers/', scene: 'scene_1226', isManagement: true }
                ],
                secondaryRow: [
                    { label: 'Reports', icon: 'fa-print', href: '#report-printing', scene: 'scene_1227', isManagement: true }
                ],
                utilityButtons: [
                    { label: 'Refresh', icon: 'fa-sync-alt', href: '#', scene: 'refresh', isRefresh: true },
                    { label: 'Settings', icon: 'fa-cog', href: '#account-settings', scene: 'scene_2', isSettings: true },
                    { label: 'Log Out', icon: 'fa-sign-out', href: '#', scene: 'logout', isLogout: true }
                ]
            }
        };
        
        // Create the enhanced header HTML with 2-row layout
        function createHeaderHTML(userType, currentScene) {
            const navConfig = navigationConfig[userType];
            const visibilityPrefs = getVisibilityPreferences();
            
            log(`Creating enhanced header for userType: ${userType}`, visibilityPrefs);
            
            // Add productivity buttons for students if enabled
            if (userType === 'student') {
                navConfig.secondaryRow = getProductivityButtons(visibilityPrefs.showProductivityHub);
            }
            
            // Determine home page based on user type
            let homeHref, homeScene;
            if (userType === 'student') {
                homeHref = '#landing-page/';
                homeScene = 'scene_1210';
            } else if (userType === 'superUser') {
                homeHref = '#oversight-page/';
                homeScene = 'scene_1268';
            } else {
                homeHref = '#staff-landing-page/';
                homeScene = 'scene_1215';
            }
            const isHomePage = currentScene === homeScene;
            
            // Build primary row navigation items
            const primaryRowHTML = navConfig.primaryRow.map(item => {
                const isActive = currentScene === item.scene;
                let buttonClass = 'header-nav-button primary-button';
                
                if (item.isManagement) buttonClass += ' management-button';
                if (isActive) buttonClass += ' active';
                
                // Check if this is the questionnaire button and if validator is enabled
                let tooltipText = '';
                if (item.scene === 'scene_358' && userType === 'student') {
                    // Check if questionnaireValidator is enabled
                    const validatorEnabled = window.QUESTIONNAIRE_VALIDATOR_CONFIG && 
                                           window.QUESTIONNAIRE_VALIDATOR_CONFIG.enabled !== false;
                    
                    if (validatorEnabled) {
                        tooltipText = 'title="Click to check questionnaire availability"';
                        log('Questionnaire validator is enabled - button will be intercepted');
                    } else {
                        tooltipText = 'title="Click to go to questionnaire page"';
                        log('Questionnaire validator is disabled - normal navigation to scene_358');
                    }
                }
                
                return `
                    <a href="${item.href}" 
                       class="${buttonClass}" 
                       data-scene="${item.scene}"
                       ${tooltipText}>
                        <i class="fa ${item.icon}"></i>
                        <span>${item.label}</span>
                    </a>
                `;
            }).join('');
            
            // Build secondary row navigation items (if any)
            const secondaryRowHTML = navConfig.secondaryRow && navConfig.secondaryRow.length > 0 ? `
                <div class="header-secondary-row">
                    ${navConfig.secondaryRow.map(item => {
                        const isActive = currentScene === item.scene;
                        let buttonClass = 'header-nav-button secondary-button';
                        
                        if (item.isManagement) buttonClass += ' management-button';
                        if (isActive) buttonClass += ' active';
                        
                        return `
                            <a href="${item.href}" 
                               class="${buttonClass}" 
                               data-scene="${item.scene}">
                                <i class="fa ${item.icon}"></i>
                                <span>${item.label}</span>
                            </a>
                        `;
                    }).join('')}
                </div>
            ` : '';
            
            // Build utility buttons
            const utilityButtonsHTML = navConfig.utilityButtons.map(item => {
                let buttonClass = 'header-utility-button';
                
                if (item.isSettings) buttonClass += ' header-settings-button';
                if (item.isLogout) buttonClass += ' header-logout-button';
                if (item.isRefresh) buttonClass += ' header-refresh-button';
                
                // Hide logout button in emulator mode
                if (item.isLogout && window._isStudentEmulatorMode) {
                    return '';
                }
                
                const dataAttrs = item.isLogout ? 'data-logout="true"' : 
                                 item.isRefresh ? 'data-refresh="true"' : '';
                
                return `
                    <a href="${item.href}" 
                       class="${buttonClass}" 
                       data-scene="${item.scene}"
                       ${dataAttrs}>
                        <i class="fa ${item.icon}"></i>
                        <span class="utility-label">${item.label}</span>
                    </a>
                `;
            }).join('');
            
            return `
                <div id="vespaGeneralHeader" class="vespa-general-header-enhanced ${userType}">
                    <div class="header-content">
                        <div class="header-primary-row">
                            <div class="header-brand">
                                <a href="https://www.vespa.academy" target="_blank" class="logo-link">
                                    <img src="https://vespa.academy/_astro/vespalogo.BGrK1ARl.png" alt="VESPA Academy" class="vespa-logo">
                                </a>
                                <span class="brand-text">${navConfig.brand}</span>
                            </div>
                            <nav class="header-navigation primary-nav">
                                ${primaryRowHTML}
                            </nav>
                            <div class="header-utility">
                                ${utilityButtonsHTML}
                            </div>
                            <button class="mobile-menu-toggle" aria-label="Toggle menu">
                                <i class="fa fa-bars"></i>
                            </button>
                        </div>
                        ${secondaryRowHTML}
                    </div>
                    ${!isHomePage ? `
                    <div class="header-breadcrumb">
                        <a href="${homeHref}" class="breadcrumb-back">
                            <i class="fa fa-arrow-left"></i>
                            Back to Home
                        </a>
                    </div>
                    ` : ''}
                </div>
                <div class="mobile-nav-overlay"></div>
                <style>
                    /* Hide entire Knack header */
                    .knHeader {
                        display: none !important;
                    }
                    
                    /* Hide original user info container */
                    body.has-general-header-enhanced .kn-info,
                    body.has-general-header-enhanced .kn-current_user {
                        display: none !important;
                        visibility: hidden !important;
                    }
                    
                    /* Enhanced Header Base Styles with Solid Background */
                    .vespa-general-header-enhanced {
                        position: fixed;
                        top: 0 !important;
                        left: 0;
                        right: 0;
                        background: linear-gradient(135deg, ${navConfig.color} 0%, ${navConfig.accentColor || navConfig.color} 100%);
                        background-color: ${navConfig.color}; /* Fallback solid color */
                        color: white;
                        z-index: 9999;
                        box-shadow: 0 4px 20px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        backdrop-filter: blur(10px);
                        -webkit-backdrop-filter: blur(10px);
                    }
                    
                    .header-content {
                        max-width: 1920px;
                        margin: 0 auto;
                        padding: 0 24px;
                    }
                    
                    /* Primary Row with Consistent Height */
                    .header-primary-row {
                        height: 72px;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 24px;
                        border-bottom: 1px solid rgba(255,255,255,0.12);
                        position: relative;
                    }
                    
                    /* Brand Section Enhanced */
                    .header-brand {
                        display: flex;
                        align-items: center;
                        gap: 14px;
                        flex-shrink: 0;
                        min-width: 200px;
                    }
                    
                    .brand-text {
                        font-size: clamp(18px, 1.4vw, 22px);
                        font-weight: 700;
                        letter-spacing: -0.3px;
                        white-space: nowrap;
                        text-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    }
                    
                    .logo-link {
                        display: flex;
                        align-items: center;
                        text-decoration: none;
                        transition: all 0.3s ease;
                        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
                    }
                    
                    .logo-link:hover {
                        transform: scale(1.05);
                        filter: drop-shadow(0 4px 8px rgba(0,0,0,0.15));
                    }
                    
                    .vespa-logo {
                        height: 48px;
                        width: auto;
                    }
                    
                    /* Primary Navigation with CSS Grid for Equal Sizing */
                    .header-navigation.primary-nav {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
                        gap: 10px;
                        align-items: center;
                        flex: 1;
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                    
                    /* Enhanced Button Styles with Better Contrast and Dynamic Font */
                    .header-nav-button {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        padding: 12px 16px;
                        background: rgba(255,255,255,0.22);
                        backdrop-filter: blur(12px) saturate(1.2);
                        -webkit-backdrop-filter: blur(12px) saturate(1.2);
                        color: white;
                        text-decoration: none;
                        border-radius: 10px;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: clamp(14px, 1.1vw, 16px);
                        font-weight: 600;
                        white-space: nowrap;
                        border: 2px solid rgba(255,255,255,0.35);
                        position: relative;
                        overflow: hidden;
                        min-height: 48px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15), 
                                    0 1px 3px rgba(0,0,0,0.1),
                                    inset 0 1px 0 rgba(255,255,255,0.2);
                        text-align: center;
                        text-shadow: 0 1px 2px rgba(0,0,0,0.2);
                        letter-spacing: 0.3px;
                    }
                    
                    /* Hover Effect with Stronger Contrast */
                    .header-nav-button::before {
                        content: '';
                        position: absolute;
                        top: 0;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        background: linear-gradient(135deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.15) 100%);
                        opacity: 0;
                        transition: opacity 0.3s ease;
                    }
                    
                    .header-nav-button:hover {
                        background: rgba(255,255,255,0.32);
                        transform: translateY(-2px);
                        box-shadow: 0 8px 24px rgba(0,0,0,0.2), 
                                    0 4px 8px rgba(0,0,0,0.15),
                                    inset 0 2px 4px rgba(255,255,255,0.25);
                        border-color: rgba(255,255,255,0.45);
                    }
                    
                    .header-nav-button:hover::before {
                        opacity: 1;
                    }
                    
                    .header-nav-button.active {
                        background: linear-gradient(135deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.28) 100%);
                        box-shadow: 0 6px 20px rgba(0,0,0,0.18), 
                                    0 2px 6px rgba(0,0,0,0.12),
                                    inset 0 2px 4px rgba(255,255,255,0.35);
                        border-color: rgba(255,255,255,0.5);
                        font-weight: 700;
                        text-shadow: 0 1px 3px rgba(0,0,0,0.25);
                    }
                    
                    .header-nav-button.active::after {
                        content: '';
                        position: absolute;
                        bottom: -1px;
                        left: 10%;
                        right: 10%;
                        height: 3px;
                        background: linear-gradient(90deg, transparent 0%, white 50%, transparent 100%);
                        box-shadow: 0 0 8px rgba(255,255,255,0.6);
                    }
                    
                    .header-nav-button i {
                        font-size: clamp(18px, 1.4vw, 22px);
                        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.1));
                    }
                    
                    .header-nav-button span {
                        font-size: clamp(14px, 1.1vw, 16px);
                        letter-spacing: 0.4px;
                        font-weight: 600;
                    }
                    
                    /* Management Button with High Contrast Styling */
                    .header-nav-button.management-button {
                        background: linear-gradient(135deg, rgba(255,215,0,0.35) 0%, rgba(255,193,7,0.25) 100%);
                        border-color: rgba(255,215,0,0.5);
                        font-weight: 700;
                        box-shadow: 0 4px 14px rgba(255,193,7,0.25),
                                    0 2px 6px rgba(0,0,0,0.15),
                                    inset 0 1px 0 rgba(255,255,255,0.3);
                        text-shadow: 0 1px 3px rgba(0,0,0,0.3);
                    }
                    
                    .header-nav-button.management-button::before {
                        background: linear-gradient(135deg, rgba(255,215,0,0) 0%, rgba(255,215,0,0.2) 100%);
                    }
                    
                    .header-nav-button.management-button:hover {
                        background: linear-gradient(135deg, rgba(255,215,0,0.45) 0%, rgba(255,193,7,0.35) 100%);
                        box-shadow: 0 8px 28px rgba(255,193,7,0.35), 
                                    0 4px 10px rgba(0,0,0,0.2),
                                    inset 0 2px 6px rgba(255,255,255,0.35);
                        border-color: rgba(255,215,0,0.6);
                        transform: translateY(-2px) scale(1.02);
                    }
                    
                    .header-nav-button.management-button.active {
                        background: linear-gradient(135deg, rgba(255,215,0,0.5) 0%, rgba(255,193,7,0.4) 100%);
                        box-shadow: 0 6px 24px rgba(255,193,7,0.4), 
                                    0 3px 8px rgba(0,0,0,0.2),
                                    inset 0 2px 8px rgba(255,255,255,0.4);
                        border-color: rgba(255,215,0,0.65);
                    }
                    
                    /* Secondary Row with Equal Heights */
                    .header-secondary-row {
                        height: 52px;
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
                        gap: 8px;
                        padding: 8px 0;
                        align-items: center;
                        background: linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.04) 100%);
                        border-bottom: 1px solid rgba(255,255,255,0.08);
                    }
                    
                    .header-nav-button.secondary-button {
                        padding: 10px 14px;
                        font-size: clamp(13px, 1vw, 15px);
                        min-height: 40px;
                        background: rgba(255,255,255,0.18);
                        border-color: rgba(255,255,255,0.3);
                        border-width: 1.5px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.12),
                                    inset 0 1px 0 rgba(255,255,255,0.15);
                        text-shadow: 0 1px 2px rgba(0,0,0,0.15);
                        letter-spacing: 0.3px;
                    }
                    
                    .header-nav-button.secondary-button i {
                        font-size: clamp(16px, 1.2vw, 18px);
                    }
                    
                    .header-nav-button.secondary-button span {
                        font-size: clamp(13px, 1vw, 15px);
                    }
                    
                    .header-nav-button.secondary-button:hover {
                        background: rgba(255,255,255,0.26);
                        box-shadow: 0 6px 16px rgba(0,0,0,0.15),
                                    inset 0 1px 2px rgba(255,255,255,0.2);
                        border-color: rgba(255,255,255,0.4);
                    }
                    
                    .header-nav-button.secondary-button.active {
                        background: rgba(255,255,255,0.32);
                        border-color: rgba(255,255,255,0.45);
                        box-shadow: 0 4px 14px rgba(0,0,0,0.15),
                                    inset 0 1px 3px rgba(255,255,255,0.25);
                    }
                    
                    /* Utility Buttons Section */
                    .header-utility {
                        display: flex;
                        gap: 10px;
                        align-items: center;
                        flex-shrink: 0;
                        flex-wrap: nowrap;
                    }
                    

                    .header-utility-button {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        padding: 10px 16px;
                        background: linear-gradient(135deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.25) 100%);
                        backdrop-filter: blur(8px) saturate(1.2);
                        -webkit-backdrop-filter: blur(8px) saturate(1.2);
                        color: white;
                        text-decoration: none;
                        border-radius: 10px;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        font-size: clamp(13px, 1vw, 15px);
                        font-weight: 600;
                        letter-spacing: 0.3px;
                        border: 2px solid rgba(255,255,255,0.25);
                        min-height: 42px;
                        box-shadow: 0 3px 10px rgba(0,0,0,0.2),
                                    inset 0 1px 0 rgba(255,255,255,0.1);
                        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                    }
                    
                    .header-utility-button:hover {
                        background: linear-gradient(135deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.35) 100%);
                        border-color: rgba(255,255,255,0.35);
                        transform: translateY(-1px);
                        box-shadow: 0 6px 16px rgba(0,0,0,0.25),
                                    inset 0 1px 2px rgba(255,255,255,0.15);
                    }
                    
                    .header-utility-button i {
                        font-size: clamp(16px, 1.2vw, 18px);
                        filter: drop-shadow(0 1px 1px rgba(0,0,0,0.2));
                    }
                    
                    .header-utility-button .utility-label {
                        font-size: clamp(13px, 1vw, 15px);
                    }
                    
                    /* Special Refresh Button Styling */
                    .header-refresh-button {
                        background: linear-gradient(135deg, rgba(7,155,170,0.35) 0%, rgba(7,155,170,0.25) 100%);
                        border-color: rgba(255,255,255,0.35);
                        box-shadow: 0 3px 10px rgba(7,155,170,0.3),
                                    inset 0 1px 0 rgba(255,255,255,0.15);
                    }
                    
                    .header-refresh-button:hover {
                        background: linear-gradient(135deg, rgba(7,155,170,0.45) 0%, rgba(7,155,170,0.35) 100%);
                        border-color: rgba(255,255,255,0.45);
                        box-shadow: 0 6px 16px rgba(7,155,170,0.4),
                                    inset 0 1px 2px rgba(255,255,255,0.2);
                        transform: translateY(-1px) scale(1.02);
                    }
                    
                    .header-refresh-button i {
                        animation: none;
                        transition: transform 0.3s ease;
                    }
                    
                    .header-refresh-button:hover i {
                        transform: rotate(180deg);
                    }
                    
                    /* Special Logout Button Styling with High Contrast */
                    .header-logout-button {
                        background: linear-gradient(135deg, rgba(220,53,69,0.35) 0%, rgba(220,53,69,0.25) 100%);
                        border-color: rgba(255,255,255,0.3);
                        box-shadow: 0 3px 10px rgba(220,53,69,0.3),
                                    inset 0 1px 0 rgba(255,255,255,0.15);
                    }
                    
                    .header-logout-button:hover {
                        background: linear-gradient(135deg, rgba(220,53,69,0.45) 0%, rgba(220,53,69,0.35) 100%);
                        border-color: rgba(255,255,255,0.4);
                        box-shadow: 0 6px 16px rgba(220,53,69,0.4),
                                    inset 0 1px 2px rgba(255,255,255,0.2);
                        transform: translateY(-1px) scale(1.02);
                    }
                    
                    /* Mobile menu toggle with Enhanced Style */
                    .mobile-menu-toggle {
                        display: none;
                        background: rgba(255,255,255,0.1);
                        border: 1px solid rgba(255,255,255,0.2);
                        color: white;
                        font-size: 20px;
                        cursor: pointer;
                        padding: 8px 12px;
                        border-radius: 8px;
                        transition: all 0.3s ease;
                        backdrop-filter: blur(5px);
                    }
                    
                    .mobile-menu-toggle:hover {
                        background: rgba(255,255,255,0.18);
                        transform: scale(1.05);
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    
                    /* Enhanced Breadcrumb Styles */
                    .header-breadcrumb {
                        background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.05) 100%);
                        padding: 10px 0;
                        border-bottom: 1px solid rgba(255,255,255,0.08);
                    }
                    
                    .breadcrumb-back {
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                        color: rgba(255,255,255,0.95);
                        text-decoration: none;
                        font-size: 13px;
                        font-weight: 600;
                        padding: 6px 24px;
                        max-width: 1920px;
                        margin: 0 auto;
                        transition: all 0.3s ease;
                        position: relative;
                    }
                    
                    .breadcrumb-back::before {
                        content: '';
                        position: absolute;
                        left: 0;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 3px;
                        height: 16px;
                        background: linear-gradient(180deg, transparent 0%, white 50%, transparent 100%);
                        opacity: 0;
                        transition: opacity 0.3s ease;
                    }
                    
                    .breadcrumb-back:hover {
                        color: white;
                        padding-left: 32px;
                    }
                    
                    .breadcrumb-back:hover::before {
                        opacity: 1;
                    }
                    
                    .breadcrumb-back i {
                        font-size: 12px;
                        transition: transform 0.3s ease;
                    }
                    
                    .breadcrumb-back:hover i {
                        transform: translateX(-2px);
                    }
                    
                    /* Adjust body for enhanced header with dynamic height */
                    body.has-general-header-enhanced {
                        padding-top: ${navConfig.secondaryRow && navConfig.secondaryRow.length > 0 ? '140px' : '85px'} !important;
                    }
                    
                    body.has-general-header-enhanced:has(.header-breadcrumb) {
                        padding-top: ${navConfig.secondaryRow && navConfig.secondaryRow.length > 0 ? '180px' : '125px'} !important;
                    }
                    
                    /* Hide Knack's default navigation */
                    body.has-general-header-enhanced .kn-menu.kn-view {
                        display: none !important;
                    }
                    
                    /* Ensure content is visible */
                    .kn-scene {
                        min-height: calc(100vh - ${navConfig.secondaryRow && navConfig.secondaryRow.length > 0 ? '124px' : '72px'});
                    }
                    
                    /* Large Desktop Optimization */
                    @media (min-width: 1920px) {
                        .header-content {
                            max-width: 2200px;
                        }
                        
                        .header-navigation.primary-nav {
                            max-width: 1400px;
                            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                        }
                        
                        .header-nav-button {
                            padding: 14px 20px;
                            font-size: 17px;
                            min-height: 52px;
                        }
                        
                        .header-nav-button i {
                            font-size: 22px;
                        }
                        
                        .header-nav-button span {
                            font-size: 17px;
                        }
                        
                        .brand-text {
                            font-size: 24px;
                        }
                        
                        .vespa-logo {
                            height: 52px;
                        }
                    }
                    
                    /* Tablet Styles with Better Proportions */
                    @media (max-width: 1200px) and (min-width: 769px) {
                        .header-content {
                            padding: 0 20px;
                        }
                        
                        .header-primary-row {
                            height: 64px;
                        }
                        
                        .header-navigation.primary-nav {
                            grid-template-columns: repeat(auto-fit, minmax(48px, 1fr));
                            gap: 6px;
                        }
                        
                        .header-nav-button {
                            padding: 8px;
                            min-height: 42px;
                            border-radius: 8px;
                        }
                        
                        .header-nav-button i {
                            font-size: 18px;
                        }
                        
                        .header-nav-button span {
                            display: none;
                        }
                        
                        .header-secondary-row {
                            height: 44px;
                            grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
                        }
                        
                        .header-nav-button.secondary-button {
                            min-height: 34px;
                        }
                        
                        .header-utility-button .utility-label {
                            display: none;
                        }
                        
                        .header-utility-button {
                            padding: 8px;
                            min-width: 40px;
                        }
                        
                        .vespa-logo {
                            height: 40px;
                        }
                        
                        .brand-text {
                            font-size: 16px;
                        }
                    }
                    
                    /* Mobile Styles with Slide-out Menu */
                    @media (max-width: 768px) {
                        .header-primary-row {
                            height: 60px;
                            gap: 12px;
                        }
                        
                        .header-content {
                            padding: 0 16px;
                        }
                        
                        .header-secondary-row {
                            display: none;
                        }
                        
                        .vespa-logo {
                            height: 36px;
                        }
                        
                        .brand-text {
                            font-size: 16px;
                            font-weight: 600;
                        }
                        
                        /* Mobile Navigation Drawer */
                        .header-navigation.primary-nav,
                        .header-utility {
                            position: fixed;
                            top: 60px;
                            right: -320px;
                            width: 320px;
                            max-height: calc(100vh - 60px);
                            background: linear-gradient(135deg, ${navConfig.color} 0%, ${navConfig.accentColor || navConfig.color} 100%);
                            display: flex;
                            flex-direction: column;
                            justify-content: flex-start;
                            padding: 20px 16px;
                            gap: 10px;
                            transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                            box-shadow: -4px 0 20px rgba(0,0,0,0.3);
                            overflow-y: auto;
                            z-index: 9998;
                            backdrop-filter: blur(10px);
                        }
                        
                        .header-navigation.mobile-open,
                        .header-utility.mobile-open {
                            right: 0;
                        }
                        
                        /* Mobile Button Styles with Better Contrast and Larger Text */
                        .header-nav-button,
                        .header-nav-button.secondary-button,
                        .header-utility-button {
                            width: 100%;
                            justify-content: flex-start;
                            padding: 14px 18px;
                            font-size: 16px;
                            min-height: 52px;
                            background: rgba(255,255,255,0.2);
                            backdrop-filter: blur(8px);
                            border: 2px solid rgba(255,255,255,0.3);
                            box-shadow: 0 2px 8px rgba(0,0,0,0.15),
                                        inset 0 1px 0 rgba(255,255,255,0.15);
                        }
                        
                        .header-nav-button:hover,
                        .header-nav-button.secondary-button:hover,
                        .header-utility-button:hover {
                            background: rgba(255,255,255,0.28);
                            transform: translateX(4px);
                            border-color: rgba(255,255,255,0.4);
                            box-shadow: 0 4px 12px rgba(0,0,0,0.2),
                                        inset 0 1px 2px rgba(255,255,255,0.2);
                        }
                        
                        .header-nav-button span,
                        .header-utility-button .utility-label {
                            display: inline;
                            font-size: 16px;
                            font-weight: 600;
                        }
                        
                        .header-nav-button i,
                        .header-utility-button i {
                            font-size: 20px;
                            width: 30px;
                            text-align: center;
                        }
                        
                        .mobile-menu-toggle {
                            display: block;
                        }
                        
                        /* Mobile Overlay */
                        .mobile-nav-overlay {
                            display: none;
                            position: fixed;
                            top: 60px;
                            left: 0;
                            right: 0;
                            bottom: 0;
                            background-color: rgba(0,0,0,0.5);
                            z-index: 9997;
                            backdrop-filter: blur(4px);
                            transition: opacity 0.3s ease;
                        }
                        
                        .mobile-nav-overlay.active {
                            display: block;
                            animation: fadeIn 0.3s ease;
                        }
                        
                        @keyframes fadeIn {
                            from { opacity: 0; }
                            to { opacity: 1; }
                        }
                        
                        body.has-general-header-enhanced {
                            padding-top: 75px !important;
                        }
                        
                        body.has-general-header-enhanced:has(.header-breadcrumb) {
                            padding-top: 115px !important;
                        }
                        
                        .header-breadcrumb {
                            padding: 8px 0;
                        }
                        
                        .breadcrumb-back {
                            font-size: 12px;
                            padding: 6px 16px;
                        }
                    }
                    
                    /* Small Mobile Optimization */
                    @media (max-width: 480px) {
                        .brand-text {
                            display: none;
                        }
                        
                        .header-navigation.primary-nav,
                        .header-utility {
                            width: 280px;
                            right: -280px;
                        }
                        
                        .header-nav-button,
                        .header-nav-button.secondary-button,
                        .header-utility-button {
                            padding: 12px 14px;
                            min-height: 48px;
                            font-size: 15px;
                        }
                        
                        .header-nav-button span,
                        .header-utility-button .utility-label {
                            font-size: 15px;
                        }
                        
                        .header-nav-button i,
                        .header-utility-button i {
                            font-size: 18px;
                            width: 26px;
                        }
                    }
                    
                    /* Specific User Type Styling with Enhanced Gradients */
                    .vespa-general-header-enhanced.student {
                        background: linear-gradient(135deg, #079baa 0%, #7bd8d0 100%);
                    }
                    
                    .vespa-general-header-enhanced.student .header-secondary-row {
                        background: linear-gradient(180deg, rgba(0,0,0,0.06) 0%, transparent 100%);
                    }
                    
                    .vespa-general-header-enhanced.staffResource {
                        background: linear-gradient(135deg, #5899a8 0%, #62d1d2 100%);
                    }
                    
                    .vespa-general-header-enhanced.staffCoaching {
                        background: linear-gradient(135deg, #2f8dcb 0%, #079baa 100%);
                    }
                    
                    .vespa-general-header-enhanced.staffAdminResource,
                    .vespa-general-header-enhanced.staffAdminCoaching {
                        background: linear-gradient(135deg, #2a3c7a 0%, #23356f 100%);
                    }
                    
                    .vespa-general-header-enhanced.staffAdminResource .header-nav-button.management-button,
                    .vespa-general-header-enhanced.staffAdminCoaching .header-nav-button.management-button {
                        background: linear-gradient(135deg, rgba(7,155,170,0.2) 0%, rgba(7,155,170,0.15) 100%);
                        border-color: rgba(7,155,170,0.3);
                    }
                    
                    .vespa-general-header-enhanced.superUser {
                        background: linear-gradient(135deg, #2a3c7a 0%, #079baa 100%);
                    }
                    
                    .vespa-general-header-enhanced.superUser .header-nav-button.management-button {
                        background: linear-gradient(135deg, rgba(123,216,208,0.18) 0%, rgba(123,216,208,0.12) 100%);
                        border-color: rgba(123,216,208,0.25);
                    }
                    
                    /* Smooth animations and transitions */
                    * {
                        -webkit-font-smoothing: antialiased;
                        -moz-osx-font-smoothing: grayscale;
                    }
                    
                    /* Loading animation for buttons */
                    @keyframes shimmer {
                        0% { background-position: -100% 0; }
                        100% { background-position: 100% 0; }
                    }
                    
                    .header-nav-button.loading {
                        background: linear-gradient(90deg, 
                            rgba(255,255,255,0.1) 0%, 
                            rgba(255,255,255,0.2) 50%, 
                            rgba(255,255,255,0.1) 100%);
                        background-size: 200% 100%;
                        animation: shimmer 1.5s ease-in-out infinite;
                    }
                    
                    /* Enhanced Focus styles for accessibility */
                    .header-nav-button:focus-visible,
                    .header-utility-button:focus-visible,
                    .mobile-menu-toggle:focus-visible,
                    .breadcrumb-back:focus-visible {
                        outline: 3px solid rgba(255,255,255,0.7);
                        outline-offset: 3px;
                        box-shadow: 0 0 20px rgba(255,255,255,0.3);
                    }
                    
                    /* Print styles */
                    @media print {
                        .vespa-general-header-enhanced {
                            display: none !important;
                        }
                        
                        body.has-general-header-enhanced {
                            padding-top: 0 !important;
                        }
                    }
                    
                    /* High contrast mode support */
                    @media (prefers-contrast: high) {
                        .header-nav-button {
                            border-width: 2px;
                        }
                        
                        .header-nav-button.active {
                            outline: 2px solid white;
                        }
                    }
                    
                    /* Reduced motion support */
                    @media (prefers-reduced-motion: reduce) {
                        .header-nav-button,
                        .header-utility-button,
                        .breadcrumb-back,
                        .mobile-menu-toggle {
                            transition: none;
                        }
                        
                        .header-nav-button::before {
                            transition: none;
                        }
                        
                        @keyframes shimmer {
                            0%, 100% { background-position: 0 0; }
                        }
                    }
                    
                    /* Enhanced Visual Polish
                     * - CSS Grid ensures equal button widths across all user types
                     * - Glassmorphism effects add modern depth
                     * - Gradient backgrounds utilize the blue/turquoise palette
                     * - Management buttons have distinct golden accent
                     * - Responsive breakpoints ensure perfect scaling
                     * - Accessibility features built-in
                     */
                </style>
            `;
        }
        
        // Function to inject the header
        function injectHeader() {
            // Check if header already exists
            if (document.getElementById('vespaGeneralHeader')) {
                log('Header already exists, checking if it should be removed');
                const userType = getUserType();
                if (!userType) {
                    // User is not logged in, remove header
                    log('User not logged in, removing header');
                    const existingHeader = document.getElementById('vespaGeneralHeader');
                    if (existingHeader) existingHeader.remove();
                    // Reset body padding
                    document.body.classList.remove('has-general-header-enhanced');
                    document.body.style.paddingTop = '';
                }
                return;
            }
            
            const userType = getUserType();
            log('Detected user type:', userType);
            
            // Don't show header if user is not logged in
            if (!userType) {
                log('User not logged in, not showing header');
                return;
            }
            
            // Create and inject the header
            const headerHTML = createHeaderHTML(userType, currentScene);
            document.body.insertAdjacentHTML('afterbegin', headerHTML);
            document.body.classList.add('has-general-header-enhanced');
            
            log('Header injected successfully');
            
            // Setup event listeners
            setupEventListeners();
            
            // Apply permanent header offset
            applyFixedHeaderOffset();

            // Track current page
            trackPageView(userType, currentScene);
            
            // DEBUG: Watch for style changes on nav buttons
            const navButtons = document.querySelectorAll('#vespaGeneralHeader .header-nav-button');
            navButtons.forEach((button, index) => {
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                            log(`DEBUG: Style attribute changed on nav button ${index}:`, {
                                oldValue: mutation.oldValue,
                                newValue: button.getAttribute('style'),
                                userType: getUserType()
                            });
                        }
                    });
                });
                
                observer.observe(button, {
                    attributes: true,
                    attributeOldValue: true,
                    attributeFilter: ['style']
                });
            });
        }
        
        // Setup event listeners
        function setupEventListeners() {
            // Mobile menu toggle
            const mobileToggle = document.querySelector('.mobile-menu-toggle');
            const navigation = document.querySelector('.header-navigation');
            const utility = document.querySelector('.header-utility');
            const overlay = document.querySelector('.mobile-nav-overlay');
            
            // DEBUG: Log nav button styles after setup
            setTimeout(() => {
                const navButtons = document.querySelectorAll('#vespaGeneralHeader .header-nav-button');
                if (navButtons.length > 0) {
                    const firstButton = navButtons[0];
                    const computedStyle = window.getComputedStyle(firstButton);
                    log('DEBUG: Nav button computed styles after setup:', {
                        padding: computedStyle.padding,
                        fontSize: computedStyle.fontSize,
                        width: firstButton.offsetWidth,
                        userType: getUserType()
                    });
                }
            }, 100);
            
            if (mobileToggle) {
                mobileToggle.addEventListener('click', function() {
                    navigation.classList.toggle('mobile-open');
                    utility.classList.toggle('mobile-open');
                    overlay.classList.toggle('active');
                });
            }
            
            if (overlay) {
                overlay.addEventListener('click', function() {
                    navigation.classList.remove('mobile-open');
                    utility.classList.remove('mobile-open');
                    overlay.classList.remove('active');
                });
            }
            
            // Navigation click handling
            const navLinks = document.querySelectorAll('.header-nav-button, .header-utility-button, .breadcrumb-back');
            navLinks.forEach(link => {
                link.addEventListener('click', function(e) {
                    e.preventDefault();
                    
                    // Check if this is the refresh button
                    if (this.getAttribute('data-refresh') === 'true') {
                        log('Refresh button clicked - performing page reload');
                        
                        // Show loading screen
                        if (window.showUniversalLoadingScreen) {
                            window.showUniversalLoadingScreen('Refreshing page...');
                        }
                        
                        // Simply reload the page like F5 - this is more reliable
                        // and mimics what works for the user
                        setTimeout(() => {
                            window.location.reload();
                        }, 100);
                        
                        return;
                    }
                    
                    // Check if this is the logout button
                    if (this.getAttribute('data-logout') === 'true') {
                        log('Logout button clicked');
                        
                        // Clear role selection from session storage
                        sessionStorage.removeItem('selectedUserRole');
                        log('Cleared role selection from session storage');
                        
                        // FIRST: Navigate to home page immediately
                        log('Navigating to home page first');
                        window.location.href = 'https://vespaacademy.knack.com/vespa-academy#home/';
                        
                        // THEN: Trigger logout after a small delay to allow navigation to start
                        setTimeout(() => {
                            log('Now triggering logout');
                            // Trigger Knack logout
                            const logoutLink = document.querySelector('.kn-log-out');
                            if (logoutLink) {
                                logoutLink.click();
                            } else {
                                // Fallback: try to find and click any logout link
                                const altLogout = document.querySelector('a[href*="logout"]');
                                if (altLogout) altLogout.click();
                            }
                        }, 100); // Small delay to ensure navigation starts first
                        
                        return;
                    }
                    
                    const href = this.getAttribute('href');
                    const targetScene = this.getAttribute('data-scene');
                    
                    if (href && href.startsWith('#')) {
                        // Close mobile menu if open
                        navigation.classList.remove('mobile-open');
                        utility.classList.remove('mobile-open');
                        overlay.classList.remove('active');
                        
                        // Store the navigation intent
                        const currentHash = window.location.hash;
                        log(`Navigation from ${currentHash} to ${href} (scene: ${targetScene})`);
                        
                        // CRITICAL: Disable Universal Redirect for ALL navigation
                        // This prevents redirect interference when clicking header buttons
                        window._universalRedirectCompleted = true;
                        window._bypassUniversalRedirect = true;
                        window._navigationInProgress = true;
                        window._headerNavigationActive = true; // New flag for header navigation
                        sessionStorage.setItem('universalRedirectCompleted', 'true');
                        sessionStorage.setItem('navigationTarget', targetScene);
                        sessionStorage.setItem('headerNavigationActive', 'true');
                        
                        // IMPORTANT: Block homepage loading during navigation
                        window._blockHomepageLoad = true;
                        window._navigatingToScene = targetScene;
                        sessionStorage.setItem('blockHomepageLoad', 'true');
                        sessionStorage.setItem('navigatingToScene', targetScene);
                        
                        // Kill any Universal Redirect timers
                        if (window._universalRedirectTimer) {
                            clearInterval(window._universalRedirectTimer);
                            clearTimeout(window._universalRedirectTimer);
                            window._universalRedirectTimer = null;
                            log('Killed Universal Redirect timer during navigation');
                        }
                        
                        // UNIVERSAL CLEANUP: Force cleanup for all scene navigations
                        // This ensures fresh app loads and prevents issues with cached states
                        if (targetScene && targetScene !== currentScene) {
                            log(`Navigating to ${targetScene}, forcing universal cleanup`);
                            
                            // Signal the loader to force reload for this scene
                            window._forceAppReload = targetScene;
                            
                            // Clear any cached app states for the target scene
                            if (window.cleanupAppsForScene && typeof window.cleanupAppsForScene === 'function') {
                                window.cleanupAppsForScene(targetScene);
                            }
                            
                            // Also clear any background styles that might persist
                            document.body.style.backgroundColor = '';
                            document.body.style.background = '';
                            document.body.style.backgroundImage = '';
                        }
                        
                        // Navigate using Knack with a small delay to ensure cleanup
                        setTimeout(() => {
                            window.location.hash = href;
                            
                            // Special handling for Resource Portal scenes
                            if (targetScene === 'scene_1272' || targetScene === 'scene_481') {
                                log(`Special handling for Resource Portal scene ${targetScene}`);
                                // Double-check that Universal Redirect is still disabled
                                window._universalRedirectCompleted = true;
                                window._bypassUniversalRedirect = true;
                                
                                // Force scene render if needed
                                setTimeout(() => {
                                    const currentScene = Knack.scene ? Knack.scene.key : null;
                                    if (currentScene !== targetScene) {
                                        log(`Scene didn't change properly for ${targetScene}, attempting force navigation`);
                                        // Try hash navigation again instead of full page reload
                                        // This avoids going through scene_1 and triggering Universal Redirect
                                        window.location.hash = href;
                                        // If still doesn't work, just log it - don't do full page reload
                                        log(`Attempted hash navigation to ${href}`);
                                    }
                                    // Clear navigation flags after successful navigation
                                    window._navigationInProgress = false;
                                    window._headerNavigationActive = false;
                                    sessionStorage.removeItem('headerNavigationActive');
                                }, 500);
                            }
                            
                                                    // Special handling for Results page - simplified approach with loading indicator
                        else if (targetScene === 'scene_1270') {
                            log(`Special handling for Results page`);
                            
                            // Show loading screen briefly for user feedback
                            if (window.showUniversalLoadingScreen) {
                                window.showUniversalLoadingScreen('Loading Results...');
                                // Auto-hide after 2 seconds max
                                setTimeout(() => {
                                    if (window.hideUniversalLoadingScreen) {
                                        window.hideUniversalLoadingScreen();
                                    }
                                }, 2000);
                            }
                            
                            // Set protection flags
                            window._blockHomepageLoad = true;
                            window._skipHomepageRender = true;
                            window._resultsNavigationActive = true;
                            sessionStorage.setItem('skipHomepageRender', 'true');
                            sessionStorage.setItem('navigatingToResults', 'true');
                            
                            // Only remove homepage containers, not all content
                            const homepageContainers = document.querySelectorAll('[id*="homepage"], [id*="staff-homepage"], [id*="resource-dashboard"]');
                            homepageContainers.forEach(container => {
                                log('Removing homepage container before Results navigation:', container.id);
                                container.remove();
                            });
                            
                            // Simple navigation without aggressive retries
                            setTimeout(() => {
                                const currentScene = Knack.scene ? Knack.scene.key : null;
                                if (currentScene !== targetScene) {
                                    log(`Navigating to Results page`);
                                    window.location.hash = href;
                                }
                                
                                // Clear flags after navigation attempt
                                setTimeout(() => {
                                    window._navigationInProgress = false;
                                    window._headerNavigationActive = false;
                                    window._blockHomepageLoad = false;
                                    window._skipHomepageRender = false;
                                    window._resultsNavigationActive = false;
                                    sessionStorage.removeItem('headerNavigationActive');
                                    sessionStorage.removeItem('blockHomepageLoad');
                                    sessionStorage.removeItem('skipHomepageRender');
                                    sessionStorage.removeItem('navigatingToScene');
                                    sessionStorage.removeItem('navigatingToResults');
                                    // Also ensure loading screen is hidden
                                    if (window.hideUniversalLoadingScreen) {
                                        window.hideUniversalLoadingScreen();
                                    }
                                }, 1500);
                            }, 100);
                        }
                        // For Coaching tabs, ensure the scene renders properly
                        else if (targetScene === 'scene_1095') {
                            log(`Special handling for Coaching scene ${targetScene}`);
                            
                            // Extra protection against homepage loading
                            window._blockHomepageLoad = true;
                            window._skipHomepageRender = true;
                            sessionStorage.setItem('skipHomepageRender', 'true');
                            
                            // Force cleanup of any existing homepage containers
                            const homepageContainers = document.querySelectorAll('[id*="homepage"], [id*="staff-homepage"], [id*="resource-dashboard"]');
                            homepageContainers.forEach(container => {
                                log('Removing homepage container before Coaching navigation:', container.id);
                                container.remove();
                            });
                            
                            // Trigger a manual scene render event if Knack doesn't fire it
                            setTimeout(() => {
                                const currentScene = Knack.scene ? Knack.scene.key : null;
                                if (currentScene !== targetScene) {
                                    log(`Scene didn't change properly, attempting force navigation`);
                                    // Try hash navigation again
                                    window.location.hash = href;
                                    log(`Attempted hash navigation to ${href}`);
                                }
                                // Clear navigation flags after successful navigation
                                window._navigationInProgress = false;
                                window._headerNavigationActive = false;
                                window._blockHomepageLoad = false;
                                window._skipHomepageRender = false;
                                sessionStorage.removeItem('headerNavigationActive');
                                sessionStorage.removeItem('blockHomepageLoad');
                                sessionStorage.removeItem('skipHomepageRender');
                                sessionStorage.removeItem('navigatingToScene');
                            }, 500);
                        } else {
                                // Clear navigation flags for other scenes
                                setTimeout(() => {
                                    window._navigationInProgress = false;
                                    window._headerNavigationActive = false;
                                    window._blockHomepageLoad = false;
                                    window._skipHomepageRender = false;
                                    sessionStorage.removeItem('headerNavigationActive');
                                    sessionStorage.removeItem('blockHomepageLoad');
                                    sessionStorage.removeItem('skipHomepageRender');
                                    sessionStorage.removeItem('navigatingToScene');
                                }, 500);
                            }
                        }, 50);
                    }
                });
            });
        }
        
        // Track page views for analytics
        function trackPageView(userType, scene) {
            log('Page view tracked:', { userType, scene });
            // You can add analytics tracking here if needed
        }
        
            // Apply a permanent offset so the browser translation bar doesn't cover our header
    const FIXED_HEADER_OFFSET_PX = 0; // Set to 0 since translate widget is inline
    function getCssPaddingTop() {
        const previousInline = document.body.style.paddingTop;
        document.body.style.paddingTop = '';
        const cssPadding = parseFloat(window.getComputedStyle(document.body).paddingTop) || 0;
        document.body.style.paddingTop = previousInline;
        return cssPadding;
    }
    function applyFixedHeaderOffset() {
        try {
            const header = document.getElementById('vespaGeneralHeader');
            if (!header) return;
            // Set header to top with no offset
            header.style.top = '0px';
            // Just use the CSS padding from styles
            const basePadding = getCssPaddingTop();
            document.body.style.paddingTop = basePadding + 'px';
            
            // Remove any old cover div if it exists
            const oldCover = document.getElementById('vespaHeaderTopCover');
            if (oldCover) {
                oldCover.remove();
            }
            
            log('Applied fixed header offset', { offset: 0, basePadding });
        } catch (e) {
            logWarn('Failed to apply fixed header offset', e);
        }
    }

        // Lightweight DOM cleanup function - only clean up what's actually needed
        function cleanupPageContent(newScene) {
            log('Starting lightweight DOM cleanup for scene change to:', newScene);
            
            // Only clean up if we're leaving a homepage scene
            const homepageScenes = ['scene_1210', 'scene_1215', 'scene_1278']; // Updated to new resource scene
            const wasOnHomepage = homepageScenes.includes(lastScene);
            const isGoingToHomepage = homepageScenes.includes(newScene);
            
            if (!wasOnHomepage) {
                log('Not leaving a homepage scene, skipping cleanup');
                return;
            }
            
            log(`Leaving homepage scene ${lastScene}, going to ${newScene}`);
            
            // Remove scene-level containers only from homepage scenes
            const sceneContainers = document.querySelectorAll('[id^="scene-level-container"]');
            sceneContainers.forEach(container => {
                log('Removing scene container:', container.id);
                container.remove();
            });
            
            // Remove homepage-specific styles only
            const homepageStyles = document.querySelectorAll('style[id*="homepage"], style[id*="resource-dashboard"], style[id*="staff-homepage"], style[id*="student-homepage"]');
            homepageStyles.forEach(style => {
                log('Removing homepage style:', style.id);
                style.remove();
            });
            
            // Reset body background styles only if leaving homepage
            document.body.classList.remove('landing-page-scene', 'dashboard-scene');
            const landingPageClasses = Array.from(document.body.classList).filter(cls => cls.startsWith('landing-page-'));
            landingPageClasses.forEach(cls => document.body.classList.remove(cls));
            
            document.body.style.backgroundColor = '';
            document.body.style.backgroundImage = '';
            document.body.style.backgroundAttachment = '';
            document.body.style.minHeight = '';
            
            // Call cleanup functions only if we have them
            if (typeof window.cleanupResourceDashboard === 'function') {
                log('Calling ResourceDashboard cleanup');
                window.cleanupResourceDashboard();
            }
            
            log('Lightweight DOM cleanup completed');
        }
        
        // Translation Widget Functions - REMOVED
        // Translation functionality has been removed and can be added back later if needed
        
        // Placeholder function to prevent errors if called
        function addTranslationWidget() {
            return; // Function disabled - translation widget removed
            const loginScenes = ['scene_1', 'scene_2', 'scene_3', 'scene_4', 'scene_5'];
            if (loginScenes.includes(currentScene)) {
                log('On login scene, not adding translation widget');
                return;
            }
            
            // Remove any existing translation bar first
            const existingBar = document.querySelector('.header-translation-bar');
            if (existingBar) {
                existingBar.remove();
            }
            
            // Check if already added
            if (document.getElementById('google_translate_element')) {
                log('Translation widget already exists');
                return;
            }
            
            log('Adding translation widget to header');
            
            // Find the utility section - place widget there but position it better
            const headerUtility = document.querySelector('.header-utility');
            if (!headerUtility) {
                log('Header utility section not found, retrying in 500ms');
                setTimeout(addTranslationWidget, 500);
                return;
            }
            
            // Create container for translation controls
            const translationControlsContainer = document.createElement('div');
            translationControlsContainer.className = 'translation-controls-container';
            translationControlsContainer.style.cssText = `
                display: inline-flex; 
                align-items: center; 
                gap: 8px;
            `;
            
            // Create translate widget container
            const translateContainer = document.createElement('div');
            translateContainer.id = 'google_translate_element';
            translateContainer.className = 'translate-widget-container';
            translationControlsContainer.appendChild(translateContainer);
            
            // Add clear translation button if there's a saved preference
            if (localStorage.getItem('vespaPreferredLanguage')) {
                const clearButton = document.createElement('button');
                clearButton.className = 'translation-clear-button';
                clearButton.innerHTML = '<i class="fa fa-times-circle"></i>';
                clearButton.title = 'Clear translation preference';
                clearButton.style.cssText = `
                    background: rgba(255,255,255,0.2);
                    border: 1px solid rgba(255,255,255,0.3);
                    border-radius: 6px;
                    color: white;
                    padding: 5px 8px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.2s ease;
                    height: 32px;
                    display: inline-flex;
                    align-items: center;
                    margin-left: -5px;
                `;
                clearButton.onmouseover = function() {
                    this.style.background = 'rgba(255,255,255,0.3)';
                };
                clearButton.onmouseout = function() {
                    this.style.background = 'rgba(255,255,255,0.2)';
                };
                clearButton.onclick = function(e) {
                    e.stopPropagation();
                    // Clear all translation preferences
                    localStorage.removeItem('vespaPreferredLanguage');
                    sessionStorage.removeItem('vespaTranslationActive');
                    // Switch back to English
                    const selector = document.querySelector('.goog-te-combo');
                    if (selector) {
                        selector.value = 'en';
                        const evt = document.createEvent('HTMLEvents');
                        evt.initEvent('change', false, true);
                        selector.dispatchEvent(evt);
                    }
                    // Hide the clear button
                    clearButton.style.display = 'none';
                    log('Translation preference cleared');
                };
                translationControlsContainer.appendChild(clearButton);
            }

            // Prevent navigation handlers from reacting to clicks inside the widget
            translationControlsContainer.addEventListener('click', function(e) { e.stopPropagation(); }, true);
            translationControlsContainer.addEventListener('mousedown', function(e) { e.stopPropagation(); }, true);
            translationControlsContainer.addEventListener('touchstart', function(e) { e.stopPropagation(); }, true);
            
            // Insert at the beginning of utility section (before other buttons)
            headerUtility.insertBefore(translationControlsContainer, headerUtility.firstChild);
            
            // Load Google Translate script
            if (!window.googleTranslateElementInit) {
                window.googleTranslateElementInit = function() {
                    log('Google Translate Element initializing');
                    new google.translate.TranslateElement({
                        pageLanguage: 'en',
                        // FIXED: Using correct Welsh code and adding more languages
                        includedLanguages: 'en,cy,pl,es,fr,de,it,pt,ar,ur,zh-CN,hi,ga', // Welsh (cy), Irish (ga) included
                        layout: google.translate.TranslateElement.InlineLayout.SIMPLE,
                        autoDisplay: false,
                        multilanguagePage: true, // Important for dynamic content!
                        gaTrack: false // Disable tracking
                    }, 'google_translate_element');
                    
                    log('Google Translate Element created, now styling and configuring');
                    
                    // Immediately start removing banner
                    removeGoogleBanner();
                    
                    // Style the widget to match your header
                    setTimeout(() => {
                        styleTranslateWidget();
                        // Force hide the Google banner again
                        removeGoogleBanner();
                        // Restore saved language preference
                        restoreLanguagePreference();
                        // Setup language change observer
                        observeLanguageChanges();
                        log('Translation widget fully configured');
                    }, 100);
                    
                    // Keep removing banner every 500ms for 5 seconds to be sure
                    let bannerCheckCount = 0;
                    const bannerInterval = setInterval(() => {
                        removeGoogleBanner();
                        bannerCheckCount++;
                        if (bannerCheckCount > 10) {
                            clearInterval(bannerInterval);
                        }
                    }, 500);
                    
                    // Notify apps that translation is available
                    window.vespaTranslationAvailable = true;
                    $(document).trigger('vespa-translation-ready');
                };
                
                const script = document.createElement('script');
                script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
                script.async = true;
                document.head.appendChild(script);
            }
        }
        
        // Save and restore language preferences
        function saveLanguagePreference(language) {
            if (language === 'en' || language === '') {
                // Clear preference when switching back to English
                localStorage.removeItem('vespaPreferredLanguage');
                sessionStorage.removeItem('vespaTranslationActive');
                log('Cleared language preference - switched to English');
            } else if (language) {
                localStorage.setItem('vespaPreferredLanguage', language);
                sessionStorage.setItem('vespaTranslationActive', 'true');
                log('Saved language preference:', language);
            }
        }
        
        function restoreLanguagePreference() {
            // Check if user explicitly disabled translation this session
            const translationDisabled = sessionStorage.getItem('vespaTranslationDisabled');
            if (translationDisabled === 'true') {
                log('Translation disabled for this session');
                return;
            }
            
            const savedLanguage = localStorage.getItem('vespaPreferredLanguage');
            if (savedLanguage && savedLanguage !== 'en') {
                log('Restoring saved language preference:', savedLanguage);
                const selector = document.querySelector('.goog-te-combo');
                if (selector) {
                    // Wait a bit for Google Translate to fully initialize
                    setTimeout(() => {
                        selector.value = savedLanguage;
                        const evt = document.createEvent('HTMLEvents');
                        evt.initEvent('change', false, true);
                        selector.dispatchEvent(evt);
                    }, 500);
                }
            }
        }
        
        // Add function to explicitly disable translation for session
        function disableTranslationForSession() {
            sessionStorage.setItem('vespaTranslationDisabled', 'true');
            // Switch back to English
            const selector = document.querySelector('.goog-te-combo');
            if (selector && selector.value !== 'en') {
                selector.value = 'en';
                const evt = document.createEvent('HTMLEvents');
                evt.initEvent('change', false, true);
                selector.dispatchEvent(evt);
            }
            log('Translation disabled for this session');
        }
        
        function observeLanguageChanges() {
            const selector = document.querySelector('.goog-te-combo');
            if (selector) {
                selector.addEventListener('change', function() {
                    const selectedLanguage = this.value;
                    
                    // Clear the session disabled flag when user actively changes language
                    if (selectedLanguage && selectedLanguage !== 'en') {
                        sessionStorage.removeItem('vespaTranslationDisabled');
                    }
                    
                    saveLanguagePreference(selectedLanguage);
                    
                    // Update clear button visibility
                    const clearButton = document.querySelector('.translation-clear-button');
                    if (clearButton) {
                        if (selectedLanguage && selectedLanguage !== 'en' && selectedLanguage !== '') {
                            clearButton.style.display = 'inline-block';
                        } else {
                            clearButton.style.display = 'none';
                        }
                    }
                    
                    // Always remove Google banner after language change
                    setTimeout(removeGoogleBanner, 100);
                    
                    // Notify other parts of the app about language change
                    $(document).trigger('vespa-language-changed', { language: selectedLanguage });
                });
            }
        }
        
        // Force remove Google Translate banner
        function removeGoogleBanner() {
            // Remove the banner frame
            const bannerFrame = document.querySelector('.goog-te-banner-frame');
            if (bannerFrame) {
                bannerFrame.style.display = 'none';
                bannerFrame.remove();
            }
            
            // Fix body positioning
            document.body.style.top = '0px';
            document.body.style.position = 'relative';
            document.documentElement.style.top = '0px';
            
            // Remove any Google Translate added styles on body
            if (document.body.className.includes('translated-ltr')) {
                document.body.style.top = '0px !important';
                document.body.style.position = 'relative !important';
            }
            
            // Use MutationObserver to keep removing it if Google tries to add it back
            if (!window._bannerObserver) {
                window._bannerObserver = new MutationObserver(function(mutations) {
                    mutations.forEach(function(mutation) {
                        if (mutation.type === 'childList') {
                            const banner = document.querySelector('.goog-te-banner-frame');
                            if (banner) {
                                banner.style.display = 'none';
                                document.body.style.top = '0px';
                            }
                        }
                    });
                });
                window._bannerObserver.observe(document.body, { childList: true, subtree: false });
                // Also watch the <html> element where Google sometimes injects styles/tooltips
                if (!window._htmlBannerObserver) {
                    window._htmlBannerObserver = new MutationObserver(function() {
                        const banner = document.querySelector('.goog-te-banner-frame');
                        if (banner) {
                            banner.style.display = 'none';
                            try { banner.remove(); } catch (e) {}
                        }
                        document.documentElement.style.top = '0px';
                        const tt = document.getElementById('goog-gt-tt');
                        if (tt) tt.style.display = 'none';
                    });
                    window._htmlBannerObserver.observe(document.documentElement, { childList: true, subtree: true });
                }
            }
            
            log('Google Translate banner removed');
        }
        
        // (Refresh button removed)
        
        function styleTranslateWidget() {
            // Custom styling to match your header
            if (document.getElementById('translation-widget-styles')) return;
            
            const style = document.createElement('style');
            style.id = 'translation-widget-styles';
            style.textContent = `
                /* Container styling */
                .translation-controls-container {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    margin: 0 8px;
                }
                
                .translate-widget-container {
                    display: inline-flex;
                    align-items: center;
                }
                
                /* (Refresh button styles removed) */
                
                /* Hide Google's branding */
                .goog-logo-link {
                    display: none !important;
                }
                .goog-te-gadget {
                    color: transparent !important;
                    font-size: 0 !important;
                }
                
                /* Style the dropdown - compact for utility section */
                .goog-te-gadget .goog-te-combo {
                    background: rgba(255,255,255,0.14);
                    border: 1px solid rgba(255,255,255,0.18);
                    border-radius: 6px;
                    padding: 6px 10px;
                    color: #ffffff;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    min-width: 120px;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    backdrop-filter: blur(3px);
                    outline: none;
                    height: 32px;
                }
                
                .goog-te-gadget .goog-te-combo:hover {
                    background: rgba(255,255,255,0.22);
                    transform: translateY(-1px);
                    box-shadow: 0 3px 12px rgba(0,0,0,0.2);
                }
                
                .goog-te-gadget .goog-te-combo option {
                    background: #2a3c7a;
                    color: #ffffff;
                }
                
                /* Aggressively hide the Google Translate banner */
                .goog-te-banner-frame,
                .goog-te-banner-frame.skiptranslate,
                body > .skiptranslate:first-child {
                    display: none !important;
                    visibility: hidden !important;
                    height: 0 !important;
                    width: 0 !important;
                    position: absolute !important;
                    top: -9999px !important;
                    left: -9999px !important;
                }
                html { top: 0 !important; position: relative !important; }
                iframe.goog-te-banner-frame { display: none !important; height: 0 !important; }
                #goog-gt-tt, .goog-tooltip, .goog-te-balloon-frame { display: none !important; }
                
                /* Fix body positioning - FORCE it */
                body {
                    top: 0 !important;
                    position: relative !important;
                    margin-top: 0 !important;
                    padding-top: 65px !important; /* Keep our header spacing */
                }
                
                body.translated-ltr,
                body.translated-rtl,
                body.translated {
                    top: 0 !important;
                    position: relative !important;
                    margin-top: 0 !important;
                }
                
                /* Ensure our header stays on top */
                .vespa-general-header {
                    z-index: 99999 !important;
                }
                

                
                /* Mobile responsive */
                @media (max-width: 992px) {
                    .translation-controls-container {
                        margin: 0 4px;
                        gap: 4px;
                    }
                    .goog-te-gadget .goog-te-combo {
                        min-width: 100px;
                        padding: 5px 8px;
                        font-size: 11px;
                    }
                    /* (Refresh button responsive styles removed) */
                }
                

                
                /* Fix for translation affecting header buttons */
                .header-nav-button .notranslate {
                    display: inline-block;
                }
                
                /* Loading state */
                .translating .kn-scene {
                    opacity: 0.7;
                    pointer-events: none;
                }
                
                /* Translation complete animation */
                @keyframes translationComplete {
                    0% { opacity: 0.7; }
                    100% { opacity: 1; }
                }
                
                .translation-complete .kn-scene {
                    animation: translationComplete 0.3s ease-out;
                }
            `;
            document.head.appendChild(style);
            
            // Remove Google Translate banner and fix body
            setTimeout(() => {
                const banner = document.querySelector('.goog-te-banner-frame');
                if (banner) banner.style.display = 'none';
                document.body.style.top = '0px';
                document.body.style.position = 'relative';
                document.body.classList.add('translated');
                document.documentElement.style.top = '0px';
            }, 100);
            
            log('Translation widget styled successfully');
        }
        
        // Function to refresh translations after dynamic content loads
        // This is exposed globally so any app can call window.refreshTranslations()
        // Used by: knackAppLoader (auto), manual refresh button, and can be called by any app
        window.refreshTranslations = function() {
            // Trigger Google Translate to re-scan the page
            const evt = document.createEvent('HTMLEvents');
            evt.initEvent('change', false, true);
            const selector = document.querySelector('.goog-te-combo');
            if (selector) {
                const currentLang = selector.value;
                if (currentLang && currentLang !== 'en' && currentLang !== '') {
                    log(`Refreshing translations for language: ${currentLang}`);
                    // Briefly switch to English and back to refresh
                    selector.value = 'en';
                    selector.dispatchEvent(evt);
                    setTimeout(() => {
                        selector.value = currentLang;
                        selector.dispatchEvent(evt);
                        // Also try to translate embedded content
                        translateEmbeddedContent(currentLang);
                        // Always remove banner after refresh
                        removeGoogleBanner();
                        // Trigger event for apps that need to know
                        $(document).trigger('vespa-translation-refreshed', { language: currentLang });
                    }, 100);
                } else {
                    log('No active translation to refresh (currently in English)');
                }
            }
        };
        
        // Function to add translation notice for Slides.com embeds
        function addSlidesTranslationNotice(iframe, targetLang) {
            const wrapper = document.createElement('div');
            wrapper.className = 'slides-translate-notice';
            wrapper.style.cssText = `
                position: relative;
                display: inline-block;
                width: 100%;
            `;
            
            // Create notice overlay
            const notice = document.createElement('div');
            notice.className = 'translation-notice-overlay';
            notice.innerHTML = `
                <div style="
                    position: absolute;
                    top: 10px;
                    right: 10px;
                    background: rgba(0, 229, 219, 0.95);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    font-weight: 600;
                    z-index: 1000;
                    cursor: pointer;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                    display: flex;
                    align-items: center;
                    gap: 6px;
                " onclick="this.style.display='none'">
                    <i class="fa fa-info-circle"></i>
                    <span>Slides cannot auto-translate</span>
                    <i class="fa fa-times" style="margin-left: 8px; opacity: 0.8;"></i>
                </div>
            `;
            
            // Wrap the iframe
            iframe.parentNode.insertBefore(wrapper, iframe);
            wrapper.appendChild(iframe);
            wrapper.appendChild(notice);
            
            // Language-specific messages
            const messages = {
                'cy': 'Ni all sleidiau gyfieithu\'n awtomatig', // Welsh
                'pl': 'Slajdy nie mogą być automatycznie tłumaczone', // Polish
                'es': 'Las diapositivas no se pueden traducir automáticamente', // Spanish
                'fr': 'Les diapositives ne peuvent pas être traduites automatiquement', // French
                'de': 'Folien können nicht automatisch übersetzt werden' // German
            };
            
            if (messages[targetLang]) {
                notice.querySelector('span').textContent = messages[targetLang];
            }
            
            // Add option to open slides in new tab
            const openButton = document.createElement('button');
            openButton.style.cssText = `
                position: absolute;
                bottom: 10px;
                right: 10px;
                background: rgba(42, 60, 122, 0.9);
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                font-size: 11px;
                cursor: pointer;
                z-index: 1000;
                display: flex;
                align-items: center;
                gap: 4px;
            `;
            openButton.innerHTML = '<i class="fa fa-external-link-alt"></i> Open in new tab for manual translation';
            openButton.onclick = function() {
                window.open(iframe.src, '_blank');
            };
            wrapper.appendChild(openButton);
            
            // Auto-hide notice after 10 seconds
            setTimeout(() => {
                if (notice.querySelector('div')) {
                    notice.querySelector('div').style.display = 'none';
                }
            }, 10000);
        }
        
        // Function to handle embedded content translation
        function translateEmbeddedContent(targetLang) {
            // Handle iframes (slides, embedded documents)
            const iframes = document.querySelectorAll('iframe');
            iframes.forEach(iframe => {
                try {
                    // Check if we can access the iframe (same-origin policy)
                    if (iframe.contentDocument) {
                        // Add Google Translate to the iframe
                        const iframeDoc = iframe.contentDocument;
                        if (!iframeDoc.querySelector('.goog-te-banner-frame')) {
                            // Inject translate element into iframe
                            const translateDiv = iframeDoc.createElement('div');
                            translateDiv.id = 'google_translate_element_iframe';
                            translateDiv.className = 'notranslate';
                            iframeDoc.body.appendChild(translateDiv);
                            
                            // Try to trigger translation in iframe
                            log('Attempting to translate iframe content');
                        }
                    }
                } catch (e) {
                    // Cross-origin iframe - try alternative approach
                    // Add translate attribute to iframe
                    iframe.setAttribute('translate', 'yes');
                    iframe.className = iframe.className.replace('notranslate', '');
                    
                    // For Google Slides/Docs, try to append language parameter
                    if (iframe.src && iframe.src.includes('docs.google.com')) {
                        const langMap = {
                            'cy': 'cy', // Welsh
                            'pl': 'pl', // Polish
                            'es': 'es', // Spanish
                            'fr': 'fr', // French
                            'de': 'de', // German
                            'ar': 'ar', // Arabic
                            'zh-CN': 'zh-CN' // Chinese
                        };
                        
                        if (langMap[targetLang] && !iframe.src.includes('hl=')) {
                            // Add language parameter to Google Docs/Slides URL
                            const separator = iframe.src.includes('?') ? '&' : '?';
                            iframe.src = iframe.src + separator + 'hl=' + langMap[targetLang];
                            log('Updated Google Slides URL with language parameter:', targetLang);
                        }
                    }
                    
                    // Handle Slides.com embeds - limited options
                    if (iframe.src && iframe.src.includes('slides.com')) {
                        // Mark for special handling
                        iframe.setAttribute('data-translate-attempt', 'true');
                        iframe.setAttribute('data-target-lang', targetLang);
                        
                        // Add a translation notice/button overlay
                        if (!iframe.parentElement.querySelector('.slides-translate-notice')) {
                            addSlidesTranslationNotice(iframe, targetLang);
                        }
                        
                        log('Slides.com embed detected - added translation notice');
                    }
                }
            });
            
            // Handle embedded PDFs and other objects
            const embeds = document.querySelectorAll('embed, object');
            embeds.forEach(embed => {
                // Remove notranslate class if present
                embed.className = embed.className.replace('notranslate', '');
            });
        }
        
        // Initialize the header
        function init() {
            log('Starting General Header initialization...');
            
            // ROBUST FIX: Disable Universal Redirect when user is logged in and navigating
            // Check if user is logged in
            const userType = getUserType();
            const currentPath = window.location.hash;
            
            // If user is logged in and not on home/login page, disable Universal Redirect
            if (userType && !currentPath.includes('#home/') && currentPath !== '#home' && currentPath !== '') {
                // User is logged in and on a page other than login
                window._universalRedirectCompleted = true;
                window._bypassUniversalRedirect = true;
                sessionStorage.setItem('universalRedirectCompleted', 'true');
                
                // Kill any Universal Redirect timers if they exist
                if (window._universalRedirectTimer) {
                    clearInterval(window._universalRedirectTimer);
                    clearTimeout(window._universalRedirectTimer);
                    window._universalRedirectTimer = null;
                    log('Killed Universal Redirect timer - user is already logged in and navigated');
                }
                
                // Set up a periodic check to keep Universal Redirect disabled
                if (!window._universalRedirectKiller) {
                    let checkCount = 0;
                    window._universalRedirectKiller = setInterval(() => {
                        checkCount++;
                        
                        // Kill timers if they exist
                        if (window._universalRedirectTimer) {
                            clearInterval(window._universalRedirectTimer);
                            clearTimeout(window._universalRedirectTimer);
                            window._universalRedirectTimer = null;
                            log('Killed Universal Redirect timer (periodic check)');
                        }
                        
                        // Ensure flags stay set
                        window._universalRedirectCompleted = true;
                        window._bypassUniversalRedirect = true;
                        sessionStorage.setItem('universalRedirectCompleted', 'true');
                        
                        // Stop after 60 checks (60 seconds)
                        if (checkCount >= 60) {
                            clearInterval(window._universalRedirectKiller);
                            window._universalRedirectKiller = null;
                            log('Stopped Universal Redirect killer after 60 seconds');
                        }
                    }, 1000); // Check every second
                }
            }
            
            // Also disable Universal Redirect if we're on a Resource Portal specific page
            if (currentPath.includes('#resource-staff-management') || 
                currentPath.includes('#tutor-activities/resources-levels') ||
                currentPath.includes('scene_1272') || 
                currentPath.includes('scene_481')) {
                window._universalRedirectCompleted = true;
                window._bypassUniversalRedirect = true;
                sessionStorage.setItem('universalRedirectCompleted', 'true');
                log('On Resource Portal specific page, disabled Universal Redirect');
            }
            
            // Check if we're on a login page
            const loginScenes = ['scene_1', 'scene_2', 'scene_3', 'scene_4', 'scene_5']; // Add your actual login scene IDs
            const loginPages = ['login', 'sign-in', 'register', 'forgot-password'];
            const currentUrl = window.location.href.toLowerCase();
            
            const isLoginPage = loginScenes.includes(currentScene) || 
                               loginPages.some(page => currentUrl.includes(page));
            
            // Also check for home page redirect
            $(document).on('knack-scene-render.scene_1', function() {
                // If we're on the home/login page and we came from a logout
                if (window.location.hash === '#home/' || window.location.hash === '#home' || 
                    window.location.pathname.endsWith('/vespa-academy/') ||
                    window.location.pathname.endsWith('/vespa-academy')) {
                    log('On home page after potential logout');
                    // Ensure header is removed
                    const existingHeader = document.getElementById('vespaGeneralHeader');
                    if (existingHeader) {
                        existingHeader.remove();
                        document.body.classList.remove('has-general-header-enhanced');
                        document.body.style.paddingTop = '';
                    }
                }
            });
            
            if (isLoginPage) {
                log('On login page, not showing header');
                return;
            }
            
            // Inject header immediately for scenes with loading screens, with delay for others
            if (currentScene === 'scene_1014' || currentScene === 'scene_1095') {
                // For scenes with loading screen, inject immediately
                injectHeader();
                // Translation widget removed - can be added later if needed
            } else {
                // For other scenes, slight delay to allow other apps to load
                setTimeout(() => {
                    injectHeader();
                    // Translation widget removed - can be added later if needed
                }, 250);
            }
            
            // Re-inject on scene changes in case it gets removed - BUT ONLY IF HEADER IS MISSING
            $(document).on('knack-scene-render.any', function(event, scene) {
                log('Scene rendered, checking header...', scene.key);
                
                // AGGRESSIVE CLEANUP: If scene changed, clean up previous page content
                if (lastScene && lastScene !== scene.key) {
                    log(`Scene changed from ${lastScene} to ${scene.key} - performing cleanup`);
                    cleanupPageContent(scene.key);
                }
                lastScene = scene.key;
                
                // Check if this is a login scene
                const isNowLoginPage = loginScenes.includes(scene.key) || 
                                      loginPages.some(page => window.location.href.toLowerCase().includes(page));
                
                if (isNowLoginPage) {
                    log('Navigated to login page, removing header');
                    const existingHeader = document.getElementById('vespaGeneralHeader');
                    if (existingHeader) existingHeader.remove();
                    document.body.classList.remove('has-general-header-enhanced');
                    document.body.style.paddingTop = '';
                    // Clear the global loaded flag
                    window._generalHeaderLoaded = false;
                    return;
                }
                
                // ALWAYS check for translation widget on non-login pages
                const existingHeader = document.getElementById('vespaGeneralHeader');
                if (!existingHeader) {
                    const userType = getUserType();
                    if (userType) {
                        log('Header missing and user logged in, re-injecting after delay');
                        // Longer delay for scene changes to ensure other apps load first
                        setTimeout(() => {
                            // Double-check header is still missing before injecting
                            if (!document.getElementById('vespaGeneralHeader')) {
                                injectHeader();
                                // Translation widget removed - can be added later if needed
                            }
                        }, 300);
                    }
                } else {
                    log('Header exists');
                    // Translation widget removed - can be added later if needed
                    setTimeout(() => {
                        // Re-apply permanent header offset after scene settles
                        applyFixedHeaderOffset();
                    }, 1000); // Give page time to settle
                }
            });
            
            // Listen for logout events
            $(document).on('knack-user-logout.any', function() {
                log('User logged out, removing header and clearing flag');
                const existingHeader = document.getElementById('vespaGeneralHeader');
                if (existingHeader) existingHeader.remove();
                document.body.classList.remove('has-general-header-enhanced');
                document.body.style.paddingTop = '';
                // Clear the global loaded flag
                window._generalHeaderLoaded = false;
                // Clear session storage flag
                sessionStorage.removeItem('_generalHeaderLoadedSession');
                // Clear ALL translation preferences on logout
                localStorage.removeItem('vespaPreferredLanguage');
                sessionStorage.removeItem('vespaTranslationActive');
                sessionStorage.removeItem('vespaTranslationDisabled');
                log('Cleared all translation preferences on logout');
                
                // Since we navigate BEFORE logout, user should already be on home page
                log('Logout complete - user should already be on home page');
            });
        }
        
        // Global cleanup function for role selection modals
        window.cleanupRoleSelectionModal = function() {
            const existingModal = document.getElementById('roleSelectionModal');
            if (existingModal) {
                existingModal.remove();
            }
            const existingStyles = document.getElementById('roleSelectionModalStyles');
            if (existingStyles) {
                existingStyles.remove();
            }
            // Reset modal flag
            window._roleModalShowing = false;
        };
        
        // Global function to clear translation preferences (useful for debugging)
        window.clearTranslationPreferences = function() {
            // Clear all storage
            localStorage.removeItem('vespaPreferredLanguage');
            sessionStorage.removeItem('vespaTranslationActive');
            sessionStorage.removeItem('vespaTranslationDisabled');
            
            // Switch back to English if currently translated
            const selector = document.querySelector('.goog-te-combo');
            if (selector && selector.value !== 'en') {
                selector.value = 'en';
                const evt = document.createEvent('HTMLEvents');
                evt.initEvent('change', false, true);
                selector.dispatchEvent(evt);
            }
            
            // Hide clear button if it exists
            const clearButton = document.querySelector('.translation-clear-button');
            if (clearButton) {
                clearButton.style.display = 'none';
            }
            
            console.log('[General Header] Translation preferences cleared. Page will load in English on next visit.');
            return 'Translation preferences cleared';
        };
        
        // Start initialization
        init();
    }
    
    // Export the initializer function
    window.initializeGeneralHeader = initializeGeneralHeader;
    
    // Global function for homepage apps to check if they should skip loading
    window.shouldSkipHomepageLoad = function() {
        // Check various flags that indicate homepage should not load
        if (window._blockHomepageLoad || 
            window._skipHomepageRender || 
            window._navigationInProgress ||
            window._headerNavigationActive ||
            sessionStorage.getItem('blockHomepageLoad') === 'true' ||
            sessionStorage.getItem('skipHomepageRender') === 'true' ||
            sessionStorage.getItem('navigatingToScene')) {
            
            const targetScene = sessionStorage.getItem('navigatingToScene') || window._navigatingToScene;
            console.log('[General Header] Homepage load should be skipped. Navigating to:', targetScene);
            return true;
        }
        return false;
    };
    
    // Only show setup complete message if debug mode is enabled
    if (window.GENERAL_HEADER_CONFIG && window.GENERAL_HEADER_CONFIG.debugMode) {
        console.log('[General Header] Script setup complete, initializer function ready');
    }
})();
