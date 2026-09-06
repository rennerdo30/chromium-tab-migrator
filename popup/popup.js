/**
 * Popup UI Logic
 */

import { UniversalExporter } from '../lib/exporter.js';
import { UniversalImporter } from '../lib/importer.js';
import { detectBrowserAsync } from '../lib/browser-detect.js';
import { logger } from '../lib/logger.js';

// --- Constants -------------------------------------------------------------

const EXPORT_FILENAME_PREFIX = 'tabs-export-';
const EXPORT_FILENAME_EXTENSION = '.json';
const JSON_MIME_TYPE = 'application/json';
const JSON_INDENT = 2;
/** Object URLs are revoked once the download has been handed to the browser. */
const OBJECT_URL_LIFETIME_MS = 60_000;
const PERCENT_MAX = 100;

const STATE_CLASS = {
    error: 'is-error',
    success: 'is-success',
    warning: 'is-warning',
};

const TAB_EXPORT = 'export';
const TAB_IMPORT = 'import';
const TAB_ORDER = [TAB_EXPORT, TAB_IMPORT];

const STRATEGY_WORKSPACES = 'groups-to-workspaces';
const STRATEGY_GROUPS = 'groups-to-groups';

/**
 * User-facing copy. Kept in one place so wording stays consistent and no
 * sentence is assembled from fragments at the call site.
 */
const MESSAGES = {
    ready: 'Ready',
    detecting: 'Detecting browser…',
    unknownBrowser: 'Unknown browser',
    exporting: 'Exporting…',
    exportDone: ({ tabs, windows }) => `Exported ${tabs} tabs from ${windows} windows.`,
    exportDoneBookmarksOnly: 'Exported your bookmarks.',
    exportFailed: 'Export failed. See the console for details.',
    exportNothingSelected: 'Pick at least one kind of content to export.',
    importing: 'Restoring…',
    importDone: ({ tabs, bookmarks }) => `Restored ${tabs} tabs and ${bookmarks} bookmarks.`,
    importCancelledAfter: ({ tabs }) => `Cancelled after restoring ${tabs} tabs.`,
    importCancelled: 'Restore cancelled.',
    importFailed: 'Restore failed. See the console for details.',
    cancelling: 'Cancelling…',
    fileUnreadable: 'That file could not be read. Try selecting it again.',
    fileInvalid: 'That is not a backup file this extension can read. Pick a JSON file created by Export.',
    fileEmpty: 'That backup contains no tabs and no bookmarks.',
    fileSummary: ({ tabs, windows, hasBookmarks, exportedAt }) => {
        const parts = [`${tabs} tabs in ${windows} windows`];
        if (hasBookmarks) parts.push('bookmarks included');
        if (exportedAt) parts.push(`backed up ${exportedAt}`);
        return `Ready to restore: ${parts.join(' · ')}.`;
    },
    strategyForced: ({ browser, destination }) =>
        `${browser} restores tabs into ${destination}; the other option is not available here.`,
    themeToLight: 'Switch to light theme',
    themeToDark: 'Switch to dark theme',
    errorPrefix: (detail) => `Error: ${detail}`,
    unknownError: 'Unknown error',
};

const DESTINATION_LABEL = {
    [STRATEGY_WORKSPACES]: 'workspaces',
    [STRATEGY_GROUPS]: 'tab groups',
};

const numberFormat = new Intl.NumberFormat();
const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const formatCount = (value) => numberFormat.format(value ?? 0);

/** Formats an ISO timestamp with the user's locale, or returns null if unusable. */
function formatExportDate(isoString) {
    if (!isoString) return null;
    const date = new Date(isoString);
    return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

// --- State -----------------------------------------------------------------

let loadedData = null;
let importController = null; // { cancelled: boolean } used for cancellation

// --- DOM Elements ----------------------------------------------------------

const browserBadge = document.getElementById('browser-badge');
const tabs = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.panel');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const btnCancel = document.getElementById('btn-cancel');
const btnTheme = document.getElementById('btn-theme');
const fileInput = document.getElementById('import-file');
const fileInfo = document.getElementById('file-info');
const importOptions = document.getElementById('import-options');
const importStrategies = document.getElementById('import-strategies');
const exportCheckboxes = [
    document.getElementById('ex-tabs'),
    document.getElementById('ex-bookmarks'),
];
const exportEmptyHint = document.getElementById('export-empty-hint');
const strategyHint = document.getElementById('strategy-hint');
const statusMsg = document.getElementById('status-msg');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.querySelector('#progress-bar .fill');
const progressText = document.getElementById('progress-text');

// --- Init ------------------------------------------------------------------

async function init() {
    setupThemeToggle();

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        tab.addEventListener('keydown', handleTabKeydown);
    });
    btnExport.addEventListener('click', handleExport);
    btnImport.addEventListener('click', handleImport);
    btnCancel.addEventListener('click', handleCancel);
    fileInput.addEventListener('change', handleFileSelect);
    exportCheckboxes.forEach((box) => box.addEventListener('change', syncExportAvailability));
    syncExportAvailability();

    // Surface unexpected failures from anywhere in the pipeline.
    logger.onLog((entry) => {
        if (entry.level === 'ERROR') {
            setStatus(
                MESSAGES.errorPrefix(entry.error?.message || entry.data?.message || MESSAGES.unknownError),
                STATE_CLASS.error,
            );
        }
    });

    try {
        const browser = await detectBrowserAsync();
        browserBadge.textContent = browser.name || MESSAGES.unknownBrowser;
        applyBrowserDefaults(browser);
    } catch (error) {
        logger.warn('BROWSER_DETECT_FAILED', {}, error);
        browserBadge.textContent = MESSAGES.unknownBrowser;
    }
}

// --- Theme -----------------------------------------------------------------

function setupThemeToggle() {
    const theme = window.TabMigratorTheme;
    if (!theme) {
        btnTheme.hidden = true;
        return;
    }

    const syncLabel = () => {
        const isDark = theme.resolvedTheme() === theme.THEME_DARK;
        btnTheme.setAttribute('aria-label', isDark ? MESSAGES.themeToLight : MESSAGES.themeToDark);
        btnTheme.title = btnTheme.getAttribute('aria-label');
    };

    btnTheme.addEventListener('click', () => {
        theme.toggle();
        syncLabel();
    });
    syncLabel();
}

// --- Tabs ------------------------------------------------------------------

function switchTab(tabName) {
    tabs.forEach((tab) => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('active', isActive);
        tab.setAttribute('aria-selected', String(isActive));
        // Only the selected tab stays in the tab order (roving tabindex).
        tab.tabIndex = isActive ? 0 : -1;
    });
    panels.forEach((panel) => {
        const isActive = panel.id === `${tabName}-panel`;
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
    });
}

/** Arrow/Home/End navigation, as expected of a role="tablist". */
function handleTabKeydown(event) {
    const order = TAB_ORDER;
    const current = order.indexOf(event.currentTarget.dataset.tab);
    let next = null;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (current + 1) % order.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (current - 1 + order.length) % order.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = order.length - 1;

    if (next === null) return;
    event.preventDefault();
    switchTab(order[next]);
    document.getElementById(`tab-${order[next]}`)?.focus();
}

// --- Browser-specific defaults --------------------------------------------

/**
 * Picks the destination the current browser can actually deliver and makes the
 * unavailable one visibly unavailable instead of silently ineffective.
 */
function applyBrowserDefaults(browser) {
    const supported = browser.features?.workspaces ? STRATEGY_WORKSPACES : STRATEGY_GROUPS;
    const unsupported = supported === STRATEGY_WORKSPACES ? STRATEGY_GROUPS : STRATEGY_WORKSPACES;

    const supportedRadio = document.querySelector(`input[value="${supported}"]`);
    const unsupportedRadio = document.querySelector(`input[value="${unsupported}"]`);
    if (supportedRadio) supportedRadio.checked = true;
    if (unsupportedRadio) {
        unsupportedRadio.checked = false;
        unsupportedRadio.disabled = true;
        unsupportedRadio.closest('.radio-wrap')?.classList.add('is-unsupported');
    }

    if (strategyHint) {
        strategyHint.textContent = MESSAGES.strategyForced({
            browser: browser.name || MESSAGES.unknownBrowser,
            destination: DESTINATION_LABEL[supported],
        });
    }
}

// --- Export ----------------------------------------------------------------

/** Nothing selected means nothing to export, so the button says so up front. */
function syncExportAvailability() {
    const anySelected = exportCheckboxes.some((box) => box.checked);
    btnExport.disabled = !anySelected;
    exportEmptyHint.classList.toggle('hidden', anySelected);
}

async function handleExport() {
    const includeTabs = document.getElementById('ex-tabs').checked;
    const includeBookmarks = document.getElementById('ex-bookmarks').checked;
    if (!includeTabs && !includeBookmarks) {
        setStatus(MESSAGES.exportNothingSelected, STATE_CLASS.warning);
        return;
    }

    setBusy(true, MESSAGES.exporting);

    try {
        const filters = {
            excludeInternal: document.getElementById('ex-filter-exclude-internal').checked,
            domains: document
                .getElementById('ex-filter-domain')
                .value.split(',')
                .map((value) => value.trim())
                .filter(Boolean),
        };

        const exporter = new UniversalExporter();
        const data = await exporter.export({ includeTabs, includeBookmarks, filters });

        downloadJSON(data);

        const windows = data.windows?.length ?? 0;
        setBusy(false, windows > 0
            ? MESSAGES.exportDone({ tabs: formatCount(countTabs(data)), windows: formatCount(windows) })
            : MESSAGES.exportDoneBookmarksOnly, STATE_CLASS.success);
    } catch (error) {
        logger.error('UI_EXPORT_ERROR', {}, error);
        setBusy(false, MESSAGES.exportFailed, STATE_CLASS.error);
    }
}

/** Total tab count across all windows, grouped and ungrouped. */
function countTabs(data) {
    if (!Array.isArray(data?.windows)) return 0;
    return data.windows.reduce((total, win) => {
        const grouped = (win.groups ?? []).reduce((sum, group) => sum + (group.tabs?.length ?? 0), 0);
        return total + (win.ungroupedTabs?.length ?? 0) + grouped;
    }, 0);
}

function downloadJSON(data) {
    const blob = new Blob([JSON.stringify(data, null, JSON_INDENT)], { type: JSON_MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const date = new Date().toISOString().slice(0, 10); // ISO keeps exported files sortable by name.

    chrome.downloads.download(
        {
            url,
            filename: `${EXPORT_FILENAME_PREFIX}${date}${EXPORT_FILENAME_EXTENSION}`,
            saveAs: true,
        },
        () => {
            // Release the blob once the download has been queued; the popup may
            // close before this fires, which frees it anyway.
            setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS);
        },
    );
}

// --- Import ----------------------------------------------------------------

/** Clears anything derived from a previously selected file. */
function resetImportState() {
    loadedData = null;
    btnImport.disabled = true;
    importOptions.classList.add('hidden');
    importStrategies.classList.add('hidden');
    fileInfo.classList.remove(STATE_CLASS.success, STATE_CLASS.error, STATE_CLASS.warning);
}

function showFileMessage(message, stateClass) {
    fileInfo.textContent = message;
    fileInfo.classList.remove('hidden');
    fileInfo.classList.remove(STATE_CLASS.success, STATE_CLASS.error, STATE_CLASS.warning);
    if (stateClass) fileInfo.classList.add(stateClass);
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    // A previous selection must not survive a new (or failed) one.
    resetImportState();
    if (!file) {
        fileInfo.classList.add('hidden');
        return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
        showFileMessage(MESSAGES.fileUnreadable, STATE_CLASS.error);
        logger.error('FILE_READ_ERROR', { name: file.name }, reader.error);
    };

    reader.onload = (loadEvent) => {
        let parsed;
        try {
            parsed = JSON.parse(loadEvent.target.result);
        } catch (error) {
            showFileMessage(MESSAGES.fileInvalid, STATE_CLASS.error);
            logger.error('PARSE_ERROR', { name: file.name }, error);
            return;
        }

        const windows = Array.isArray(parsed?.windows) ? parsed.windows : [];
        const bookmarkCount = Array.isArray(parsed?.bookmarks) ? parsed.bookmarks.length : 0;
        const tabCount = countTabs({ windows });

        if (tabCount === 0 && bookmarkCount === 0) {
            showFileMessage(MESSAGES.fileEmpty, STATE_CLASS.warning);
            return;
        }

        loadedData = parsed;
        showFileMessage(
            MESSAGES.fileSummary({
                tabs: formatCount(tabCount),
                windows: formatCount(windows.length),
                hasBookmarks: bookmarkCount > 0,
                exportedAt: formatExportDate(parsed?.exportedAt),
            }),
            STATE_CLASS.success,
        );
        importOptions.classList.remove('hidden');
        importStrategies.classList.remove('hidden');
        btnImport.disabled = false;
    };

    reader.readAsText(file);
}

async function handleImport() {
    if (!loadedData) return;

    importController = { cancelled: false };

    setBusy(true, MESSAGES.importing);
    btnCancel.classList.remove('hidden');

    try {
        const importer = new UniversalImporter();
        const tabStrategy = document.querySelector('input[name="tab-strategy"]:checked')?.value ?? STRATEGY_GROUPS;
        const bmStrategy = document.querySelector('input[name="bm-strategy"]:checked')?.value;

        const results = await importer.import(loadedData, {
            importTabs: document.getElementById('im-tabs').checked,
            importBookmarks: document.getElementById('im-bookmarks').checked,
            tabStrategy,
            bookmarkStrategy: bmStrategy,
            onProgress: updateProgress,
            isCancelled: () => importController?.cancelled === true,
        });

        if (importController.cancelled) {
            setBusy(false, MESSAGES.importCancelledAfter({ tabs: formatCount(results.tabs) }), STATE_CLASS.warning);
        } else {
            setBusy(false, MESSAGES.importDone({
                tabs: formatCount(results.tabs),
                bookmarks: formatCount(results.bookmarks),
            }), STATE_CLASS.success);
        }
    } catch (error) {
        if (importController?.cancelled) {
            setBusy(false, MESSAGES.importCancelled, STATE_CLASS.warning);
        } else {
            logger.error('UI_IMPORT_ERROR', {}, error);
            setBusy(false, MESSAGES.importFailed, STATE_CLASS.error);
        }
    } finally {
        btnCancel.classList.add('hidden');
        importController = null;
    }
}

function handleCancel() {
    if (!importController) return;
    importController.cancelled = true;
    setStatus(MESSAGES.cancelling);
    btnCancel.disabled = true;
}

// --- Status and progress ---------------------------------------------------

function setStatus(message, stateClass) {
    statusMsg.textContent = message;
    statusMsg.title = message; // The footer truncates; the full text stays reachable.
    statusMsg.classList.remove(STATE_CLASS.error, STATE_CLASS.success, STATE_CLASS.warning);
    if (stateClass) statusMsg.classList.add(stateClass);
}

function updateProgress(current, total, message) {
    const percent = total > 0 ? Math.min((current / total) * PERCENT_MAX, PERCENT_MAX) : 0;
    progressFill.style.width = `${percent}%`;
    progressBar.setAttribute('aria-valuenow', String(Math.round(percent)));
    progressText.textContent = `${formatCount(current)} / ${formatCount(total)}`;
    if (message) setStatus(message);
}

function setBusy(isBusy, status, stateClass) {
    setStatus(status, stateClass);

    progressBar.classList.toggle('hidden', !isBusy);
    progressText.classList.toggle('hidden', !isBusy);
    progressFill.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', '0');

    if (isBusy) {
        progressText.textContent = `${formatCount(0)} / ${formatCount(0)}`;
        btnExport.disabled = true;
        btnImport.disabled = true;
        btnCancel.disabled = false;
    } else {
        syncExportAvailability();
        btnImport.disabled = !loadedData;
        btnCancel.classList.add('hidden');
    }
}

// --- Start -----------------------------------------------------------------

init();
