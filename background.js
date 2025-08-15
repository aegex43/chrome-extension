// background.js
chrome.runtime.onInstalled.addListener(() => {
    console.log('[Permissions Cleaner] Extension installed');
});

// Listen for messages from popup or content
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'update_settings') {
        chrome.storage.local.set(message.settings, () => {
            console.log('[Permissions Cleaner] Settings updated:', message.settings);
            sendResponse({ success: true });
        });
        return true; // Keep channel open for async response
    }
    return true;
});

// Auto-run content.js if autoStart is enabled and correct page is loaded
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' &&
        tab.url &&
        (tab.url.includes('myaccount.google.com/connections') ||
         tab.url.includes('myaccount.google.com/permissions'))) {

        chrome.storage.local.get(['autoStart', 'targetApps'], (settings) => {
            if (settings.autoStart) {
                console.log('[Permissions Cleaner] Auto-start enabled, starting cleaning...');
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: (targetApps) => {
                        window.postMessage({
                            source: 'permissionsCleanerAutoStart',
                            targetApps: targetApps
                        }, '*');
                    },
                    args: [settings.targetApps || 0]
                });
            }
        });
    }
});
