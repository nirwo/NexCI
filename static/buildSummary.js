/**
 * Build Summary functionality for Jenkins Dashboard
 * Provides language detection, command analysis, and file operation summaries
 */

// Function to show the build summary area and hide other display areas
function showBuildSummary() {
    if (buildSummaryArea) {
        buildSummaryArea.style.display = 'block';
    }
    if (logDisplayArea) {
        logDisplayArea.style.display = 'none';
    }
    if (timelineArea) {
        timelineArea.style.display = 'none';
    }
    
    // If we don't have the log already, fetch it
    if (!latestBuildLog) {
        fetchAndDisplayBuildSummary();
    } else {
        processBuildSummary(latestBuildLog);
    }
}

// Fetch log content for build summary
async function fetchAndDisplayBuildSummary() {
    if (summaryLoadingIndicator) {
        summaryLoadingIndicator.style.display = 'block';
    }
    
    try {
        const response = await fetch(`/api/log?build_url=${encodeURIComponent(latestBuildUrl)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        
        const data = await response.json();
        let latestBuildLog = data.log_content || '';
        
        processBuildSummary(latestBuildLog);
    } catch (error) {
        console.error('Error fetching logs for summary:', error);
        showError(`Failed to load build summary: ${error.message}`, 'build');
    } finally {
        if (summaryLoadingIndicator) {
            summaryLoadingIndicator.style.display = 'none';
        }
    }
}

// Process log content to extract and display summary information
function processBuildSummary(logContent) {
    if (!logContent) {
        document.getElementById('language-badges').innerHTML = '<span class="badge bg-secondary">No log content available</span>';
        document.getElementById('longest-commands').innerHTML = '<tr><td colspan="3" class="text-center">No log content available</td></tr>';
        document.getElementById('file-operations-summary').innerHTML = '<p class="text-center">No log content available</p>';
        return;
    }
    
    // Detect job type and node information
    detectJobType(logContent);
    
    // Detect programming languages
    const languages = detectLanguages(logContent);
    displayLanguageBadges(languages);
    
    // Extract and display long-running commands
    const commands = extractCommands(logContent);
    displayLongestCommands(commands);
    
    // Extract and display file operations summary
    const fileOps = extractFileOperations(logContent);
    displayFileOperations(fileOps);
}

// Detect job type and configuration details from log content
function detectJobType(logContent) {
    // Set default values
    const jobTypeElement = document.getElementById('job-type');
    const jobNodeElement = document.getElementById('job-node');
    const jobTriggerElement = document.getElementById('job-trigger');
    
    if (!jobTypeElement || !jobNodeElement || !jobTriggerElement) {
        console.error('Job information elements not found in the DOM');
        return;
    }
    
    // Default values
    let detectedType = 'Unknown';
    let node = 'Unknown';
    let trigger = 'Unknown';
    
    // Check for pipeline job
    if (logContent.includes('Running in Durability level')) {
        detectedType = 'Pipeline';
    }
    // Check for freestyle job
    else if (logContent.includes('Building in workspace')) {
        detectedType = 'Freestyle';
    }
    // Multibranch pipeline
    else if (logContent.includes('Branch indexing')) {
        detectedType = 'Multibranch Pipeline';
    }
    
    // Extract build node
    const nodeMatches = logContent.match(/Running on ([^\s]+) in/);
    if (nodeMatches && nodeMatches.length > 1) {
        node = nodeMatches[1];
    }
    
    // Extract trigger
    if (logContent.includes('Started by user')) {
        const userMatch = logContent.match(/Started by user ([^\n]+)/);
        trigger = userMatch ? `User: ${userMatch[1]}` : 'User';
    } else if (logContent.includes('Started by GitHub')) {
        trigger = 'GitHub Webhook';
    } else if (logContent.includes('Started by timer')) {
        trigger = 'Scheduled';
    } else if (logContent.includes('Started by upstream')) {
        const upstreamMatch = logContent.match(/Started by upstream project "([^"]+)"/);
        trigger = upstreamMatch ? `Upstream: ${upstreamMatch[1]}` : 'Upstream Job';
    }
    
    // Update UI elements
    jobTypeElement.textContent = detectedType;
    jobNodeElement.textContent = node;
    jobTriggerElement.textContent = trigger;
    
    // Job type information is handled through the DOM, no need to store it separately
}

// Detect programming languages used in the build
function detectLanguages(logContent) {
    const languages = [];
    const languagePatterns = {
        'Java': /javac|java\s+-jar|maven|gradle|\.java|\.jar/i,
        'Python': /python[\d.]*\s+|pip\s+|requirements\.txt|\.py\b/i,
        'JavaScript': /npm\s+|node\s+|yarn\s+|webpack|babel|\.js\b|package.json/i,
        'C#/.NET': /dotnet\s+|msbuild|\.csproj|\.cs\b/i,
        'Go': /go\s+build|go\s+run|go\s+test|\.go\b/i,
        'C/C++': /g\+\+|gcc|cmake|make|\b\.cpp\b|\b\.c\b/i,
        'PowerShell': /powershell|\.ps1\b/i,
        'Shell': /\bbash\b|\bsh\b|\.sh\b/i,
        'Batch': /\.bat\b|\.cmd\b/i,
        'Docker': /docker\s+|dockerfile/i,
        'Terraform': /terraform\s+/i,
        'SQL': /\bsql\b|\bselect\s+.*\bfrom\b/i
    };
    
    // Check for each language pattern in the log
    for (const [language, pattern] of Object.entries(languagePatterns)) {
        if (pattern.test(logContent)) {
            languages.push(language);
        }
    }
    
    return languages;
}

// Display language badges in the UI
function displayLanguageBadges(languages) {
    const badgesContainer = document.getElementById('language-badges');
    if (!badgesContainer) {
        console.error('Language badges container not found in the DOM');
        return;
    }
    
    badgesContainer.innerHTML = '';
    
    if (!languages || languages.length === 0) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-secondary';
        badge.textContent = 'No languages detected';
        badgesContainer.appendChild(badge);
        return;
    }
    
    // Color mapping for language badges
    const colorMap = {
        'Java': 'danger',
        'Python': 'success',
        'JavaScript': 'warning',
        'C#/.NET': 'primary',
        'Go': 'info',
        'C/C++': 'dark',
        'PowerShell': 'primary',
        'Shell': 'secondary',
        'Batch': 'secondary',
        'Docker': 'info',
        'Terraform': 'purple',
        'SQL': 'dark'
    };
    
    languages.forEach(lang => {
        const badge = document.createElement('span');
        const color = colorMap[lang] || 'secondary';
        badge.className = `badge bg-${color} me-1 mb-1`;
        badge.textContent = lang;
        badgesContainer.appendChild(badge);
    });
}

// Extract commands and their timing from the log
function extractCommands(logContent) {
    const commands = [];
    const lines = logContent.split('\n');
    let currentCommand = null;
    
    // Patterns to match different command types
    const cmdPatterns = [
        /^\s*\+\s*(.+)$/,     // Shell command in Jenkins
        /^\s*>\s*(.+)$/,      // Windows command output
        /Executing\s+(.+)$/   // Executing command
    ];
    
    // Extract timestamps for duration calculation
    const timePattern = /\[([\d-:TZ\s.]+)\]/;
    let lastTimestamp = null;
    
    // Parse lines and extract commands
    lines.forEach((line, index) => {
        // Check for timestamp
        const timeMatch = line.match(timePattern);
        if (timeMatch) {
            try {
                lastTimestamp = new Date(timeMatch[1]);
            } catch (e) {
                // Invalid date format, ignore
            }
        }
        
        // Check for command patterns
        let cmdMatch = null;
        // Check each command pattern until we find a match
        for (const pattern of cmdPatterns) {
            cmdMatch = line.match(pattern);
            if (cmdMatch) {
                break;
            }
        }
        
        if (cmdMatch) {
            // If we have an active command, close it
            if (currentCommand) {
                currentCommand.endLine = index - 1;
                if (lastTimestamp && currentCommand.timestamp) {
                    currentCommand.duration = lastTimestamp - currentCommand.timestamp;
                }
                commands.push(currentCommand);
            }
            
            // Create new command
            currentCommand = {
                command: cmdMatch[1].trim(),
                timestamp: lastTimestamp,
                startLine: index,
                endLine: null,
                duration: 0,
                status: 'UNKNOWN'
            };
            
            // Look ahead for status indicators
            const statusPatterns = {
                'SUCCESS': /SUCCESS|Finished: SUCCESS/i,
                'FAILURE': /FAILURE|ERROR|FAILED|Finished: FAILURE/i,
                'ABORTED': /ABORTED|Finished: ABORTED/i,
                'UNSTABLE': /UNSTABLE|Finished: UNSTABLE/i
            };
            
            // Look ahead a few lines for completion status
            for (let i = 1; i < 5 && (index + i) < lines.length; i++) {
                const checkLine = lines[index + i];
                
                for (const [status, pattern] of Object.entries(statusPatterns)) {
                    if (pattern.test(checkLine)) {
                        currentCommand.status = status;
                        break;
                    }
                }
                
                if (currentCommand.status !== 'UNKNOWN') break;
            }
        }
    });
    
    // Close the last command if it's still open
    if (currentCommand && !currentCommand.endLine) {
        currentCommand.endLine = lines.length - 1;
        if (lastTimestamp && currentCommand.timestamp) {
            currentCommand.duration = lastTimestamp - currentCommand.timestamp;
        }
        commands.push(currentCommand);
    }
    
    // Sort by duration (longest first)
    return commands.sort((a, b) => b.duration - a.duration);
}

// Display longest running commands in the UI
function displayLongestCommands(commands) {
    const tableBody = document.getElementById('longest-commands');
    if (!tableBody) {
        console.error('Longest commands table body not found in the DOM');
        return;
    }
    
    tableBody.innerHTML = '';
    
    if (!commands || commands.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center">No commands detected</td></tr>';
        return;
    }
    
    // Display up to 5 longest commands
    const commandsToShow = commands.slice(0, 5);
    
    commandsToShow.forEach(cmd => {
        const row = document.createElement('tr');
        
        // Command cell
        const cmdCell = document.createElement('td');
        const shortCmd = cmd.command.length > 80 ? cmd.command.substring(0, 77) + '...' : cmd.command;
        cmdCell.textContent = shortCmd;
        cmdCell.title = cmd.command; // Full command on hover
        
        // Duration cell
        const durationCell = document.createElement('td');
        durationCell.textContent = formatDuration(cmd.duration || 0);
        
        // Status cell
        const statusCell = document.createElement('td');
        let statusClass = '';
        switch (cmd.status) {
            case 'SUCCESS': statusClass = 'text-success'; break;
            case 'FAILURE': statusClass = 'text-danger'; break;
            case 'ABORTED': statusClass = 'text-warning'; break;
            case 'UNSTABLE': statusClass = 'text-warning'; break;
            default: statusClass = 'text-secondary';
        }
        statusCell.innerHTML = `<span class="${statusClass}">${cmd.status}</span>`;
        
        row.appendChild(cmdCell);
        row.appendChild(durationCell);
        row.appendChild(statusCell);
        tableBody.appendChild(row);
    });
}

// Format duration in milliseconds to a human-readable string
function formatDuration(ms) {
    if (!ms) return '0s';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// Extract file operations from log content
function extractFileOperations(logContent) {
    const fileOps = {
        created: 0,
        modified: 0,
        deleted: 0,
        copied: 0,
        significant: []
    };
    
    // Look for RoboCopy operations
    const robocopyMatch = logContent.match(/(\d+)\s+Files copied/i);
    if (robocopyMatch?.[1]) {
        const filesCopied = parseInt(robocopyMatch[1]);
        fileOps.copied += filesCopied;
        fileOps.significant.push(`RoboCopy: ${filesCopied} files copied`);
    }
    
    // Look for Git operations
    const gitChangeMatch = logContent.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
    if (gitChangeMatch) {
        const filesChanged = gitChangeMatch?.[1] ? parseInt(gitChangeMatch[1]) : 0;
        const insertions = gitChangeMatch?.[2] ? parseInt(gitChangeMatch[2]) : 0;
        const deletions = gitChangeMatch?.[3] ? parseInt(gitChangeMatch[3]) : 0;
        
        fileOps.modified += filesChanged;
        fileOps.significant.push(`Git: ${filesChanged} files changed, +${insertions}, -${deletions}`);
    }
    
    // Look for Maven/Gradle builds
    if (logContent.includes('BUILD SUCCESS')) {
        fileOps.significant.push('Build completed successfully');
    }
    
    return fileOps;
}

// Display file operations summary in the UI
function displayFileOperations(fileOps) {
    const summaryEl = document.getElementById('file-operations-summary');
    if (!summaryEl) {
        console.error('File operations summary element not found in the DOM');
        return;
    }
    
    if (!fileOps || (fileOps.created === 0 && fileOps.modified === 0 && 
                    fileOps.deleted === 0 && fileOps.copied === 0 && 
                    fileOps.significant.length === 0)) {
        summaryEl.innerHTML = '<p class="text-center">No file operations detected</p>';
        return;
    }
    
    let summaryHtml = '<div class="row">';
    
    // File operations counts
    if (fileOps.created > 0 || fileOps.modified > 0 || fileOps.deleted > 0 || fileOps.copied > 0) {
        summaryHtml += '<div class="col-md-6 mb-3">';
        summaryHtml += '<h6>Summary Counts</h6>';
        summaryHtml += '<ul class="list-group">';
        
        if (fileOps.created > 0) {
            summaryHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
                Created Files <span class="badge bg-primary rounded-pill">${fileOps.created}</span>
            </li>`;
        }
        
        if (fileOps.modified > 0) {
            summaryHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
                Modified Files <span class="badge bg-warning rounded-pill">${fileOps.modified}</span>
            </li>`;
        }
        
        if (fileOps.deleted > 0) {
            summaryHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
                Deleted Files <span class="badge bg-danger rounded-pill">${fileOps.deleted}</span>
            </li>`;
        }
        
        if (fileOps.copied > 0) {
            summaryHtml += `<li class="list-group-item d-flex justify-content-between align-items-center">
                Copied Files <span class="badge bg-info rounded-pill">${fileOps.copied}</span>
            </li>`;
        }
        
        summaryHtml += '</ul></div>';
    }
    
    // Significant operations
    if (fileOps.significant.length > 0) {
        summaryHtml += '<div class="col-md-6 mb-3">';
        summaryHtml += '<h6>Significant Operations</h6>';
        summaryHtml += '<ul class="list-group">';
        
        fileOps.significant.forEach(op => {
            summaryHtml += `<li class="list-group-item">${op}</li>`;
        });
        
        summaryHtml += '</ul></div>';
    }
    
    summaryHtml += '</div>';
    summaryEl.innerHTML = summaryHtml;
}
