/**
 * Safari Adapter
 * Implements import logic for Safari using WebExtensions Tab Groups API
 */

import { logger } from '../logger.js';

export class SafariAdapter {
    async importWindows(windows, strategy, options = {}) {
        let tabCount = 0;
        let groupCount = 0;
        let cancelled = false;

        logger.info('IMPORT_WINDOWS_START_SAFARI', { windowCount: windows.length });

        for (const win of windows) {
            if (options.isCancelled?.()) {
                cancelled = true;
                break;
            }

            const newWin = await chrome.windows.create({ focused: true });
            const windowId = newWin.id;
            const defaultTab = newWin.tabs[0];

            // 1. Create Ungrouped Tabs (batched)
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

                logger.info('IMPORT_GROUP_SAFARI', { title: group.title, tabCount: group.tabs.length });
                options.onProgress?.(tabCount, `Importing group: ${group.title}`);

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

                if (tabIds.length > 0) {
                    try {
                        const groupId = await chrome.tabs.group({ tabIds, windowId });
                        await chrome.tabGroups.update(groupId, {
                            title: group.title,
                            collapsed: group.collapsed
                            // Note: Safari doesn't support color
                        });
                        groupCount++;
                    } catch (e) {
                        logger.warn('GROUP_CREATION_FAIL_SAFARI', { title: group.title }, e);
                    }
                }
            }

            if (defaultTab) chrome.tabs.remove(defaultTab.id);
            if (cancelled) break;
        }

        logger.info('IMPORT_WINDOWS_COMPLETE_SAFARI', { tabCount, groupCount, cancelled });
        return { tabCount, groupCount, cancelled };
    }

    async _createTabSafe(tabData, windowId) {
        try {
            // Safari Safe Creation
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

            const validTabs = results.filter(Boolean);
            createdTabs.push(...validTabs);
            currentCount += validTabs.length;

            options.onProgress?.(currentCount, `Importing tabs (${currentCount})...`);

            if (i + batchSize < tabs.length) {
                await new Promise(r => setTimeout(r, delayMs));
            }
        }

        return { tabs: createdTabs, totalCount: currentCount, cancelled: false };
    }
}
