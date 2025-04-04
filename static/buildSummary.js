/**
 * Build Summary functionality for Jenkins Dashboard
 * Provides language detection, command analysis, and file operation summaries
 */

// --- DOM Element References ---
const buildSummaryArea = getElement('build-summary-area');
const summaryLoadingIndicator = getElement('summary-loading-indicator');
const summaryErrorOutput = getElement('summary-error');
// Add references for specific output areas if needed, e.g.:
// const languageBadgesContainer = getElement('language-badges');
// const longestCommandsTableBody = getElement('#longest-commands tbody'); // More specific selector
// const fileOpsSummaryContainer = getElement('file-operations-summary');

// Global state (if needed, e.g., to cache log)
let latestBuildLog = null;

// Function to show the build summary area and hide other display areas
function showBuildSummary() {
    if (buildSummaryArea) {
        buildSummaryArea.style.display = 'block';
    }
    
    // If we don't have the log already, fetch it
    if (!latestBuildLog) {
        fetchBuildLogForSummary();
    } else {
        processBuildSummary(latestBuildLog);
    }
}

// Fetch log content for build summary
async function fetchBuildLogForSummary() {
    if (summaryLoadingIndicator) {
        summaryLoadingIndicator.style.display = 'inline-block'; // Use inline-block for spinners
    }
    if (summaryErrorOutput) {
        summaryErrorOutput.style.display = 'none'; // Hide previous errors
    }
    
    try {
        // Use the same proxy route as logHandler and timelineHandler
        const proxyLogUrl = `/api/proxy/log?build_url=${encodeURIComponent(latestBuildUrl)}`;
        console.log(`[DEBUG Summary] Fetching logs via proxy: ${proxyLogUrl}`);
        const response = await fetch(proxyLogUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        
        // Get raw text content directly
        latestBuildLog = await response.text();
        console.log(`[DEBUG Summary] Received log text (length: ${latestBuildLog.length})`);
        
        // Process the log to generate summary
        processBuildSummary(latestBuildLog);
    } catch (error) {
        console.error('Error fetching logs for summary:', error);
        showError(`Failed to load build summary: ${error.message}`, 'summary'); // Target specific error area
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
    
    console.log('[DEBUG Summary] Processing log content for summary, length:', logContent.length);
    
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
    if (logContent.includes('[Pipeline]')) {
        detectedType = 'Jenkins Pipeline';
    }
    
    // Check for Maven job
    if (logContent.includes('maven') || logContent.includes('mvn ')) {
        detectedType += detectedType === 'Unknown' ? 'Maven' : ' with Maven';
    }
    
    // Extract node information
    const nodeMatch = /Running on ([^\s]+)/.exec(logContent);
    if (nodeMatch && nodeMatch[1]) {
        node = nodeMatch[1];
    }
    
    // Extract trigger information
    const triggerMatch = /Started by (.+)/.exec(logContent);
    if (triggerMatch && triggerMatch[1]) {
        trigger = triggerMatch[1];
    }
    
    // Update DOM
    jobTypeElement.textContent = detectedType;
    jobNodeElement.textContent = node;
    jobTriggerElement.textContent = trigger;
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
    let commandStartLine = 0;
    
    // Patterns to match different command types
    const cmdPatterns = [
        /\[Pipeline\] echo\s+(.+)$/,  // Pipeline echo command
        /\[Pipeline\] sh\s+(.+)$/,    // Pipeline shell command
        /\+\s*(.+)$/,                // Shell command output with leading +
        />\s*(.+)$/,                 // Windows command output with leading >
        /Executing\s+(.+)$/          // Executing command
    ];
    
    // Parse lines and extract commands
    lines.forEach((line, index) => {
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
                currentCommand.lineCount = index - commandStartLine;
                currentCommand.duration = currentCommand.lineCount; // Use line count as duration proxy
                commands.push(currentCommand);
            }
            
            // Create new command
            commandStartLine = index;
            currentCommand = {
                command: cmdMatch[1].trim(),
                lineCount: 0,
                duration: 0,
                status: line.toLowerCase().includes('error') ? 'Failed' : 'Success'
            };
        } else if (currentCommand) {
            // Update command status based on output lines
            if (
                line.toLowerCase().includes('error') || 
                line.toLowerCase().includes('failed') ||
                line.toLowerCase().includes('exception')
            ) {
                currentCommand.status = 'Failed';
            }
        }
    });
    
    // Close the last command if it's still open
    if (currentCommand) {
        currentCommand.lineCount = lines.length - commandStartLine;
        currentCommand.duration = currentCommand.lineCount;
        commands.push(currentCommand);
    }
    
    // Sort commands by duration (line count) in descending order
    commands.sort((a, b) => b.duration - a.duration);
    
    // Only return the top 5 longest commands
    const topCommands = commands.slice(0, 5);
    console.log(`[DEBUG Summary] Extracted ${commands.length} commands, showing top ${topCommands.length}`);
    
    return topCommands;
}

// Display the longest-running commands in the UI
function displayLongestCommands(commands) {
    const commandsTableBody = document.getElementById('longest-commands');
    if (!commandsTableBody) {
        console.error('Commands table body not found in DOM');
        return;
    }
    
    commandsTableBody.innerHTML = '';
    
    if (!commands || commands.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="3" class="text-center">No commands detected</td>';
        commandsTableBody.appendChild(row);
        return;
    }
    
    // Display each command
    commands.forEach(cmd => {
        const row = document.createElement('tr');
        
        // Command cell with truncation for very long commands
        const cmdCell = document.createElement('td');
        const cmdText = cmd.command.length > 60 ? cmd.command.substring(0, 57) + '...' : cmd.command;
        cmdCell.textContent = cmdText;
        cmdCell.title = cmd.command; // Show full command on hover
        row.appendChild(cmdCell);
        
        // Duration cell
        const durationCell = document.createElement('td');        
        // Use line count as a proxy for duration
        durationCell.textContent = `${cmd.lineCount} lines`;
        row.appendChild(durationCell);
        
        // Status cell with colored badge
        const statusCell = document.createElement('td');
        const statusClass = cmd.status.toLowerCase() === 'failed' ? 'danger' : 'success';
        statusCell.innerHTML = `<span class="badge bg-${statusClass}">${cmd.status}</span>`;
        row.appendChild(statusCell);
        
        commandsTableBody.appendChild(row);
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
        readOnly: 0,
        topExtensions: {} // Count by extension
    };
    
    // Simplified patterns for Jenkins pipeline logs
    const patterns = {
        created: /\[Pipeline\].*(?:create|add|new|generat).*(?:file|dir)?\s+([^\s\n\r]+)/gi,
        modified: /\[Pipeline\].*(?:modif|chang|updat|writ).*(?:file)?\s+([^\s\n\r]+)/gi,
        deleted: /\[Pipeline\].*(?:delet|remov).*(?:file|dir)?\s+([^\s\n\r]+)/gi,
        readOnly: /\[Pipeline\].*(?:read|cat|view).*(?:file)?\s+([^\s\n\r]+)/gi
     };
     
    // Look for file operations in the log
    for (const [opType, pattern] of Object.entries(patterns)) {
        // Find all occurrences of this pattern
        const matches = logContent.match(pattern) || [];
        fileOps[opType] = matches.length;
        
        // Extract file extensions from matches
        matches.forEach(matchStr => {
            const parts = matchStr.split(/\s+/);
            // Look for something that might be a filename with extension
            parts.forEach(part => {
                if (part.includes('.')) {
                    const ext = part.split('.').pop().toLowerCase();
                    // Verify it's likely a file extension (2-4 chars)
                    if (ext && ext.length >= 2 && ext.length <= 4) {
                        fileOps.topExtensions[ext] = (fileOps.topExtensions[ext] || 0) + 1;
                    }
                }
            });
        });
    }
    
    // Add fallback for pipelines without clear file operations
    if (Object.values(fileOps.topExtensions).length === 0) {
        // Look for common file extensions in the log
        const extPatterns = [
            /\.java\b/g, /\.js\b/g, /\.py\b/g, /\.sh\b/g, /\.yaml\b/g, 
            /\.yml\b/g, /\.xml\b/g, /\.json\b/g, /\.html\b/g, /\.css\b/g
        ];
        
        extPatterns.forEach(pattern => {
            const matches = logContent.match(pattern) || [];
            if (matches.length > 0) {
                const ext = pattern.source.replace(/\\\./g, '').replace(/\\b/g, '');
                fileOps.topExtensions[ext] = matches.length;
            }
        });
    }
    
    console.log('[DEBUG Summary] Extracted file operations:', 
        `created=${fileOps.created}, modified=${fileOps.modified}, deleted=${fileOps.deleted}, readOnly=${fileOps.readOnly}`);
    
    return fileOps;
}

// Display file operations summary in the UI
function displayFileOperations(fileOps) {
    const fileOpsContainer = document.getElementById('file-operations-summary');
    if (!fileOpsContainer) {
        console.error('File operations summary container not found in DOM');
        return;
    }
    
    // Clear previous content
    fileOpsContainer.innerHTML = '';
    
    // Check if we have any file operations
    const totalOperations = fileOps.created + fileOps.modified + fileOps.deleted + fileOps.readOnly;
    if (totalOperations === 0 && Object.keys(fileOps.topExtensions).length === 0) {
        fileOpsContainer.innerHTML = '<p class="text-center">No file operations detected</p>';
        return;
    }
    
    // Create the file operations statistics display
    const stats = document.createElement('div');
    stats.className = 'row mb-3';
    stats.innerHTML = `
    <div class="col">
        <h6 class="mb-3">Files Processed</h6>
        <div class="d-flex flex-wrap justify-content-around gap-2">
            <div class="text-center p-2 bg-light rounded">
                <div class="h4 mb-0 text-success">${fileOps.created}</div>
                <small>Created</small>
            </div>
            <div class="text-center p-2 bg-light rounded">
                <div class="h4 mb-0 text-primary">${fileOps.modified}</div>
                <small>Modified</small>
            </div>
            <div class="text-center p-2 bg-light rounded">
                <div class="h4 mb-0 text-danger">${fileOps.deleted}</div>
                <small>Deleted</small>
            </div>
            <div class="text-center p-2 bg-light rounded">
                <div class="h4 mb-0 text-secondary">${fileOps.readOnly}</div>
                <small>Read</small>
            </div>
        </div>
    </div>`;
    fileOpsContainer.appendChild(stats);
    
    // Create the file extensions section if we have any
    const extensions = Object.entries(fileOps.topExtensions);
    if (extensions.length > 0) {
        // Sort by count (descending)
        extensions.sort((a, b) => b[1] - a[1]);
        
        const extSection = document.createElement('div');
        extSection.className = 'row mt-3';
        extSection.innerHTML = `
        <div class="col">
            <h6 class="mb-2">File Types</h6>
            <div class="d-flex flex-wrap gap-2">
                ${extensions.slice(0, 6).map(([ext, count]) => 
                    `<span class="badge bg-info">.${ext} (${count})</span>`
                ).join('')}
            </div>
        </div>`;
        fileOpsContainer.appendChild(extSection);
    }
}
