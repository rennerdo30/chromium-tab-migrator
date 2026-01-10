/**
 * Chrome Adapter
 * Implements import logic for Chrome/Edge/Brave using Tab Groups API
 */

import { logger } from '../logger.js';

export class ChromeAdapter {
    /**
     * Import windows and tabs
     * @param {Array} windows - Array of window objects from export
     * @param {string} strategy - Mapping strategy (groups-to-groups, etc.)
     * @param {Object} options - Options including onProgress and isCancelled callbacks
     */
    async importWindows(windows, strategy, options = {}) {
        let tabCount = 0;
        let groupCount = 0;
        let cancelled = false;

        logger.info('IMPORT_WINDOWS_START', { windowCount: windows.length });

        for (const win of windows) {
            // Check for cancellation
            if (options.isCancelled?.()) {
                cancelled = true;
                break;
            }

            const newWin = await chrome.windows.create({ focused: true });
            const windowId = newWin.id;
            const defaultTab = newWin.tabs[0];

            // 1. Create Ungrouped Tabs (batched with progress)
            if (win.ungroupedTabs.length > 0) {
                const result = await this._createTabsBatched(
                    win.ungroupedTabs,
                    windowId,
                    tabCount,
                    options
                );
                tabCount = result.totalCount;
                if (result.cancelled) {
                    cancelled = true;
                    if (defaultTab) chrome.tabs.remove(defaultTab.id);
                    break;
                }
            }

            // 2. Create Groups
            for (const group of win.groups) {
                if (options.isCancelled?.()) {
                    cancelled = true;
                    break;
                }

                options.onProgress?.(tabCount, `Creating group: ${group.title}`);

                const result = await this._createTabsBatched(
                    group.tabs,
                    windowId,
                    tabCount,
                    options
                );
                tabCount = result.totalCount;

                if (result.cancelled) {
                    cancelled = true;
                    break;
                }

                const tabIds = result.tabs.map(t => t.id);

                if (tabIds.length > 0 && chrome.tabs.group) {
                    try {
                        const groupId = await chrome.tabs.group({ tabIds, windowId });
                        await chrome.tabGroups.update(groupId, {
                            title: group.title,
                            color: group.color,
                            collapsed: group.collapsed
                        });
                        groupCount++;
                    } catch (e) {
                        logger.warn('GROUP_CREATION_FAIL', { title: group.title }, e);
                    }
                }
            }

            // Cleanup default tab
            if (defaultTab) chrome.tabs.remove(defaultTab.id);

            if (cancelled) break;
        }

        logger.info('IMPORT_WINDOWS_COMPLETE', { tabCount, groupCount, cancelled });
        return { tabCount, groupCount, cancelled };
    }

    /**
     * Create a tab safely - truly lazy loaded (discarded state)
     */
    /**
     * Create a tab safely - create with URL then discard to prevent heavy loading
     */
    async _createTabSafe(tabData, windowId) {
        try {
            // Create directly with URL but inactive
            const tab = await chrome.tabs.create({
                windowId,
                url: tabData.url,
                active: false,
                pinned: tabData.pinned
            });

            // Immediate discard to stop network loading and save memory
            // This preserves the URL title/favicon request usually, but kills the heavy rendering
            try {
                await chrome.tabs.discard(tab.id);
            } catch (e) {
                // If discard fails (e.g. already discarded or invalid id), just ignore
                // The tab will just load normally in background, which is an acceptable fallback
            }

            return tab;
        } catch (e) {
            logger.warn('TAB_CREATE_FAIL', { url: tabData.url }, e);
            return null;
        }
    }

    /**
     * Create tabs in batches with progress and cancellation support
     */
    async _createTabsBatched(tabs, windowId, startCount = 0, options = {}, batchSize = 3, delayMs = 300) { // Reduced delay since we are not waiting for update
        const createdTabs = [];
        let currentCount = startCount;

        for (let i = 0; i < tabs.length; i += batchSize) {
            // Check for cancellation
            if (options.isCancelled?.()) {
                logger.info('IMPORT_CANCELLED_BATCH', { currentCount });
                return { tabs: createdTabs, totalCount: currentCount, cancelled: true };
            }

            const batch = tabs.slice(i, i + batchSize);

            const results = await Promise.all(
                batch.map(tab => this._createTabSafe(tab, windowId))
            );

            const validTabs = results.filter(Boolean);
            createdTabs.push(...validTabs);
            currentCount += validTabs.length;

            // Report progress
            options.onProgress?.(currentCount, `Importing tabs (${currentCount})...`);

            // Delay between batches (slower for visibility and safety)
            if (i + batchSize < tabs.length) {
                await new Promise(r => setTimeout(r, delayMs));
            }
        }

        return { tabs: createdTabs, totalCount: currentCount, cancelled: false };
    }
}
