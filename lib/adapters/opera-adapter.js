/**
 * Opera Adapter
 * Implements import logic for Opera using Workspaces
 */

import { logger } from '../logger.js';

export class OperaAdapter {
    async importWindows(windows, strategy, options = {}) {
        let tabCount = 0;
        let groupCount = 0;
        let cancelled = false;

        logger.info('IMPORT_WINDOWS_START_OPERA', { windowCount: windows.length });

        for (const win of windows) {
            if (options.isCancelled?.()) {
                cancelled = true;
                break;
            }

            const newWin = await chrome.windows.create({ focused: true });
            const windowId = newWin.id;
            const defaultTab = newWin.tabs[0];

            // 1. Ungrouped Tabs
            if (win.ungroupedTabs.length > 0) {
                const result = await this._createTabsBatched(
                    win.ungroupedTabs,
                    windowId,
                    null,
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

            // 2. Groups
            for (const group of win.groups) {
                if (options.isCancelled?.()) {
                    cancelled = true;
                    break;
                }

                logger.info('IMPORT_GROUP_OPERA', { title: group.title, tabCount: group.tabs.length });
                options.onProgress?.(tabCount, `Creating group: ${group.title}`);

                // Create tabs for the group
                const result = await this._createTabsBatched(
                    group.tabs,
                    windowId,
                    group.title,
                    tabCount,
                    options
                );
                tabCount = result.totalCount;

                if (result.cancelled) {
                    cancelled = true;
                    break;
                }

                // Create the actual Group (Opera supports Chromium Tab Groups)
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
                        logger.warn('GROUP_CREATION_FAIL_OPERA', { title: group.title }, e);
                        // Fallback: Tabs remain created but ungrouped
                    }
                }
            }

            if (defaultTab) chrome.tabs.remove(defaultTab.id);
            if (cancelled) break;
        }

        logger.info('IMPORT_WINDOWS_COMPLETE_OPERA', { tabCount, groupCount, cancelled });
        return { tabCount, groupCount, cancelled };
    }

    async _createTabSafe(tabData, windowId, workspaceName = null) {
        try {
            // Opera specific: create directly with URL
            const tab = await chrome.tabs.create({
                windowId,
                url: tabData.url,
                active: false,
                pinned: tabData.pinned
            });

            // Attempt discard to save memory for large imports
            try {
                await chrome.tabs.discard(tab.id);
            } catch (e) {
                // Ignore discard errors
            }

            return tab;
        } catch (e) {
            logger.warn('TAB_CREATE_FAIL', { url: tabData.url }, e);
            return null;
        }
    }

    async _createTabsBatched(tabs, windowId, workspaceName = null, startCount = 0, options = {}, batchSize = 3, delayMs = 300) {
        const createdTabs = [];
        let currentCount = startCount;

        for (let i = 0; i < tabs.length; i += batchSize) {
            if (options.isCancelled?.()) {
                return { tabs: createdTabs, totalCount: currentCount, cancelled: true };
            }

            const batch = tabs.slice(i, i + batchSize);
            const results = await Promise.all(
                batch.map(tab => this._createTabSafe(tab, windowId, workspaceName))
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
