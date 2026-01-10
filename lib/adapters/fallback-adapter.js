/**
 * Fallback Adapter
 * Maps groups to separate windows when Tab Groups API is not available
 */

import { logger } from '../logger.js';

export class FallbackAdapter {
    async importWindows(windows, strategy, options = {}) {
        let tabCount = 0;
        let groupCount = 0;
        let cancelled = false;

        logger.info('IMPORT_WINDOWS_START_FALLBACK', { windowCount: windows.length });

        for (const win of windows) {
            if (options.isCancelled?.()) {
                cancelled = true;
                break;
            }

            // Create window for ungrouped tabs
            if (win.ungroupedTabs.length > 0) {
                const newWin = await chrome.windows.create({ focused: true });
                const windowId = newWin.id;
                const defaultTab = newWin.tabs[0];

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

                if (defaultTab) chrome.tabs.remove(defaultTab.id);
            }

            // Create separate window for each group
            for (const group of win.groups) {
                if (options.isCancelled?.()) {
                    cancelled = true;
                    break;
                }

                logger.info('FALLBACK_GROUP_TO_WINDOW', { title: group.title, tabCount: group.tabs.length });
                options.onProgress?.(tabCount, `Importing group (window): ${group.title}`);

                const groupWin = await chrome.windows.create({ focused: false });
                const windowId = groupWin.id;
                const defaultTab = groupWin.tabs[0];

                const result = await this._createTabsBatched(
                    group.tabs,
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

                if (defaultTab) chrome.tabs.remove(defaultTab.id);
                groupCount++;
            }

            if (cancelled) break;
        }

        logger.info('IMPORT_WINDOWS_COMPLETE_FALLBACK', { tabCount, groupCount, cancelled });
        return { tabCount, groupCount, cancelled };
    }

    async _createTabSafe(tabData, windowId) {
        try {
            // Fallback Safe Creation
            const tab = await chrome.tabs.create({
                windowId,
                url: tabData.url,
                active: false,
                pinned: tabData.pinned
            });

            // Attempt discard
            try {
                await chrome.tabs.discard(tab.id);
            } catch (e) { /* OK */ }

            return tab;
        } catch (e) {
            logger.warn('TAB_CREATE_FAIL', { url: tabData.url }, e);
            return null;
        }
    }

    async _createTabsBatched(tabs, windowId, startCount = 0, options = {}, batchSize = 3, delayMs = 300) {
        const createdTabs = [];
        let currentCount = startCount;

        for (let i = 0; i < tabs.length; i += batchSize) {
            if (options.isCancelled?.()) {
                return { tabs: createdTabs, totalCount: currentCount, cancelled: true };
            }

            const batch = tabs.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map(tab => this._createTabSafe(tab, windowId))
            );
            createdTabs.push(...results.filter(Boolean));

            const validTabs = results.filter(Boolean);
            currentCount += validTabs.length;

            options.onProgress?.(currentCount, `Importing tabs (${currentCount})...`);

            if (i + batchSize < tabs.length) {
                await new Promise(r => setTimeout(r, delayMs));
            }
        }

        return { tabs: createdTabs, totalCount: currentCount, cancelled: false };
    }
}
