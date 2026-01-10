/**
 * Browser Detection Utility
 * Identifies current browser and supported capabilities
 */

export const BrowserCapabilities = {
    chrome: {
        name: 'Chrome',
        detect: () => /Chrome/.test(navigator.userAgent) && !/OPR|Edg/.test(navigator.userAgent),
        features: {
            tabGroups: true,
            workspaces: false,
            groupColors: true,
            groupCollapse: true
        }
    },

    opera: {
        name: 'Opera',
        detect: () => /OPR/.test(navigator.userAgent),
        features: {
            tabGroups: false,
            workspaces: true,
            groupColors: false,
            groupCollapse: false
        }
    },

    edge: {
        name: 'Edge',
        detect: () => /Edg/.test(navigator.userAgent),
        features: {
            tabGroups: true,
            workspaces: false,
            groupColors: true,
            groupCollapse: true
        }
    },

    brave: {
        name: 'Brave',
        detect: () => navigator.brave?.isBrave,
        features: {
            tabGroups: true,
            workspaces: false,
            groupColors: true,
            groupCollapse: true
        }
    },

    firefox: {
        name: 'Firefox',
        detect: () => /Firefox/.test(navigator.userAgent),
        features: {
            tabGroups: true, // Firefox 139+
            workspaces: false,
            groupColors: true,
            groupCollapse: true
        }
    },

    safari: {
        name: 'Safari',
        detect: () => /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent),
        features: {
            tabGroups: true, // Safari 15.4+
            workspaces: false,
            groupColors: false,
            groupCollapse: true
        }
    }
};

export function detectBrowser() {
    // Sync detection - works for all browsers except Brave
    for (const [key, browser] of Object.entries(BrowserCapabilities)) {
        // Skip Brave in sync detection (requires async)
        if (key === 'brave') continue;

        if (browser.detect()) {
            return {
                key,
                ...browser
            };
        }
    }

    // Fallback
    return {
        key: 'unknown',
        name: 'Unknown Browser',
        features: {
            tabGroups: false,
            workspaces: false
        }
    };
}

/**
 * Async browser detection - use this when Brave detection is important
 */
export async function detectBrowserAsync() {
    // Check Brave first (async)
    const brave = BrowserCapabilities.brave;
    try {
        const isBrave = await navigator.brave?.isBrave();
        if (isBrave) {
            return {
                key: 'brave',
                ...brave
            };
        }
    } catch (e) {
        // Not Brave or API not available
    }

    // Fall back to sync detection for other browsers
    return detectBrowser();
}
