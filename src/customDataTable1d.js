/**
 * VESPA Custom Data Table Module v1a
 * For mid-year KS5 subject data updates
 * Standalone module that can be loaded via Knack Multi-App Loader
 */

(function() {
    const VERSION = "1a";
    const DEBUG_MODE = true;
    
    // Debug logging helper
    function debugLog(title, data, level = 'info') {
        if (!DEBUG_MODE) return;
        
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const colors = {
            info: 'color: #007bff; font-weight: bold',
            warn: 'color: #ff9800; font-weight: bold',
            error: 'color: #f44336; font-weight: bold',
            success: 'color: #4caf50; font-weight: bold'
        };
        
        console.log(`%c[VESPA DataTable ${timestamp}] ${title}`, colors[level]);
        if (data !== undefined) {
            console.log(data);
        }
    }

    /**
     * Custom Data Table Class
     */
    class VESPADataTable {
        constructor(containerId, options = {}) {
            this.container = document.getElementById(containerId);
            if (!this.container) {
                throw new Error(`Container with ID ${containerId} not found`);
            }
            
            this.data = [];
            this.filteredData = [];
            this.changes = new Map();
            this.sortColumn = null;
            this.sortDirection = 'asc';
            this.filters = {};
            
            this.options = {
                editable: true,
                pageSize: 50,
                apiUrl: options.apiUrl || '/api',
                customerId: options.customerId,
                ...options
            };
            
            this.currentPage = 1;
            this.init();
        }
        
        init() {
            this.container.innerHTML = `
                <div class="vespa-table-container">
                    <div class="vespa-table-controls">
                        <div class="vespa-search-filters">
                            <input type="text" id="vespa-global-search" placeholder="Search all fields..." class="vespa-global-search">
                            <select id="vespa-year-filter" class="vespa-filter-select">
                                <option value="">All Year Groups</option>
                                <option value="12">Year 12</option>
                                <option value="13">Year 13</option>
                            </select>
                            <select id="vespa-subject-filter" class="vespa-filter-select">
                                <option value="">All Subjects</option>
                            </select>
                            <select id="vespa-group-filter" class="vespa-filter-select">
                                <option value="">All Groups</option>
                            </select>
                        </div>
                        <div class="vespa-table-actions">
                            <button class="vespa-btn vespa-btn-primary" onclick="vespaTable.exportToCSV()">
                                <span class="vespa-icon">📥</span> Export CSV
                            </button>
                            <button class="vespa-btn vespa-btn-primary" onclick="document.getElementById('vespa-csv-import').click()">
                                <span class="vespa-icon">📤</span> Import CSV
                            </button>
                            <input type="file" id="vespa-csv-import" accept=".csv" style="display:none;" onchange="vespaTable.importCSV(this)">
                            <button class="vespa-btn vespa-btn-success" onclick="vespaTable.saveChanges()" id="vespa-save-btn" style="display:none;">
                                <span class="vespa-icon">💾</span> Save Changes (<span id="vespa-change-count">0</span>)
                            </button>
                        </div>
                    </div>
                    <div class="vespa-table-info">
                        <span id="vespa-record-count">0 records</span>
                        <span id="vespa-filter-info"></span>
                    </div>
                    <div class="vespa-table-wrapper">
                        <table id="vespaDataTable" class="vespa-data-table">
                            <thead></thead>
                            <tbody></tbody>
                        </table>
                    </div>
                    <div class="vespa-table-pagination">
                        <button onclick="vespaTable.previousPage()" id="vespa-prev-btn">Previous</button>
                        <span id="vespa-page-info">Page 1 of 1</span>
                        <button onclick="vespaTable.nextPage()" id="vespa-next-btn">Next</button>
                    </div>
                </div>
            `;
            
            this.attachEventListeners();
            this.addStyles();
        }
        
        addStyles() {
            if (document.getElementById('vespa-datatable-styles')) return;
            
            const style = document.createElement('style');
            style.id = 'vespa-datatable-styles';
            style.textContent = `
                .vespa-table-container {
                    background: #fff;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    padding: 20px;
                    margin: 20px 0;
                }
                
                .vespa-table-controls {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    flex-wrap: wrap;
                    gap: 15px;
                }
                
                .vespa-search-filters {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    align-items: center;
                }
                
                .vespa-global-search {
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    width: 250px;
                    font-size: 14px;
                }
                
                .vespa-filter-select {
                    padding: 8px 12px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 14px;
                    background: white;
                }
                
                .vespa-table-actions {
                    display: flex;
                    gap: 10px;
                    align-items: center;
                }
                
                .vespa-btn {
                    padding: 8px 16px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    transition: all 0.2s;
                }
                
                .vespa-btn-primary {
                    background: #007bff;
                    color: white;
                }
                
                .vespa-btn-primary:hover {
                    background: #0056b3;
                }
                
                .vespa-btn-success {
                    background: #28a745;
                    color: white;
                }
                
                .vespa-btn-success:hover {
                    background: #218838;
                }
                
                .vespa-table-info {
                    margin-bottom: 10px;
                    color: #666;
                    font-size: 14px;
                }
                
                .vespa-table-wrapper {
                    overflow-x: auto;
                    margin-bottom: 20px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                }
                
                .vespa-data-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 14px;
                }
                
                .vespa-data-table thead {
                    background: #f8f9fa;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                
                .vespa-data-table th {
                    padding: 12px;
                    text-align: left;
                    font-weight: 600;
                    border-bottom: 2px solid #dee2e6;
                    white-space: nowrap;
                    cursor: pointer;
                    user-select: none;
                }
                
                .vespa-data-table th.sortable:hover {
                    background: #e9ecef;
                }
                
                .vespa-data-table tbody tr {
                    border-bottom: 1px solid #dee2e6;
                    transition: background 0.2s;
                }
                
                .vespa-data-table tbody tr:hover {
                    background: #f8f9fa;
                }
                
                .vespa-data-table tbody tr.modified {
                    background: #fff3cd;
                }
                
                .vespa-data-table td {
                    padding: 10px 12px;
                    vertical-align: middle;
                }
                
                .vespa-grade-input,
                .vespa-notes-input {
                    width: 100%;
                    padding: 6px 8px;
                    border: 1px solid #ddd;
                    border-radius: 3px;
                    font-size: 13px;
                    transition: border-color 0.2s;
                }
                
                .vespa-grade-input {
                    width: 80px;
                    text-align: center;
                }
                
                .vespa-notes-input {
                    min-width: 150px;
                }
                
                .vespa-grade-input:focus,
                .vespa-notes-input:focus {
                    outline: none;
                    border-color: #007bff;
                    box-shadow: 0 0 0 2px rgba(0,123,255,0.1);
                }
                
                .vespa-attendance-input {
                    width: 60px;
                    padding: 4px 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                }
                
                .vespa-data-table select {
                    padding: 4px 8px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                    min-width: 80px;
                }
                
                .vespa-table-pagination {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 15px;
                }
                
                .vespa-table-pagination button {
                    padding: 6px 12px;
                    border: 1px solid #ddd;
                    background: white;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.2s;
                }
                
                .vespa-table-pagination button:hover:not(:disabled) {
                    background: #f8f9fa;
                    border-color: #007bff;
                }
                
                .vespa-table-pagination button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .vespa-meg-cell {
                    font-weight: 600;
                    color: #007bff;
                    text-align: center;
                }
                
                .vespa-btn-sm {
                    padding: 4px 8px;
                    font-size: 12px;
                }
                
                .vespa-btn-danger {
                    background: #dc3545;
                    color: white;
                }
                
                @media (max-width: 768px) {
                    .vespa-table-controls {
                        flex-direction: column;
                        align-items: stretch;
                    }
                    
                    .vespa-search-filters,
                    .vespa-table-actions {
                        flex-direction: column;
                        width: 100%;
                    }
                    
                    .vespa-global-search {
                        width: 100%;
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        attachEventListeners() {
            // Global search
            document.getElementById('vespa-global-search').addEventListener('input', (e) => {
                this.filters.search = e.target.value;
                this.applyFilters();
            });
            
            // Year filter
            document.getElementById('vespa-year-filter').addEventListener('change', (e) => {
                this.filters.yearGroup = e.target.value;
                this.applyFilters();
            });
            
            // Subject filter
            document.getElementById('vespa-subject-filter').addEventListener('change', (e) => {
                this.filters.subject = e.target.value;
                this.applyFilters();
            });
            
            // Group filter - ADDED
            document.getElementById('vespa-group-filter').addEventListener('change', (e) => {
                this.filters.group = e.target.value;
                this.applyFilters();
            });
        }
        
        async loadData(customerId, yearGroup = null) {
            try {
                this.showLoading();
                
                // Ensure no double slashes in URL construction
                const baseUrl = this.options.apiUrl.endsWith('/') 
                    ? this.options.apiUrl.slice(0, -1) 
                    : this.options.apiUrl;
                let url = `${baseUrl}/academic-data/ks5-subjects?customerId=${customerId}`;
                if (yearGroup) url += `&yearGroup=${yearGroup}`;
                
                debugLog('Fetching KS5 subjects from:', url);
                
                const response = await fetch(url);
                const result = await response.json();
                
                if (result.success) {
                    this.data = result.subjects || [];
                    this.filteredData = [...this.data];
                    
                    this.populateSubjectFilter();
                    this.populateGroupFilter(); // ADDED
                    this.render();
                    this.updateRecordCount();
                    
                    debugLog(`Loaded ${this.data.length} KS5 subject records`, null, 'success');
                } else {
                    throw new Error(result.message || 'Failed to load data');
                }
                
            } catch (error) {
                debugLog('Error loading data', error, 'error');
                this.showError('Failed to load subject data: ' + error.message);
            }
        }
        
        populateSubjectFilter() {
            const subjects = [...new Set(this.data.map(row => row.subject))].sort();
            const select = document.getElementById('vespa-subject-filter');
            select.innerHTML = '<option value="">All Subjects</option>';
            subjects.forEach(subject => {
                const option = document.createElement('option');
                option.value = subject;
                option.textContent = subject;
                select.appendChild(option);
            });
        }
        
        populateGroupFilter() {
            const groups = [...new Set(this.data.map(row => row.group).filter(g => g))].sort();
            const select = document.getElementById('vespa-group-filter');
            select.innerHTML = '<option value="">All Groups</option>';
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group;
                option.textContent = group;
                select.appendChild(option);
            });
        }
        
        render() {
            const table = document.getElementById('vespaDataTable');
            const thead = table.querySelector('thead');
            const tbody = table.querySelector('tbody');
            
            // Render header
            thead.innerHTML = `
                <tr>
                    <th onclick="vespaTable.sort('studentName')" class="sortable">
                        Student Name <span class="vespa-sort-icon">↕</span>
                    </th>
                    <th onclick="vespaTable.sort('uln')" class="sortable">
                        ULN <span class="vespa-sort-icon">↕</span>
                    </th>
                    <th onclick="vespaTable.sort('subject')" class="sortable">
                        Subject <span class="vespa-sort-icon">↕</span>
                    </th>
                    <th>Qualification</th>
                    <th>Qual Level</th>
                    <th>Exam Board</th>
                    <th onclick="vespaTable.sort('academicYear')" class="sortable">
                        Academic Year <span class="vespa-sort-icon">↕</span>
                    </th>
                    <th onclick="vespaTable.sort('priorAttainment')" class="sortable">
                        Prior Att. <span class="vespa-sort-icon">↕</span>
                    </th>
                    <th>ALPS Band</th>
                    <th onclick="vespaTable.sort('meg')" class="sortable">
                        MEG <span class="vespa-sort-icon">↕</span>
                    </th>
                    <th onclick="vespaTable.sort('stg')" class="sortable">
                        STG <span class="vespa-sort-icon">↕</span>
                    </th>
                    <th>Current Grade</th>
                    <th>Target Grade</th>
                    <th>Effort</th>
                    <th>Behaviour</th>
                    <th>Attendance %</th>
                    <th>Notes</th>
                    <th>Actions</th>
                </tr>
            `;
            
            // Calculate pagination
            const startIndex = (this.currentPage - 1) * this.options.pageSize;
            const endIndex = startIndex + this.options.pageSize;
            const pageData = this.filteredData.slice(startIndex, endIndex);
            
            // Render rows
            tbody.innerHTML = pageData.map(row => {
                const hasChanges = this.changes.has(row.id);
                const rowClass = hasChanges ? 'modified' : '';
                
                return `
                    <tr data-id="${row.id}" class="${rowClass}">
                        <td>${row.studentName}</td>
                        <td>${row.uln || '-'}</td>
                        <td>${row.subject}</td>
                        <td>${row.qualification || '-'}</td>
                        <td>${row.qualificationLevel || '-'}</td>
                        <td>
                            ${this.options.editable ? 
                                `<select data-field="examBoard" onchange="vespaTable.updateField('${row.id}', 'examBoard', this.value)">
                                    <option value="">Select...</option>
                                    <option value="AQA" ${row.examBoard === 'AQA' ? 'selected' : ''}>AQA</option>
                                    <option value="Edexcel" ${row.examBoard === 'Edexcel' ? 'selected' : ''}>Edexcel</option>
                                    <option value="OCR" ${row.examBoard === 'OCR' ? 'selected' : ''}>OCR</option>
                                    <option value="WJEC" ${row.examBoard === 'WJEC' ? 'selected' : ''}>WJEC</option>
                                </select>` : 
                                row.examBoard || '-'
                            }
                        </td>
                        <td>${row.academicYear || '-'}</td>
                        <td>${row.priorAttainment || '-'}</td>
                        <td>${row.alpsBand || '-'}</td>
                        <td class="vespa-meg-cell">${row.meg || '-'}</td>
                        <td>
                            ${this.options.editable ? 
                                `<input type="text" 
                                    value="${row.stg || ''}" 
                                    data-field="stg" 
                                    onchange="vespaTable.updateField('${row.id}', 'stg', this.value)"
                                    placeholder="STG"
                                    class="vespa-grade-input">` : 
                                row.stg || '-'
                            }
                        </td>
                        <td>
                            ${this.options.editable ? 
                                `<input type="text" 
                                    value="${row.currentGrade || ''}" 
                                    data-field="currentGrade" 
                                    onchange="vespaTable.updateField('${row.id}', 'currentGrade', this.value)"
                                    placeholder="CG"
                                    class="vespa-grade-input">` : 
                                row.currentGrade || '-'
                            }
                        </td>
                        <td>
                            ${this.options.editable ? 
                                `<input type="text" 
                                    value="${row.targetGrade || ''}" 
                                    data-field="targetGrade" 
                                    onchange="vespaTable.updateField('${row.id}', 'targetGrade', this.value)"
                                    placeholder="TG"
                                    class="vespa-grade-input">` : 
                                row.targetGrade || '-'
                            }
                        </td>
                        <td>
                            ${this.options.editable ? 
                                `<select data-field="effortGrade" onchange="vespaTable.updateField('${row.id}', 'effortGrade', this.value)">
                                    <option value="">-</option>
                                    <option value="1" ${row.effortGrade === '1' ? 'selected' : ''}>1</option>
                                    <option value="2" ${row.effortGrade === '2' ? 'selected' : ''}>2</option>
                                    <option value="3" ${row.effortGrade === '3' ? 'selected' : ''}>3</option>
                                    <option value="4" ${row.effortGrade === '4' ? 'selected' : ''}>4</option>
                                </select>` : 
                                row.effortGrade || '-'
                            }
                        </td>
                        <td>
                            ${this.options.editable ? 
                                `<select data-field="behaviourGrade" onchange="vespaTable.updateField('${row.id}', 'behaviourGrade', this.value)">
                                    <option value="">-</option>
                                    <option value="1" ${row.behaviourGrade === '1' ? 'selected' : ''}>1</option>
                                    <option value="2" ${row.behaviourGrade === '2' ? 'selected' : ''}>2</option>
                                    <option value="3" ${row.behaviourGrade === '3' ? 'selected' : ''}>3</option>
                                    <option value="4" ${row.behaviourGrade === '4' ? 'selected' : ''}>4</option>
                                </select>` : 
                                row.behaviourGrade || '-'
                            }
                        </td>
                        <td>
                            ${this.options.editable ? 
                                `<input type="number" 
                                    value="${row.attendance || ''}" 
                                    data-field="attendance" 
                                    onchange="vespaTable.updateField('${row.id}', 'attendance', this.value)"
                                    placeholder="%"
                                    min="0" max="100"
                                    class="vespa-attendance-input">` : 
                                row.attendance ? row.attendance + '%' : '-'
                            }
                        </td>
                        <td>
                            ${this.options.editable ? 
                                `<input type="text" 
                                    value="${row.notes || ''}" 
                                    data-field="notes" 
                                    onchange="vespaTable.updateField('${row.id}', 'notes', this.value)"
                                    placeholder="Add notes..."
                                    class="vespa-notes-input">` : 
                                row.notes || ''
                            }
                        </td>
                        <td>
                            ${hasChanges ? 
                                `<button class="vespa-btn vespa-btn-sm vespa-btn-danger" onclick="vespaTable.revertChanges('${row.id}')">
                                    ↺ Undo
                                </button>` : 
                                ''
                            }
                        </td>
                    </tr>
                `;
            }).join('');
            
            this.updatePagination();
        }
        
        updateField(recordId, field, value) {
            const record = this.data.find(r => r.id === recordId);
            if (!record) return;
            
            if (!this.changes.has(recordId)) {
                this.changes.set(recordId, {
                    id: recordId,
                    studentName: record.studentName,
                    original: { ...record }
                });
            }
            
            const changes = this.changes.get(recordId);
            changes[field] = value;
            
            record[field] = value;
            
            this.updateChangeCount();
            document.querySelector(`tr[data-id="${recordId}"]`).classList.add('modified');
        }
        
        revertChanges(recordId) {
            const changes = this.changes.get(recordId);
            if (!changes) return;
            
            const record = this.data.find(r => r.id === recordId);
            Object.assign(record, changes.original);
            
            this.changes.delete(recordId);
            
            this.render();
            this.updateChangeCount();
        }
        
        updateChangeCount() {
            const count = this.changes.size;
            document.getElementById('vespa-change-count').textContent = count;
            document.getElementById('vespa-save-btn').style.display = count > 0 ? 'inline-flex' : 'none';
        }
        
        async saveChanges() {
            if (this.changes.size === 0) return;
            
            const updates = Array.from(this.changes.values()).map(change => {
                const update = { id: change.id, studentName: change.studentName };
                
                ['currentGrade', 'targetGrade', 'notes', 'examBoard'].forEach(field => {
                    if (field in change && change[field] !== change.original[field]) {
                        update[field] = change[field];
                    }
                });
                
                return update;
            });
            
            try {
                this.showLoading('Saving changes...');
                
                // Ensure no double slashes in URL construction
                const baseUrl = this.options.apiUrl.endsWith('/') 
                    ? this.options.apiUrl.slice(0, -1) 
                    : this.options.apiUrl;
                const updateUrl = `${baseUrl}/academic-data/update-ks5-subjects`;
                
                debugLog('Updating KS5 subjects at:', updateUrl);
                debugLog('Update payload:', { updates });
                
                const response = await fetch(updateUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ updates })
                });
                
                const result = await response.json();
                
                if (result.successful > 0) {
                    this.showSuccess(`Successfully updated ${result.successful} records`);
                    this.changes.clear();
                    this.updateChangeCount();
                    this.render();
                }
                
                if (result.errors && result.errors.length > 0) {
                    this.showError(`Failed to update ${result.errors.length} records`);
                }
                
            } catch (error) {
                debugLog('Error saving changes', error, 'error');
                this.showError('Failed to save changes: ' + error.message);
            }
        }
        
        applyFilters() {
            this.filteredData = this.data.filter(row => {
                if (this.filters.search) {
                    const searchTerm = this.filters.search.toLowerCase();
                    const searchFields = [
                        row.studentName,
                        row.uln,
                        row.studentEmail,
                        row.uci,
                        row.upn,
                        row.subject,
                        row.qualification,
                        row.qualificationLevel,
                        row.examBoard,
                        row.academicYear,
                        row.yearGroup,
                        row.group,
                        row.meg,
                        row.stg,
                        row.currentGrade,
                        row.targetGrade,
                        row.notes,
                        row.alpsBand,
                        row.priorAttainment,
                        row.effortGrade,
                        row.behaviourGrade,
                        row.attendance
                    ];
                    
                    const matchesSearch = searchFields.some(field => 
                        field && field.toString().toLowerCase().includes(searchTerm)
                    );
                    
                    if (!matchesSearch) {
                        return false;
                    }
                }
                
                if (this.filters.yearGroup && row.yearGroup !== this.filters.yearGroup) {
                    return false;
                }
                
                if (this.filters.subject && row.subject !== this.filters.subject) {
                    return false;
                }
                
                // Add group filter
                if (this.filters.group && row.group !== this.filters.group) {
                    return false;
                }
                
                return true;
            });
            
            this.currentPage = 1;
            this.render();
            this.updateRecordCount();
        }
        
        sort(column) {
            if (this.sortColumn === column) {
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortColumn = column;
                this.sortDirection = 'asc';
            }
            
            this.filteredData.sort((a, b) => {
                let valA = a[column] || '';
                let valB = b[column] || '';
                
                if (typeof valA === 'string') {
                    valA = valA.toLowerCase();
                    valB = valB.toLowerCase();
                }
                
                if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
                if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
            
            this.render();
        }
        
        exportToCSV() {
            const headers = [
                'Student Name',
                'ULN',
                'Subject',
                'Qualification',
                'Qualification Level',
                'Exam Board',
                'Academic Year',
                'Year Group',
                'Group',
                'Prior Attainment',
                'ALPS Band',
                'MEG',
                'STG',
                'Current Grade',
                'Target Grade',
                'Effort Grade',
                'Behaviour Grade',
                'Attendance %',
                'Notes'
            ];
            
            const rows = this.filteredData.map(row => [
                row.studentName,
                row.uln || '',
                row.subject,
                row.qualification || '',
                row.qualificationLevel || '',
                row.examBoard || '',
                row.academicYear || '',
                row.yearGroup || '',
                row.group || '',
                row.priorAttainment || '',
                row.alpsBand || '',
                row.meg || '',
                row.stg || '',
                row.currentGrade || '',
                row.targetGrade || '',
                row.effortGrade || '',
                row.behaviourGrade || '',
                row.attendance || '',
                row.notes || ''
            ]);
            
            const csv = [headers, ...rows]
                .map(row => row.map(cell => `"${cell}"`).join(','))
                .join('\n');
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ks5_subject_data_${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        }
        
        async importCSV(input) {
            const file = input.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const csv = e.target.result;
                    const lines = csv.split('\n');
                    const headers = lines[0].split(',').map(h => h.trim());
                    
                    const fieldMap = {
                        'Student Name': 'studentName',
                        'ULN': 'uln',
                        'Subject': 'subject',
                        'Qualification': 'qualification',
                        'Qualification Level': 'qualificationLevel',
                        'Exam Board': 'examBoard',
                        'Academic Year': 'academicYear',
                        'Year Group': 'yearGroup',
                        'Group': 'group',
                        'Prior Attainment': 'priorAttainment',
                        'ALPS Band': 'alpsBand',
                        'MEG': 'meg',
                        'STG': 'stg',
                        'Current Grade': 'currentGrade',
                        'Target Grade': 'targetGrade',
                        'Effort Grade': 'effortGrade',
                        'Behaviour Grade': 'behaviourGrade',
                        'Attendance %': 'attendance',
                        'Notes': 'notes'
                    };
                    
                    const updates = [];
                    
                    for (let i = 1; i < lines.length; i++) {
                        if (!lines[i].trim()) continue;
                        
                        const values = this.parseCSVLine(lines[i]);
                        const update = {};
                        
                        headers.forEach((header, index) => {
                            if (fieldMap[header]) {
                                update[fieldMap[header]] = values[index] || '';
                            }
                        });
                        
                        const record = this.data.find(r => 
                            r.studentName === update.studentName
                        );
                        
                        if (record) {
                            update.id = record.id;
                            updates.push(update);
                        }
                    }
                    
                    if (updates.length > 0) {
                        updates.forEach(update => {
                            this.updateField(update.id, 'currentGrade', update.currentGrade);
                            this.updateField(update.id, 'targetGrade', update.targetGrade);
                            this.updateField(update.id, 'examBoard', update.examBoard);
                            this.updateField(update.id, 'notes', update.notes);
                        });
                        
                        this.render();
                        this.showSuccess(`Imported ${updates.length} records. Click "Save Changes" to apply.`);
                    } else {
                        this.showError('No matching records found in the CSV');
                    }
                    
                } catch (error) {
                    debugLog('Error importing CSV', error, 'error');
                    this.showError('Failed to import CSV file');
                }
            };
            
            reader.readAsText(file);
            input.value = '';
        }
        
        parseCSVLine(line) {
            const values = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    values.push(current.trim());
                    current = '';
                } else {
                    current += char;
                }
            }
            
            values.push(current.trim());
            return values;
        }
        
        updatePagination() {
            const totalPages = Math.ceil(this.filteredData.length / this.options.pageSize);
            document.getElementById('vespa-page-info').textContent = `Page ${this.currentPage} of ${totalPages}`;
            document.getElementById('vespa-prev-btn').disabled = this.currentPage === 1;
            document.getElementById('vespa-next-btn').disabled = this.currentPage === totalPages;
        }
        
        previousPage() {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.render();
            }
        }
        
        nextPage() {
            const totalPages = Math.ceil(this.filteredData.length / this.options.pageSize);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.render();
            }
        }
        
        updateRecordCount() {
            const total = this.data.length;
            const filtered = this.filteredData.length;
            
            document.getElementById('vespa-record-count').textContent = `${filtered} records`;
            
            if (filtered < total) {
                document.getElementById('vespa-filter-info').textContent = `(filtered from ${total} total)`;
            } else {
                document.getElementById('vespa-filter-info').textContent = '';
            }
        }
        
        showLoading(message = 'Loading...') {
            console.log(message);
            // TODO: Implement loading overlay
        }
        
        showSuccess(message) {
            console.log('Success:', message);
            alert(message); // TODO: Replace with better notification
        }
        
        showError(message) {
            console.error('Error:', message);
            alert('Error: ' + message); // TODO: Replace with better notification
        }
    }

    // Global variable for configuration - don't overwrite if it already exists
    if (typeof window.CUSTOM_DATATABLE_CONFIG === 'undefined') {
        window.CUSTOM_DATATABLE_CONFIG = null;
    }
    
    // Initialize function
    function initializeCustomDataTable() {
        debugLog("Initializing VESPA Custom Data Table", null, 'info');
        
        // Check both window and local variable
        const config = window.CUSTOM_DATATABLE_CONFIG;
        
        if (!config) {
            debugLog("No configuration found", null, 'error');
            debugLog("Checked window.CUSTOM_DATATABLE_CONFIG:", window.CUSTOM_DATATABLE_CONFIG);
            return;
        }
        
        const { elementSelector, customerId, apiUrl } = config;
        
        debugLog("Configuration loaded:", config, 'info');
        
        // Find the container
        const container = document.querySelector(elementSelector);
        if (!container) {
            debugLog(`Container not found: ${elementSelector}`, null, 'error');
            return;
        }
        
        // Create a div for the table
        const tableDiv = document.createElement('div');
        tableDiv.id = 'vespa-custom-table';
        container.appendChild(tableDiv);
        
        // Initialize the table
        window.vespaTable = new VESPADataTable('vespa-custom-table', {
            customerId: customerId,
            apiUrl: apiUrl
        });
        
        // Load data
        window.vespaTable.loadData(customerId);
        
        debugLog("Custom Data Table initialized successfully", null, 'success');
    }
    
    // Expose to global scope
    window.initializeCustomDataTable = initializeCustomDataTable;
    // Don't overwrite the configuration here
    
    debugLog("VESPA Custom Data Table module loaded", null, 'success');
    debugLog("Current configuration:", window.CUSTOM_DATATABLE_CONFIG, 'info');
})(); 
