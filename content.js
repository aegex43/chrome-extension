// === PERSISTENT CLEANING CONFIGURATION ===
const MIN_DELAY = 800;
const MAX_DELAY = 3200;
const THINKING_MIN = 1500;
const THINKING_MAX = 4500;
const RETRY_INTERVAL = 400;
const MAX_WAIT_TIME = 20000;
const MAX_LOOPS = 15;
const LOOP_DELAY_MIN = 8000;
const LOOP_DELAY_MAX = 15000;
const EMPTY_LOOPS_LIMIT = 3;

// Global state
let isRunning = false;
let shouldStop = false;
let currentStats = {
    scans: 0,
    removed: 0,
    state: 'idle',
    lastError: null
};

// Initialize from storage on script load
chrome.storage.local.get(['cleaningStats'], function(result) {
    if (result.cleaningStats) {
        currentStats = {
            ...currentStats,
            ...result.cleaningStats
        };
        console.log('[Permissions Cleaner] Restored stats:', currentStats);
    }
});

// Helper functions
function randomDelay(min = MIN_DELAY, max = MAX_DELAY) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
}

function updateStatus(status, state = null) {
    if (state) currentStats.state = state;

    console.log(`[Permissions Cleaner] ${status}`);

    // Save stats to storage
    chrome.storage.local.set({
        cleaningStats: currentStats
    });

    // Send message to extension popup
    if (typeof chrome !== 'undefined' && chrome.runtime) {
        try {
            chrome.runtime.sendMessage({
                type: 'status_update',
                status: status,
                scans: currentStats.scans,
                removed: currentStats.removed,
                state: currentStats.state,
                lastError: currentStats.lastError
            }).catch(err => {
                console.log('[Permissions Cleaner] Message send failed:', err);
            });
        } catch (err) {
            console.log('[Permissions Cleaner] Chrome runtime not available:', err);
        }
    }
}

async function humanMouseMove(x, y) {
    const steps = 3 + Math.floor(Math.random() * 3);
    const startX = x + (Math.random() > 0.5 ? -100 : 100);
    const startY = y + (Math.random() > 0.5 ? -100 : 100);

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const currX = startX + (x - startX) * ease;
        const currY = startY + (y - startY) * ease;

        const event = new MouseEvent("mousemove", {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: currX,
            clientY: currY,
            screenX: currX,
            screenY: currY
        });
        document.elementFromPoint(currX, currY)?.dispatchEvent(event);
        await randomDelay(60, 180);
    }
}

async function approachElement(el) {
    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width * 0.4 + Math.random() * rect.width * 0.2;
    const y = rect.top + rect.height * 0.4 + Math.random() * rect.height * 0.2;

    await humanMouseMove(x, y);
    await randomDelay(200, 600);

    for (let i = 0; i < 2; i++) {
        const dx = Math.random() * 10 - 5;
        const dy = Math.random() * 10 - 5;
        await humanMouseMove(x + dx, y + dy);
        await randomDelay(80, 150);
    }

    await humanMouseMove(x, y);
}

async function humanClick(el) {
    if (!el || shouldStop) return false;

    console.log(`🖱️ Approaching: ${el.textContent?.trim().substring(0, 30)}...`);

    await approachElement(el);
    await randomDelay(THINKING_MIN * 0.5, THINKING_MAX * 0.5);

    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await randomDelay(200, 500);

    try {
        el.click();
    } catch (err) {
        console.log('[Permissions Cleaner] Regular click failed, trying dispatch:', err);
        const clickEvent = new MouseEvent('click', {
            view: window,
            bubbles: true,
            cancelable: true,
        });
        el.dispatchEvent(clickEvent);
    }

    await randomDelay();
    return true;
}

async function findRemoveButton() {
    console.log('[Permissions Cleaner] 🔍 Searching for remove button...');
    await randomDelay(2000, 3000);

    const removePatterns = [
        /remove access/i,
        /revoke access/i,
        /disconnect/i,
        /delete/i,
        /remove/i,
        /revoke/i,
        /unlink/i
    ];

    const buttonSelectors = [
        'button',
        'div[role="button"]',
        'span[role="button"]',
        'a[role="button"]',
        '[data-testid*="remove"]',
        '[data-testid*="delete"]',
        '.VfPpkd-LgbsSe',
        'div[jsaction]',
        'button[jsname]'
    ];

    for (const selector of buttonSelectors) {
        const buttons = [...document.querySelectorAll(selector)]
            .filter(btn => btn.offsetWidth > 0 && btn.offsetHeight > 0);

        for (const btn of buttons) {
            const text = (btn.textContent || btn.getAttribute('aria-label') || btn.getAttribute('title') || '').trim().toLowerCase();

            for (const pattern of removePatterns) {
                if (pattern.test(text)) {
                    console.log(`[Permissions Cleaner] ✅ Found remove button: "${text}"`);
                    return btn;
                }
            }
        }
    }

    console.log('[Permissions Cleaner] ❌ No remove button found');
    return null;
}

async function findConfirmButton() {
    console.log('[Permissions Cleaner] 🔍 Searching for confirm button...');
    await randomDelay(1000, 2000);

    const strategies = [
        () => document.querySelector('button[jsname="j6LnYe"]'),
        () => document.querySelector('button[data-mdc-dialog-action="ok"]'),
        () => document.querySelector('button[data-mdc-dialog-action="accept"]'),
        () => {
            const buttons = [...document.querySelectorAll('button, div[role="button"]')];
            return buttons.find(btn => {
                if (btn.offsetWidth === 0 || btn.offsetHeight === 0) return false;
                const text = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();
                return ['confirm', 'remove', 'delete', 'ok', 'yes', 'continue'].some(keyword => text === keyword);
            });
        }
    ];

    for (const strategy of strategies) {
        try {
            const btn = strategy();
            if (btn && btn.offsetWidth > 0 && btn.offsetHeight > 0) {
                const text = (btn.textContent || btn.getAttribute('aria-label') || '').trim();
                console.log(`[Permissions Cleaner] ✅ Found confirm button: "${text}"`);
                return btn;
            }
        } catch (err) {
            console.log('[Permissions Cleaner] Strategy failed:', err);
        }
    }

    console.log('[Permissions Cleaner] ❌ No confirm button found');
    return null;
}

async function ensureOnCorrectPage() {
    const currentUrl = window.location.href;
    console.log(`[Permissions Cleaner] Current URL: ${currentUrl}`);

    if (!currentUrl.includes('/connections') && !currentUrl.includes('/permissions')) {
        updateStatus('📄 Navigating to connections page...');
        window.location.href = 'https://myaccount.google.com/connections';
        await randomDelay(8000, 12000);
    }

    await randomDelay(3000, 5000);
}

async function getCurrentAppLinks() {
    await ensureOnCorrectPage();
    await randomDelay(2000, 3000);

    const selectors = [
        'a.RlFDUe.mlgsfe',
        'a[href*="/connections/"]',
        'a[href*="/permissions/"]',
        'div[role="link"]',
        'a[data-ved]'
    ];

    let appLinks = [];

    for (const selector of selectors) {
        appLinks = [...document.querySelectorAll(selector)]
            .filter(link => {
                const isVisible = link.offsetWidth > 0 && link.offsetHeight > 0;
                const hasText = link.textContent && link.textContent.trim().length > 0;
                return isVisible && hasText;
            });

        if (appLinks.length > 0) {
            console.log(`[Permissions Cleaner] ✅ Found ${appLinks.length} apps using selector: ${selector}`);
            break;
        }
    }

    return appLinks;
}

async function removeApp(appLink) {
    if (shouldStop) return false;

    const appName = appLink.textContent.trim();
    updateStatus(`🖱️ Processing: ${appName.substring(0, 30)}...`);

    try {
        await humanClick(appLink);
        updateStatus(`⏳ Loading ${appName} details...`);
        await randomDelay(7000, 9000);

        if (shouldStop) return false;

        const removeBtn = await findRemoveButton();
        if (!removeBtn) {
            updateStatus(`❌ Remove button not found for ${appName}`);
            updateStatus('🔄 Need to reload page to continue...', 'page_reload_needed');
            return false;
        }

        await humanClick(removeBtn);
        updateStatus(`🗑️ Confirming removal of ${appName}...`);
        await randomDelay(2000, 4000);

        if (shouldStop) return false;

        const confirmBtn = await findConfirmButton();
        if (!confirmBtn) {
            updateStatus(`❌ Confirm button not found for ${appName}`);
            updateStatus('🔄 Need to reload page to continue...', 'page_reload_needed');
            return false;
        }

        await humanClick(confirmBtn);
        await randomDelay(5000, 7000);

        window.history.back();
        await randomDelay(6000, 9000);
        await randomDelay(2000, 3000);

        currentStats.removed++;
        currentStats.lastError = null;
        updateStatus(`✅ Removed: ${appName}`);

        chrome.storage.local.set({
            cleaningStats: currentStats
        });

        return true;

    } catch (err) {
        currentStats.lastError = `Error with ${appName}: ${err.message}`;
        updateStatus(`🚨 Error with ${appName}: ${err.message}`);
        console.error('[Permissions Cleaner] Error details:', err);

        updateStatus('🔄 Need to reload page to continue...', 'page_reload_needed');
        return false;
    }
}

async function startCleaning() {
    if (isRunning) {
        updateStatus('Already running!');
        return;
    }

    isRunning = true;
    shouldStop = false;
    currentStats.state = 'running';

    updateStatus('🚀 Starting cleanup process...', 'running');
    await randomDelay(3000, 5000);

    let emptyLoopsCount = 0;

    try {
        while (currentStats.scans < MAX_LOOPS && emptyLoopsCount < EMPTY_LOOPS_LIMIT && !shouldStop && currentStats.removed < 5) {
            currentStats.scans++;
            updateStatus(`🔍 Scan ${currentStats.scans}/${MAX_LOOPS} (${currentStats.removed}/5 removed)`);

            const appLinks = await getCurrentAppLinks();

            if (shouldStop) break;

            if (appLinks.length === 0) {
                emptyLoopsCount++;
                updateStatus(`✅ No apps found. Empty scans: ${emptyLoopsCount}/${EMPTY_LOOPS_LIMIT}`);

                if (emptyLoopsCount >= EMPTY_LOOPS_LIMIT) {
                    updateStatus('🎉 All permissions cleaned!', 'completed');
                    break;
                }

                await randomDelay(LOOP_DELAY_MIN, LOOP_DELAY_MAX);
                continue;
            }

            emptyLoopsCount = 0;
            updateStatus(`📱 Found ${appLinks.length} apps in scan ${currentStats.scans}`);

            for (let i = 0; i < appLinks.length && !shouldStop && currentStats.removed < 5; i++) {
                const success = await removeApp(appLinks[i]);

                if (currentStats.removed >= 5) {
                    updateStatus('🎯 Target reached! Removed 5 apps.', 'completed');
                    break;
                }

                if (i < appLinks.length - 1 && !shouldStop) {
                    await randomDelay(3000, 6000);
                }
            }

            if (currentStats.removed >= 5) {
                break;
            }

            if (!shouldStop && currentStats.scans < MAX_LOOPS && emptyLoopsCount < EMPTY_LOOPS_LIMIT) {
                updateStatus(`⏳ Waiting before next scan... (${currentStats.removed}/5 removed)`);
                await randomDelay(LOOP_DELAY_MIN, LOOP_DELAY_MAX);
            }
        }
    } catch (error) {
        currentStats.lastError = error.message;
        updateStatus(`🚨 Cleanup failed: ${error.message}`, 'error');
        console.error('[Permissions Cleaner] Fatal error:', error);
    }

    isRunning = false;

    chrome.storage.local.set({
        shouldAutoStart: false
    });

    if (shouldStop) {
        updateStatus(`⏹️ Stopped by user. Removed ${currentStats.removed} apps.`, 'stopped');
    } else if (currentStats.removed >= 5) {
        updateStatus(`🎯 Target achieved! Removed ${currentStats.removed} apps.`, 'completed');
    } else if (currentStats.lastError) {
        updateStatus(`❌ Stopped due to error. Removed ${currentStats.removed} apps.`, 'error');
    } else {
        updateStatus(`🎉 Cleanup complete! Removed ${currentStats.removed} apps.`, 'completed');
    }
}

function stopCleaning() {
    shouldStop = true;
    updateStatus('🛑 Stopping...', 'stopping');

    chrome.storage.local.set({
        shouldAutoStart: false
    });
}

// === Auto-start trigger from page context ===
window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data && event.data.source === 'permissionsCleanerAutoStart') {
        console.log('[Permissions Cleaner] Received auto-start trigger');
        startCleaning();
    }
});

// Message listener
if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
        console.log('[Permissions Cleaner] Received message:', message);

        if (message.action === 'start_cleaning') {
            if (!isRunning) {
                startCleaning();
                sendResponse({ success: true, status: 'started' });
            } else {
                sendResponse({ success: false, status: 'already_running' });
            }
        } else if (message.action === 'stop_cleaning') {
            stopCleaning();
            sendResponse({ success: true, status: 'stopping' });
        } else if (message.action === 'get_status') {
            updateStatus(isRunning ? 'Running...' : 'Ready to clean permissions', currentStats.state);
            sendResponse({
                success: true,
                status: currentStats,
                isRunning: isRunning
            });
        }

        return true;
    });
}

// Initialize
console.log('[Permissions Cleaner] Content script loaded');
updateStatus('Extension loaded. Ready to clean permissions.', 'idle');

// Global interface
window.permissionsCleaner = {
    start: startCleaning,
    stop: stopCleaning,
    getStatus: () => currentStats,
    isRunning: () => isRunning
};
