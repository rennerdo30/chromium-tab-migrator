/**
 * Universal Importer for Browser Tab Migrator
 * Orchestrates import process using adapters and strategies
 */

import { logger } from './logger.js';
import { detectBrowser } from './browser-detect.js';

// Adapters
import { ChromeAdapter } from './adapters/chrome-adapter.js';
import { OperaAdapter } from './adapters/opera-adapter.js';
import { FirefoxAdapter } from './adapters/firefox-adapter.js';
import { SafariAdapter } from './adapters/safari-adapter.js';
import { FallbackAdapter } from './adapters/fallback-adapter.js';
import { BookmarksAdapter } from './adapters/bookmarks-adapter.js';

export class UniversalImporter {
    constructor() {
        this.browser = detectBrowser();
        this.tabAdapter = this._getTabAdapter();
        this.bookmarkAdapter = new BookmarksAdapter();
    }

    _getTabAdapter() {
        if (this.browser.key === 'opera' || this.browser.features.workspaces) {
            return new OperaAdapter();
        } else if (this.browser.key === 'firefox') {
            return new FirefoxAdapter();
        } else if (this.browser.key === 'safari') {
            return new SafariAdapter();
        } else if (this.browser.features.tabGroups) {
            return new ChromeAdapter();
        } else {
            return new FallbackAdapter();
        }
    }

    /**
     * Import data
     * @param {Object} importData - The JSON data
     * @param {Object} options - Import options including:
     *   - importTabs, importBookmarks: what to import
     *   - tabStrategy, bookmarkStrategy: how to import
     *   - onProgress(current, total, message): progress callback
     *   - isCancelled(): returns true if operation should stop
     */
    async import(importData, options = {}) {
        logger.info('IMPORT_START', { version: importData.schemaVersion });

        const results = {
            tabs: 0,
            groups: 0,
            bookmarks: 0,
            errors: [],
            cancelled: false
        };

        // Calculate total for progress
        let totalTabs = 0;
        if (importData.windows) {
            totalTabs = importData.windows.reduce((acc, w) =>
                acc + w.ungroupedTabs.length + w.groups.reduce((gAcc, g) => gAcc + g.tabs.length, 0), 0);
        }

        // 1. Import Bookmarks first (fast operation)
        if (options.importBookmarks && importData.bookmarks?.length > 0) {
            if (options.isCancelled?.()) {
                results.cancelled = true;
                return results;
            }

            try {
                options.onProgress?.(0, totalTabs, 'Importing bookmarks...');
                const count = await this.bookmarkAdapter.import(
                    importData.bookmarks,
                    options.bookmarkStrategy
                );
                results.bookmarks = count;
            } catch (e) {
                logger.error('IMPORT_BOOKMARKS_FAIL', {}, e);
                results.errors.push('Bookmarks import failed');
            }
        }

        // 2. Import Tabs/Groups with progress
        if (options.importTabs && importData.windows) {
            if (options.isCancelled?.()) {
                results.cancelled = true;
                return results;
            }

            try {
                const { tabCount, groupCount, cancelled } = await this.tabAdapter.importWindows(
                    importData.windows,
                    options.tabStrategy,
                    {
                        ...options.tabOptions,
                        onProgress: (current, message) => {
                            options.onProgress?.(current, totalTabs, message);
                        },
                        isCancelled: options.isCancelled
                    }
                );
                results.tabs = tabCount;
                results.groups = groupCount;
                if (cancelled) results.cancelled = true;
            } catch (e) {
                logger.error('IMPORT_TABS_FAIL', {}, e);
                results.errors.push('Tabs import failed');
            }
        }

        logger.info('IMPORT_COMPLETE', results);
        return results;
    }
}

