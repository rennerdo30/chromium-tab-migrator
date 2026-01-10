/**
 * Background Service Worker
 * Handles installation and messaging
 */

import { logger } from '../lib/logger.js';

chrome.runtime.onInstalled.addListener(() => {
    logger.info('EXTENSION_INSTALLED');
});

// Listener for messages if we need to offload processing from popup
// For now, popup handles logic directly for simplicity, but this is ready for scaling.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'PING') {
        sendResponse({ status: 'OK' });
    }
});
