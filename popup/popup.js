/**
 * Popup UI Logic
 */

import { UniversalExporter } from '../lib/exporter.js';
import { UniversalImporter } from '../lib/importer.js';
import { detectBrowserAsync } from '../lib/browser-detect.js';
import { logger } from '../lib/logger.js';

// State
let loadedData = null;
let importController = null; // AbortController for cancellation

// DOM Elements
// DOM Elements
const browserBadge = document.getElementById('browser-badge');
const tabs = document.querySelectorAll('.tab-btn'); // Reverted selector
const panels = document.querySelectorAll('.panel');
const btnExport = document.getElementById('btn-export');
const btnImport = document.getElementById('btn-import');
const btnCancel = document.getElementById('btn-cancel');
const fileInput = document.getElementById('import-file');
const fileInfo = document.getElementById('file-info');
const importOptions = document.getElementById('import-options');
const importStrategies = document.getElementById('import-strategies');
const statusMsg = document.getElementById('status-msg');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.querySelector('#progress-bar .fill');
const progressText = document.getElementById('progress-text');

// Init
async function init() {
    const browser = await detectBrowserAsync();
    browserBadge.textContent = browser.name;

    // Set default strategy based on browser
    setSmartDefaults(browser);

    // Event Listeners
    tabs.forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
    btnExport.addEventListener('click', handleExport);
    btnImport.addEventListener('click', handleImport);
    btnCancel.addEventListener('click', handleCancel);
    btnCancel.addEventListener('click', handleCancel);
    fileInput.addEventListener('change', handleFileSelect);

    // Debug Listeners
    document.getElementById('btn-test-group')?.addEventListener('click', handleTestGroup);

    // Logger listener for UI updates
    logger.onLog(entry => {
        if (entry.level === 'ERROR') {
            statusMsg.textContent = `Error: ${entry.data.message || 'Unknown error'}`;
            statusMsg.style.color = '#ef4444';
        }
    });
}

function switchTab(tabName) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    panels.forEach(p => p.classList.toggle('active', p.id === `${tabName}-panel`));
}

function setSmartDefaults(browser) {
    const radioWorkspaces = document.querySelector('input[value="groups-to-workspaces"]');
    const radioGroups = document.querySelector('input[value="groups-to-groups"]');

    if (browser.features.workspaces) {
        if (radioWorkspaces) radioWorkspaces.checked = true;
    } else {
        if (radioGroups) radioGroups.checked = true;
    }
}

async function handleExport() {
    setLoading(true, 'Exporting...');

    try {
        const filters = {
            excludeInternal: document.getElementById('ex-filter-exclude-internal').checked,
            domains: document.getElementById('ex-filter-domain').value.split(',').map(s => s.trim()).filter(Boolean)
        };

        const exporter = new UniversalExporter();
        const data = await exporter.export({
            includeTabs: document.getElementById('ex-tabs').checked,
            includeBookmarks: document.getElementById('ex-bookmarks').checked,
            filters
        });

        downloadJSON(data);
        setLoading(false, 'Export Complete');
    } catch (e) {
        logger.error('UI_EXPORT_Error', {}, e);
        setLoading(false, 'Export Failed');
    }
}

function downloadJSON(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    chrome.downloads.download({
        url: url,
        filename: `tabs-export-${new Date().toISOString().slice(0, 10)}.json`,
        saveAs: true
    });
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            loadedData = JSON.parse(ev.target.result);

            const tCount = loadedData.windows ? loadedData.windows.reduce((acc, w) => acc + w.ungroupedTabs.length + w.groups.reduce((gAcc, g) => gAcc + g.tabs.length, 0), 0) : 0;
            const bCount = loadedData.bookmarks ? loadedData.bookmarks.length : 0;

            fileInfo.textContent = `Found: ${tCount} Tabs, ${loadedData.windows?.length || 0} Windows` + (bCount ? `, Bookmarks detected` : '');
            fileInfo.classList.remove('hidden');
            importOptions.classList.remove('hidden');
            importStrategies.classList.remove('hidden');
            btnImport.disabled = false;
        } catch (err) {
            fileInfo.textContent = 'Invalid JSON file';
            fileInfo.classList.remove('hidden');
            logger.error('PARSE_ERROR', {}, err);
        }
    };
    reader.readAsText(file);
}

async function handleImport() {
    if (!loadedData) return;

    // Create abort controller for cancellation
    importController = { cancelled: false };

    setLoading(true, 'Importing...');
    btnCancel.classList.remove('hidden');

    try {
        const importer = new UniversalImporter();
        const tabStrategy = document.querySelector('input[name="tab-strategy"]:checked').value;
        const bmStrategy = document.querySelector('input[name="bm-strategy"]:checked').value;

        // Calculate total items for progress
        let totalTabs = 0;
        if (loadedData.windows) {
            totalTabs = loadedData.windows.reduce((acc, w) =>
                acc + w.ungroupedTabs.length + w.groups.reduce((gAcc, g) => gAcc + g.tabs.length, 0), 0);
        }

        const options = {
            importTabs: document.getElementById('im-tabs').checked,
            importBookmarks: document.getElementById('im-bookmarks').checked,
            tabStrategy,
            bookmarkStrategy: bmStrategy,
            // Progress callback
            onProgress: (current, total, message) => {
                updateProgress(current, total, message);
            },
            // Cancellation check
            isCancelled: () => importController.cancelled
        };

        const results = await importer.import(loadedData, options);

        if (importController.cancelled) {
            setLoading(false, `Cancelled: ${results.tabs} tabs imported before cancel`);
        } else {
            setLoading(false, `Imported: ${results.tabs} tabs, ${results.bookmarks} bookmarks`);
        }
    } catch (e) {
        if (importController.cancelled) {
            setLoading(false, 'Import Cancelled');
        } else {
            logger.error('UI_IMPORT_ERROR', {}, e);
            setLoading(false, 'Import Failed');
        }
    } finally {
        btnCancel.classList.add('hidden');
        importController = null;
    }
}

function handleCancel() {
    if (importController) {
        importController.cancelled = true;
        statusMsg.textContent = 'Cancelling...';
        btnCancel.disabled = true;
    }
}

function updateProgress(current, total, message) {
    const percent = total > 0 ? (current / total) * 100 : 0;
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${current}/${total}`;
    if (message) {
        statusMsg.textContent = message;
    }
}

function setLoading(isLoading, status) {
    statusMsg.textContent = status;
    statusMsg.style.color = '';

    if (isLoading) {
        progressBar.classList.remove('hidden');
        progressText.classList.remove('hidden');
        progressFill.style.width = '0%';
        progressText.textContent = '0/0';
        btnExport.disabled = true;
        btnImport.disabled = true;
        btnCancel.disabled = false;
    } else {
        progressBar.classList.add('hidden');
        progressText.classList.add('hidden');
        progressFill.style.width = '0%';
        btnExport.disabled = false;
        btnImport.disabled = !loadedData;
        btnCancel.classList.add('hidden');
    }
}

// Start
init();

async function handleTestGroup() {
    setLoading(true, 'Running Test...');
    try {
        const win = await chrome.windows.create({ focused: true });
        const t1 = await chrome.tabs.create({ windowId: win.id, url: 'https://example.com' });
        const t2 = await chrome.tabs.create({ windowId: win.id, url: 'https://example.org' });

        // Group them
        if (chrome.tabs.group) {
            const gid = await chrome.tabs.group({ tabIds: [t1.id, t2.id], windowId: win.id });
            await chrome.tabGroups.update(gid, { title: 'Test Group', color: 'blue' });
            setLoading(false, 'Test Success: Created Group "Test Group"');
        } else {
            setLoading(false, 'Test Failed: API not available');
        }
    } catch (e) {
        logger.error('TEST_FAIL', {}, e);
        setLoading(false, 'Test Error: ' + e.message);
    }
}

