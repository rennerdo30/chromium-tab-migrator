# Browser Tab Migrator

Cross-browser extension for migrating tabs, groups, and bookmarks between Chromium-based, Firefox, and Safari browsers.

## Overview

| Property | Value |
|----------|-------|
| **Name** | Browser Tab & Bookmark Migrator |
| **Manifest** | V3 |
| **Approach** | Universal export format + browser-specific import adapters |

---

## Supported Browsers

| Browser | Min Version | Export | Import | Group System |
|---------|-------------|--------|--------|--------------|
| Chrome | 89+ | ✅ | ✅ | Tab Groups (`chrome.tabGroups`) |
| Opera | 77+ | ✅ | ✅ | Workspaces (`workspaceId`/`workspaceName`) |
| Edge | 89+ | ✅ | ✅ | Tab Groups (Chrome-compatible API) |
| Brave | 1.23+ | ✅ | ✅ | Tab Groups (Chrome-compatible API) |
| Firefox | 139+ | ✅ | ✅ | Tab Groups (Native API `browser.tabGroups`) |
| Safari | 15.4+ | ✅ | ✅ | Tab Groups (`browser.tabGroups`*) |
| Vivaldi | — | ✅ | ⚠️ | Tab Stacks (limited API access) |
| Arc | — | 🔬 | 🔬 | Spaces (needs investigation) |

> *Safari tab group support via WebExtensions needs verification of exact API alignment with Chrome.

**Legend:** ✅ Supported | ⚠️ Limited | 🔬 Needs Research

---

## Features

### Core Features (MVP)

- [ ] **Universal Export**: Export tabs/groups/bookmarks to browser-agnostic JSON
- [ ] **Universal Import**: Import JSON with browser-specific mapping
- [ ] **Granular Export Control**: Select exactly what to export (Tabs, Groups, Bookmarks)
- [ ] **Export Filters**: Filter data by domain, regex, or date range
- [ ] **Data Selection**: Choose to export/import Tabs, Bookmarks, or Both
- [ ] **Browser Detection**: Auto-detect current browser and capabilities
- [ ] **Mapping Strategy Selector**: Choose how to handle groups on import
- [ ] **Bookmark Strategy Selector**: Merge, Replace, or Import to Folder
- [ ] **Progress Indicator**: Real-time progress bar with current/total count
- [ ] **Cancel Import**: Ability to cancel import mid-operation with cleanup
- [ ] **Structured Logging**: Console + UI logging

### Performance & Safety

**Tab Loading Strategy:**
To prevent network congestion (DDoS-like behavior) and memory exhaustion when importing hundreds of tabs:

1. **Lazy Loading**: Use `active: false` for all recreated tabs.
2. **Discarded State**: Use `chrome.tabs.discard()` after creation to unload tabs until clicked.
3. **Batching**: Create tabs in batches of 5 with 200ms delays between batches.

**Progress & Cancellation:**
- Real-time progress bar showing `current/total` tabs processed
- Ability to cancel import mid-operation
- Graceful cleanup of partially created tabs on cancel

```javascript
// Example: Safe Creation with Discard
const tab = await chrome.tabs.create({
  windowId,
  url: 'about:blank',
  active: false,
  pinned: tabData.pinned
});
await chrome.tabs.update(tab.id, { url: tabData.url });
await chrome.tabs.discard(tab.id); // Unload until clicked
```

### Mapping Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Tab Groups** | | |
| `groups-to-groups` | Tab Groups → Tab Groups | Chrome ↔ Edge/Brave |
| `groups-to-workspaces` | Tab Groups → Workspaces | Chrome → Opera |
| `workspaces-to-groups` | Workspaces → Tab Groups | Opera → Chrome |
| `flatten` | Ignore grouping, import all as ungrouped | Any → Any |
| `windows` | Map each group to a new window | Fallback for unsupported browsers |
| **Bookmarks** | | |
| `merge` | Add non-existing bookmarks, keep existing | Syncing |
| `replace` | Delete all existing, import new | Full migration |
| `folder` | Import all into "Imported [Date]" folder | Safe backup |

### Optional Features (v2.0)

- [ ] **Selective Import**: Choose which groups to import
- [ ] **Preview Mode**: Show structure before executing
- [ ] **Duplicate Detection**: Skip/warn about existing URLs
- [ ] **Session Sync**: Real-time sync between browsers (local network)
- [ ] **Profile Support**: Handle multiple browser profiles

---

## Architecture

### Browser Capability Detection

```javascript
const BrowserCapabilities = {
  chrome: {
    name: 'Chrome',
    detect: () => /Chrome/.test(navigator.userAgent) && !/OPR|Edg/.test(navigator.userAgent),
    features: {
      tabGroups: true,
      workspaces: false,
      groupColors: true,
      groupCollapse: true
    },
    api: {
      getGroups: () => chrome.tabGroups.query({}),
      createGroup: (opts) => chrome.tabs.group(opts),
      setGroupProps: (id, props) => chrome.tabGroups.update(id, props)
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
    },
    api: {
      getGroups: async () => {
        const tabs = await chrome.tabs.query({});
        const workspaces = new Map();
        tabs.forEach(tab => {
          if (tab.workspaceId) {
            if (!workspaces.has(tab.workspaceId)) {
              workspaces.set(tab.workspaceId, {
                id: tab.workspaceId,
                title: tab.workspaceName || 'Unnamed',
                tabs: []
              });
            }
            workspaces.get(tab.workspaceId).tabs.push(tab);
          }
        });
        return Array.from(workspaces.values());
      },
      createInWorkspace: (tabOpts, workspaceId, workspaceName) => 
        chrome.tabs.create({ ...tabOpts, workspaceId, workspaceName })
    }
  },
  
  
  firefox: {
    name: 'Firefox',
    detect: () => /Firefox/.test(navigator.userAgent),
    features: {
      tabGroups: true, // New in Firefox 139+
      workspaces: false, // "Containers" are different concept
      groupColors: true,
      groupCollapse: true
    },
    api: {
      getGroups: () => browser.tabGroups.query({}),
      createGroup: (opts) => browser.tabs.group(opts),
      setGroupProps: (id, props) => browser.tabGroups.update(id, props)
    }
  },

  safari: {
    name: 'Safari',
    detect: () => /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent),
    features: {
      tabGroups: true,
      workspaces: false,
      groupColors: false, // Safari groups don't have user-set colors
      groupCollapse: true // "Collapsed" = closed in sidebar? Needs testing.
    },
    api: null // Follows MDN/W3C standard `browser.tabGroups`
  },
  
  edge: {
    name: 'Edge',
    detect: () => /Edg/.test(navigator.userAgent),
    features: {
      tabGroups: true,
      workspaces: false,
      groupColors: true,
      groupCollapse: true
    },
    // Same API as Chrome
    api: null // Falls back to Chrome API
  },
  
  brave: {
    name: 'Brave',
    detect: () => navigator.brave?.isBrave,
    features: {
      tabGroups: true,
      workspaces: false,
      groupColors: true,
      groupCollapse: true
    },
    api: null // Falls back to Chrome API
  }
};
```

### Project Structure

```
chromium-tab-migrator/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── background/
│   └── service-worker.js
├── lib/
│   ├── logger.js              # Structured logging
│   ├── browser-detect.js      # Browser capability detection
│   ├── exporter.js            # Universal export
│   ├── importer.js            # Universal import orchestrator
│   └── adapters/
│       ├── chrome-adapter.js  # Chrome/Edge/Brave tab groups
│       ├── firefox-adapter.js # Firefox native groups
│       ├── safari-adapter.js  # Safari WebExtensions
│       ├── opera-adapter.js   # Opera workspaces
│       ├── bookmarks-adapter.js # Bookmark operations
│       └── fallback-adapter.js # Window-based grouping
└── icons/
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

---

## Data Schema

### Universal Export Format (v1.0)

```json
{
  "schemaVersion": "1.0",
  "exportedAt": "2025-12-12T15:00:00Z",
  "source": {
    "browser": "chrome",
    "version": "120.0.0",
    "groupSystem": "tabGroups",
    "filtersApplied": {
      "excludeInternal": true,
      "domains": ["example.com"]
    }
  },
  "bookmarks": [
    {
      "id": "1",
      "parentId": "0",
      "title": "Bookmarks Bar",
      "children": [
        {
          "title": "My Favorite",
          "url": "https://example.com",
          "dateAdded": 1638392832123
        },
        {
          "title": "Folder",
          "children": []
        }
      ]
    }
  ],
  "windows": [
    {
      "id": 1,
      "focused": true,
      "ungroupedTabs": [
        {
          "url": "https://example.com",
          "title": "Example",
          "index": 0,
          "pinned": false,
          "favIconUrl": "https://example.com/favicon.ico"
        }
      ],
      "groups": [
        {
          "title": "Work",
          "color": "blue",
          "collapsed": false,
          "metadata": {
            "originalId": "abc123",
            "originalSystem": "tabGroups"
          },
          "tabs": [
            {
              "url": "https://github.com",
              "title": "GitHub",
              "index": 1,
              "pinned": false
            }
          ]
        }
      ]
    }
  ]
}
```

### Mapping Matrix

| Source System | Target System | Mapping | Notes |
|--------------|---------------|---------|-------|
| Tab Groups | Tab Groups | 1:1 | Title, color, collapse preserved |
| Tab Groups | Workspaces | 1:1 | Color/collapse lost |
| Tab Groups | Windows | 1:N | Each group → new window |
| Workspaces | Tab Groups | 1:1 | Color assigned automatically |
| Workspaces | Workspaces | 1:1 | Full preservation |
| Workspaces | Windows | 1:N | Each workspace → new window |

---

## User Interface

### Export View

```
┌─────────────────────────────────────────────┐
│ Export Data                                 │
├─────────────────────────────────────────────┤
│ Data Types:                                 │
│ ☑ Tabs (Active Windows)                     │
│ ☑ Tab Groups                                │
│ ☑ Bookmarks                                 │
│                                             │
│ Filters (Optional):                         │
│ [ ] Only pinned tabs                        │
│ [ ] Exclude internal pages (chrome://)      │
│ [ ] Domain filter: [ example.com, work.net] │
│ [ ] Regex filter: [                       ] │
│                                             │
│ Scope:                                      │
│ ○ All Windows                               │
│ ○ Current Window Only                       │
│                                             │
│ Stats: 15 Groups, 89 Tabs, 120 Bookmarks    │
│                                             │
│ [Export JSON]                               │
└─────────────────────────────────────────────┘
```

### Import View

```
┌─────────────────────────────────────────────┐
│ Import Tabs                                 │
├─────────────────────────────────────────────┤
│ File: [tabs-2025-12-12.json    ] [Browse]   │
│                                             │
│ Detected: Chrome export (15 groups, 89 tabs)│
│           (120 bookmarks found)             │
│ Current Browser: Opera                      │
│                                             │
│ Data to Import:                             │
│ ☑ Tabs & Groups       ☑ Bookmarks           │
│                                             │
│ Tab Strategy:                               │
│ ○ Groups → Workspaces (recommended)         │
│ ○ Groups → Windows                          │
│                                             │
│ Bookmark Strategy:                          │
│ ○ Merge (keep existing)                     │
│ ○ Replace (delete all)                      │
│ ○ Import to new folder                      │
│                                             │
│ Options:                                    │
│ ☑ Preserve pinned tabs                      │
│ ☐ Open in new window                        │
│ ☐ Skip duplicate URLs                       │
│                                             │
│ [Cancel]                      [Import →]    │
└─────────────────────────────────────────────┘
```

---

## Logging Requirements

```javascript
const logger = {
  levels: { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 },
  
  log(level, action, data = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      action,
      browser: currentBrowser.name,
      ...data
    };
    console[level.toLowerCase()]('[TabMigrator]', entry);
    return entry;
  },
  
  info: (action, data) => logger.log('INFO', action, data),
  warn: (action, data) => logger.log('WARN', action, data),
  error: (action, data) => logger.log('ERROR', action, data)
};

// Example log entries
logger.info('EXPORT_START', { windows: 2, groups: 5, tabs: 45 });
logger.info('BROWSER_DETECTED', { browser: 'opera', features: {...} });
logger.warn('SKIP_TAB', { url: 'chrome://extensions', reason: 'restricted' });
logger.info('IMPORT_COMPLETE', { strategy: 'groups-to-workspaces', imported: 42 });
```

---

## Error Handling

| Error | Handling | Recovery |
|-------|----------|----------|
| Invalid JSON | Abort, show parse error | User re-selects file |
| Unsupported schema version | Warn, attempt best-effort import | — |
| Restricted URL (`chrome://`, `file://`) | Skip tab, log warning | Continue with remaining tabs |
| Rate limit hit | Exponential backoff | Retry batch |
| Unknown browser | Use fallback adapter (windows) | — |
| Workspace creation failed (Opera) | Try without workspace assignment | Log affected tabs |

---

## Known Unknowns

> [!WARNING]
> These require testing before finalizing implementation:

1. **Opera**: Exact `workspaceId` format requirements
2. **Opera**: Maximum workspace count limit
3. **Vivaldi**: Tab Stacks API accessibility from extensions
4. **Arc**: Spaces API availability
5. **Brave**: Any Brave-specific group features
6. **Edge**: Vertical tabs interaction with groups

---

## References

- [Chrome tabGroups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups)
- [Chrome tabs API](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- [Opera Extensions API](https://help.opera.com/en/extensions/apis/)
- [Edge Extension APIs](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/)
