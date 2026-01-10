/**
 * Universal Exporter for Browser Tab Migrator
 * Gathers state (tabs, groups, bookmarks) and creates standard JSON export
 */

import { logger } from './logger.js';
import { detectBrowser } from './browser-detect.js';

export class UniversalExporter {
    /**
     * Export browser data
     * @param {Object} options
     * @param {boolean} options.includeTabs - Export tabs & groups
     * @param {boolean} options.includeBookmarks - Export bookmarks
     * @param {Object} options.filters - Export filters
     * @returns {Promise<Object>} Export data object
     */
    async export(options = {}) {
        logger.info('EXPORT_START', options);
        const browser = detectBrowser();

        const exportData = {
            schemaVersion: "1.0",
            exportedAt: new Date().toISOString(),
            source: {
                browser: browser.key,
                version: "1.0", // Extension version placeholder
                groupSystem: browser.features.tabGroups ? 'tabGroups' : (browser.features.workspaces ? 'workspaces' : 'none'),
                filtersApplied: options.filters || {}
            },
            windows: [],
            bookmarks: []
        };

        if (options.includeTabs) {
            exportData.windows = await this._getWindowsAndTabs(options.filters);
        }

        if (options.includeBookmarks) {
            exportData.bookmarks = await this._getBookmarks();
        }

        logger.info('EXPORT_COMPLETE', {
            windows: exportData.windows.length,
            bookmarks: exportData.bookmarks.length
        });

        return exportData;
    }

    async _getWindowsAndTabs(filters = {}) {
        // Get all windows
        const windows = await chrome.windows.getAll({ populate: true });

        // Get all groups if supported
        let groupMap = new Map();
        if (chrome.tabGroups) {
            try {
                const groups = await chrome.tabGroups.query({});
                groups.forEach(g => groupMap.set(g.id, g));
            } catch (e) {
                logger.warn('EXPORT_GROUPS_FAILED', {}, e);
            }
        }

        const processedWindows = [];

        for (const win of windows) {
            // Filter out popup windows if requested (implied for regular export)
            if (win.type !== 'normal') continue;

            const windowData = {
                id: win.id,
                focused: win.focused,
                ungroupedTabs: [],
                groups: [] // We'll reconstruct group structure
            };

            const groupsInWindow = new Map(); // groupId -> { groupData, tabs: [] }

            for (const tab of win.tabs) {
                // Apply Filters
                if (this._shouldSkipTab(tab, filters)) continue;

                const tabData = {
                    url: tab.url,
                    title: tab.title,
                    index: tab.index, // Original index
                    pinned: tab.pinned,
                    favIconUrl: tab.favIconUrl,
                    // Opera Specifics (captured if present)
                    metadata: {}
                };

                if (tab.workspaceName) tabData.metadata.workspaceName = tab.workspaceName;
                if (tab.workspaceId) tabData.metadata.workspaceId = tab.workspaceId;

                // LOGIC: Map Browser Grouping -> Export Grouping
                // Priority 1: Native Tab Groups (Chrome/Edge/Brave/Opera)
                if (tab.groupId > -1 && groupMap.has(tab.groupId)) {
                    if (!groupsInWindow.has(tab.groupId)) {
                        const grp = groupMap.get(tab.groupId);
                        groupsInWindow.set(tab.groupId, {
                            title: grp.title,
                            color: grp.color,
                            collapsed: grp.collapsed,
                            tabs: [],
                            metadata: { originalId: grp.id }
                        });
                    }
                    groupsInWindow.get(tab.groupId).tabs.push(tabData);
                }
                // Priority 2: Opera Workspaces (Map to Groups)
                // If tab is not in a tab-group but HAS a workspace, treat workspace as a group
                else if (tab.workspaceName) {
                    const wsKey = `ws-${tab.workspaceId || tab.workspaceName}`;
                    if (!groupsInWindow.has(wsKey)) {
                        groupsInWindow.set(wsKey, {
                            title: tab.workspaceName, // Use workspace name as group title
                            color: 'grey',            // Default color for workspace-groups
                            collapsed: false,
                            tabs: [],
                            metadata: { type: 'workspace', originalId: tab.workspaceId }
                        });
                    }
                    groupsInWindow.get(wsKey).tabs.push(tabData);
                }
                // Priority 3: Ungrouped
                else {
                    windowData.ungroupedTabs.push(tabData);
                }
            }

            // Convert map to array
            windowData.groups = Array.from(groupsInWindow.values());

            // Only add window if it has content
            if (windowData.ungroupedTabs.length > 0 || windowData.groups.length > 0) {
                processedWindows.push(windowData);
            }
        }

        return processedWindows;
    }

    async _getBookmarks() {
        try {
            const tree = await chrome.bookmarks.getTree();
            // Simplify tree? Or keep full structure. 
            // Spec says keep array of root nodes.
            return tree;
        } catch (e) {
            logger.error('EXPORT_BOOKMARKS_FAILED', {}, e);
            return [];
        }
    }

    _shouldSkipTab(tab, filters) {
        if (!filters) return false;

        // Filter: Pinned Only
        if (filters.pinnedOnly && !tab.pinned) return true;

        // Filter: Exclude Internal
        if (filters.excludeInternal) {
            if (tab.url.startsWith('chrome://') ||
                tab.url.startsWith('edge://') ||
                tab.url.startsWith('about:') ||
                tab.url.startsWith('opera://')) {
                return true;
            }
        }

        // Filter: Domain
        if (filters.domains && filters.domains.length > 0) {
            try {
                const url = new URL(tab.url);
                const matches = filters.domains.some(d => url.hostname.includes(d));
                if (!matches) return true;
            } catch (e) { return true; } // Invalid URL
        }

        // Filter: Regex
        if (filters.regex) {
            try {
                const re = new RegExp(filters.regex);
                if (!re.test(tab.url) && !re.test(tab.title)) return true;
            } catch (e) {
                // Invalid regex, ignore filter or warn?
                // For now, ignore invalid regex filter
            }
        }

        return false;
    }
}
