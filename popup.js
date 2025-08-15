document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const status = document.getElementById('status');
    const scansEl = document.getElementById('scans');
    const removedEl = document.getElementById('removed');
    const stateEl = document.getElementById('state');
    
    let autoRestartTimer = null;
    
    // Add auto-restart toggle
    const autoRestartToggle = document.createElement('div');
    autoRestartToggle.innerHTML = `
        <label style="display: flex; align-items: center; margin: 10px 0; font-size: 12px;">
            <input type="checkbox" id="autoRestart" checked style="margin-right: 5px;">
            Auto-restart after page loads
        </label>
    `;
    document.querySelector('.container').insertBefore(autoRestartToggle, document.querySelector('.status'));
    
    const autoRestartCheckbox = document.getElementById('autoRestart');
    
    // Load saved settings
    chrome.storage.local.get(['autoRestart', 'shouldAutoStart', 'cleaningStats'], function(result) {
        autoRestartCheckbox.checked = result.autoRestart !== false; // default true
        
        if (result.cleaningStats) {
            scansEl.textContent = result.cleaningStats.scans || 0;
            removedEl.textContent = result.cleaningStats.removed || 0;
            stateEl.textContent = result.cleaningStats.state || 'Idle';
        }
        
        // Auto-start if needed
        if (result.shouldAutoStart && autoRestartCheckbox.checked) {
            console.log('[Popup] Auto-starting due to page reload');
            setTimeout(() => {
                startCleaning();
            }, 2000); // Wait 2 seconds for page to fully load
        }
    });
    
    // Save auto-restart preference
    autoRestartCheckbox.addEventListener('change', function() {
        chrome.storage.local.set({
            autoRestart: this.checked
        });
        
        if (!this.checked) {
            // Clear auto-start flag if disabled
            chrome.storage.local.set({
                shouldAutoStart: false
            });
        }
    });
    
    // Get current tab and check if it's the right page
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const tab = tabs[0];
        if (!tab.url.includes('myaccount.google.com')) {
            status.textContent = '⚠️ Please navigate to myaccount.google.com/connections first';
            startBtn.disabled = true;
        }
    });
    
    // Listen for messages from content script
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        if (message.type === 'status_update') {
            status.textContent = message.status;
            scansEl.textContent = message.scans || 0;
            removedEl.textContent = message.removed || 0;
            stateEl.textContent = message.state || 'Idle';
            
            // Save current stats
            chrome.storage.local.set({
                cleaningStats: {
                    scans: message.scans || 0,
                    removed: message.removed || 0,
                    state: message.state || 'Idle'
                }
            });
            
            // Handle different states
            if (message.state === 'running') {
                startBtn.disabled = true;
                stopBtn.disabled = false;
                
                // Set auto-start flag for page reloads
                chrome.storage.local.set({
                    shouldAutoStart: true
                });
                
            } else if (message.state === 'completed') {
                startBtn.disabled = false;
                stopBtn.disabled = true;
                
                // Clear auto-start flag when truly completed
                chrome.storage.local.set({
                    shouldAutoStart: false
                });
                
            } else if (message.state === 'stopped') {
                startBtn.disabled = false;
                stopBtn.disabled = true;
                
                // Clear auto-start flag when manually stopped
                chrome.storage.local.set({
                    shouldAutoStart: false
                });
                
            } else if (message.state === 'page_reload_needed') {
                // Script detected it needs to reload page and continue
                status.textContent = '🔄 Page reloading to continue...';
                
                chrome.storage.local.set({
                    shouldAutoStart: true
                }, function() {
                    // Reload the page
                    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                        chrome.tabs.reload(tabs[0].id);
                    });
                });
                
            } else if (message.state === 'idle' || message.state === 'error') {
                startBtn.disabled = false;
                stopBtn.disabled = true;
                
                // Check if we should auto-restart
                chrome.storage.local.get(['autoRestart', 'shouldAutoStart'], function(result) {
                    const shouldRestart = result.autoRestart && 
                                        result.shouldAutoStart && 
                                        (message.removed || 0) > 0 && 
                                        !message.status.includes('All permissions cleaned');
                    
                    if (shouldRestart) {
                        status.textContent = '🔄 Auto-restarting in 3 seconds...';
                        
                        autoRestartTimer = setTimeout(() => {
                            startCleaning();
                        }, 3000);
                    }
                });
            }
        }
    });
    
    function startCleaning() {
        // Clear any pending auto-restart
        if (autoRestartTimer) {
            clearTimeout(autoRestartTimer);
            autoRestartTimer = null;
        }
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'start_cleaning'}, function(response) {
                if (chrome.runtime.lastError) {
                    console.log('Content script not ready, injecting...');
                    // Content script not loaded, inject it
                    chrome.scripting.executeScript({
                        target: {tabId: tabs[0].id},
                        files: ['content.js']
                    }, function() {
                        // Try again after injection
                        setTimeout(() => {
                            chrome.tabs.sendMessage(tabs[0].id, {action: 'start_cleaning'});
                        }, 1000);
                    });
                }
            });
        });
    }
    
    startBtn.addEventListener('click', startCleaning);
    
    stopBtn.addEventListener('click', function() {
        // Clear any pending auto-restart and auto-start flag
        if (autoRestartTimer) {
            clearTimeout(autoRestartTimer);
            autoRestartTimer = null;
        }
        
        chrome.storage.local.set({
            shouldAutoStart: false
        });
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'stop_cleaning'});
        });
    });
});

// Request initial status when popup opens
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {action: 'get_status'}, function(response) {
            if (chrome.runtime.lastError) {
                console.log('Content script not ready');
            }
        });
    }
});