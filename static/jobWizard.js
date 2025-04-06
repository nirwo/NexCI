// Job Wizard for unified Jenkins job viewing
class JobWizard {
    constructor() {
        // UI state
        this.currentStep = 0;
        this.steps = ['build', 'test', 'logs', 'timeline', 'summary'];
        this.isLoading = false;
        this.errorState = null;
        
        // Core data structure
        this.jobData = {
            jobName: null,
            buildNumber: null,
            buildUrl: null,
            buildStatus: null,
            buildDuration: null,
            buildTimestamp: null,
            
            // Cache for expensive data
            logContent: null,
            testResults: null,
            timelineSteps: null,
            
            // For tracking data load status
            dataLoaded: {
                builds: false,
                logs: false,
                tests: false,
                timeline: false
            }
        };
    }

    init() {
        this.setupEventListeners();
        this.updateNavigation();
    }

    setupEventListeners() {
        // Tab click handlers are set up in the dashboard.html script
    }

    setJob(jobName) {
        if (!jobName) return;
        
        this.jobData.jobName = jobName;
        this.currentStep = 0;
        this.loadJobData();
        this.updateNavigation();
        this.showStep(this.currentStep);
    }

    loadJobData() {
        this.showLoading();
        
        // Fetch job details
        fetch(`/api/job/${encodeURIComponent(this.jobData.jobName)}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                this.jobData = { ...this.jobData, ...data };
                this.updateBuildInfo();
                this.hideLoading();
            })
            .catch(error => {
                console.error('Error loading job data:', error);
                this.showError('Failed to load job data');
                this.hideLoading();
            });
    }

    updateBuildInfo() {
        const buildInfo = document.getElementById('build-info');
        if (!buildInfo) return;

        // Check if we have build data
        if (!this.jobData.buildNumber) {
            buildInfo.innerHTML = `
                <div class="alert alert-warning">
                    <h5>No Build Data Available</h5>
                    <p>This job has no build history or the build data could not be retrieved.</p>
                </div>
            `;
            return;
        }

        buildInfo.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Build Information</h5>
                    <p><strong>Job Name:</strong> ${this.jobData.jobName || 'N/A'}</p>
                    <p><strong>Build Number:</strong> ${this.jobData.buildNumber || 'N/A'}</p>
                    <p><strong>Status:</strong> <span class="badge ${this.getStatusClass()}">${this.jobData.buildStatus || 'N/A'}</span></p>
                    <p><strong>Duration:</strong> ${this.formatDuration(this.jobData.buildDuration)}</p>
                </div>
            </div>
        `;
    }

    getStatusClass() {
        switch (this.jobData.buildStatus) {
            case 'SUCCESS': return 'bg-success';
            case 'FAILURE': return 'bg-danger';
            case 'UNSTABLE': return 'bg-warning';
            case 'ABORTED': return 'bg-secondary';
            default: return 'bg-secondary';
        }
    }

    formatDuration(duration) {
        if (!duration) return 'N/A';
        const minutes = Math.floor(duration / 60000);
        const seconds = ((duration % 60000) / 1000).toFixed(0);
        return `${minutes}m ${seconds}s`;
    }

    showStep(stepIndex) {
        // Hide all steps
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.classList.remove('show', 'active');
        });

        // Show the selected step
        const stepId = `${this.steps[stepIndex]}-step`;
        const stepElement = document.getElementById(stepId);
        if (stepElement) {
            stepElement.classList.add('show', 'active');
        }

        // Update tabs
        document.querySelectorAll('#wizard-tabs .nav-link').forEach(tab => {
            tab.classList.remove('active');
        });
        const activeTab = document.getElementById(`${this.steps[stepIndex]}-tab`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        // Load step-specific content
        this.loadStepContent(stepIndex);
    }

    loadStepContent(stepIndex) {
        const step = this.steps[stepIndex];
        switch (step) {
            case 'build':
                this.updateBuildInfo();
                break;
            case 'test':
                this.loadTestResults();
                break;
            case 'logs':
                this.loadLogs();
                break;
            case 'timeline':
                this.loadTimeline();
                break;
            case 'summary':
                this.loadSummary();
                break;
        }
    }

    loadTestResults() {
        if (this.jobData.dataLoaded.tests) return;
        
        const testResults = document.getElementById('test-results');
        if (!testResults) return;

        // Check if build number is available
        if (!this.jobData.buildNumber) {
            testResults.innerHTML = '<div class="alert alert-warning">No build data available</div>';
            return;
        }

        this.showLoading();
        fetch(`/api/tests/${encodeURIComponent(this.jobData.jobName)}/${this.jobData.buildNumber}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                this.jobData.testResults = data;
                this.jobData.dataLoaded.tests = true;
                this.updateTestResults();
                this.hideLoading();
            })
            .catch(error => {
                console.error('Error loading test results:', error);
                testResults.innerHTML = '<div class="alert alert-danger">Failed to load test results</div>';
                this.hideLoading();
            });
    }

    loadLogs() {
        if (this.jobData.dataLoaded.logs) return;
        
        const logContent = document.getElementById('log-content');
        if (!logContent) return;

        // Check if build number is available
        if (!this.jobData.buildNumber) {
            logContent.innerHTML = '<div class="alert alert-warning">No build data available</div>';
            return;
        }

        this.showLoading();
        fetch(`/api/logs/${encodeURIComponent(this.jobData.jobName)}/${this.jobData.buildNumber}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.text();
            })
            .then(data => {
                this.jobData.logContent = data;
                this.jobData.dataLoaded.logs = true;
                logContent.textContent = data;
                this.hideLoading();
            })
            .catch(error => {
                console.error('Error loading logs:', error);
                logContent.innerHTML = '<div class="alert alert-danger">Failed to load logs</div>';
                this.hideLoading();
            });
    }

    loadTimeline() {
        if (this.jobData.dataLoaded.timeline) return;
        
        const timelineView = document.getElementById('timeline-view');
        if (!timelineView) return;

        // Check if build number is available
        if (!this.jobData.buildNumber) {
            timelineView.innerHTML = '<div class="alert alert-warning">No build data available</div>';
            return;
        }

        this.showLoading();
        fetch(`/api/timeline/${encodeURIComponent(this.jobData.jobName)}/${this.jobData.buildNumber}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                this.jobData.timelineSteps = data;
                this.jobData.dataLoaded.timeline = true;
                this.updateTimeline();
                this.hideLoading();
            })
            .catch(error => {
                console.error('Error loading timeline:', error);
                timelineView.innerHTML = '<div class="alert alert-danger">Failed to load timeline</div>';
                this.hideLoading();
            });
    }

    updateTimeline() {
        const timelineView = document.getElementById('timeline-view');
        if (!timelineView || !this.jobData.timelineSteps) return;

        const timelineHtml = this.jobData.timelineSteps.map(step => `
            <div class="timeline-item ${this.getTimelineItemClass(step.status)}">
                <div class="timeline-content">
                    <h6>${step.name}</h6>
                    <p>${step.description || ''}</p>
                    <span class="timeline-time">${this.formatDuration(step.duration)}</span>
                </div>
            </div>
        `).join('');

        timelineView.innerHTML = timelineHtml;
    }

    getTimelineItemClass(status) {
        switch (status) {
            case 'SUCCESS': return 'timeline-item-success';
            case 'FAILURE': return 'timeline-item-failure';
            case 'RUNNING': return 'timeline-item-running';
            default: return '';
        }
    }

    updateTestResults() {
        const testResults = document.getElementById('test-results');
        if (!testResults || !this.jobData.testResults) return;

        const results = this.jobData.testResults;
        testResults.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Test Results</h5>
                    <div class="test-summary mb-3">
                        <p><strong>Total Tests:</strong> ${results.total || 0}</p>
                        <p><strong>Passed:</strong> <span class="text-success">${results.passed || 0}</span></p>
                        <p><strong>Failed:</strong> <span class="text-danger">${results.failed || 0}</span></p>
                        <p><strong>Skipped:</strong> <span class="text-warning">${results.skipped || 0}</span></p>
                    </div>
                    ${this.renderTestDetails(results.details || [])}
                </div>
            </div>
        `;
    }

    renderTestDetails(details) {
        if (!details.length) return '<p>No test details available</p>';

        return `
            <div class="test-details">
                <h6>Test Details</h6>
                <div class="list-group">
                    ${details.map(test => `
                        <div class="list-group-item ${test.status === 'PASSED' ? 'list-group-item-success' : 'list-group-item-danger'}">
                            <h6 class="mb-1">${test.name}</h6>
                            <p class="mb-1">${test.description || ''}</p>
                            <small>Duration: ${this.formatDuration(test.duration)}</small>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    loadSummary() {
        const buildSummary = document.getElementById('build-summary');
        if (!buildSummary) return;

        // Check if we have build data
        if (!this.jobData.buildNumber) {
            buildSummary.innerHTML = `
                <div class="alert alert-warning">
                    <h5>No Build Data Available</h5>
                    <p>This job has no build history or the build data could not be retrieved.</p>
                </div>
            `;
            return;
        }

        buildSummary.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h5 class="card-title">Build Summary</h5>
                    <p><strong>Job Name:</strong> ${this.jobData.jobName || 'N/A'}</p>
                    <p><strong>Build Number:</strong> ${this.jobData.buildNumber || 'N/A'}</p>
                    <p><strong>Status:</strong> <span class="badge ${this.getStatusClass()}">${this.jobData.buildStatus || 'N/A'}</span></p>
                    <p><strong>Duration:</strong> ${this.formatDuration(this.jobData.buildDuration)}</p>
                    <p><strong>Test Results:</strong> ${this.getTestSummary()}</p>
                    ${this.renderTimelineSummary()}
                </div>
            </div>
        `;
    }

    renderTimelineSummary() {
        if (!this.jobData.timelineSteps) return '';

        return `
            <div class="timeline-summary mt-3">
                <h6>Build Timeline</h6>
                <div class="timeline-summary-items">
                    ${this.jobData.timelineSteps.map(step => `
                        <div class="timeline-summary-item">
                            <span class="badge ${this.getStatusClass(step.status)}">${step.name}</span>
                            <span class="timeline-duration">${this.formatDuration(step.duration)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    getTestSummary() {
        if (!this.jobData.testResults) return 'No test results available';
        const results = this.jobData.testResults;
        return `
            Total: ${results.total || 0},
            Passed: ${results.passed || 0},
            Failed: ${results.failed || 0},
            Skipped: ${results.skipped || 0}
        `;
    }

    updateNavigation() {
        const prevButton = document.getElementById('prev-step');
        const nextButton = document.getElementById('next-step');
        
        if (prevButton) {
            prevButton.disabled = this.currentStep === 0;
        }
        if (nextButton) {
            nextButton.disabled = this.currentStep === this.steps.length - 1;
        }
    }

    previousStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
            this.showStep(this.currentStep);
            this.updateNavigation();
        }
    }

    nextStep() {
        if (this.currentStep < this.steps.length - 1) {
            this.currentStep++;
            this.showStep(this.currentStep);
            this.updateNavigation();
        }
    }

    goToStep(stepName) {
        const stepIndex = this.steps.indexOf(stepName);
        if (stepIndex !== -1) {
            this.currentStep = stepIndex;
            this.showStep(stepIndex);
            this.updateNavigation();
        }
    }

    showLoading() {
        this.isLoading = true;
        const container = document.getElementById('job-wizard-container');
        if (container) {
            container.classList.add('wizard-loading');
        }
    }

    hideLoading() {
        this.isLoading = false;
        const container = document.getElementById('job-wizard-container');
        if (container) {
            container.classList.remove('wizard-loading');
        }
    }

    showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-danger mt-3';
        errorDiv.textContent = message;
        
        const container = document.getElementById('job-wizard-container');
        if (container) {
            container.appendChild(errorDiv);
            setTimeout(() => {
                container.removeChild(errorDiv);
            }, 5000);
        }
    }
}