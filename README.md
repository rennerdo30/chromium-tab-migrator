# Browser Tab & Bookmark Migrator

<p align="center">
  <img src="icons/logo.svg" alt="Browser Tab Migrator Logo" width="128" height="128">
</p>

<p align="center">
  <strong>Cross-browser extension for migrating tabs, groups, and bookmarks between browsers.</strong>
</p>

<p align="center">
  <a href="#supported-browsers">Supported Browsers</a> &bull;
  <a href="#features">Features</a> &bull;
  <a href="#installation">Installation</a> &bull;
  <a href="#usage">Usage</a> &bull;
  <a href="#development">Development</a>
</p>

---

## Supported Browsers

| Browser | Export | Import | Group System |
|---------|--------|--------|--------------|
| Chrome | Yes | Yes | Tab Groups |
| Edge | Yes | Yes | Tab Groups |
| Brave | Yes | Yes | Tab Groups |
| Opera | Yes | Yes | Workspaces |
| Firefox | Yes | Yes | Tab Groups (139+) |
| Safari | Yes | Yes | Tab Groups |
| Vivaldi | Yes | Limited | Tab Stacks |

## Features

### Core Features

- **Universal Export**: Export tabs, groups, and bookmarks to a browser-agnostic JSON format
- **Universal Import**: Import JSON with automatic browser-specific mapping
- **Granular Control**: Select exactly what to export (Tabs, Groups, Bookmarks)
- **Export Filters**: Filter by domain, regex, or scope (all windows/current window)
- **Smart Mapping**: Automatically maps tab groups to workspaces (and vice versa)
- **Progress Tracking**: Real-time progress bar with cancel support
- **Safe Import**: Lazy loading and tab discarding to prevent memory/network issues

### Mapping Strategies

**Tab Groups:**
- Groups to Groups (Chrome, Edge, Brave, Firefox)
- Groups to Workspaces (Chrome → Opera)
- Workspaces to Groups (Opera → Chrome)
- Flatten (ignore grouping)
- Windows (each group → new window)

**Bookmarks:**
- Merge (keep existing, add new)
- Replace (full migration)
- Import to folder (safe backup)

## Installation

### From Source (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/chromium-tab-migrator.git
   ```

2. Load the extension in your browser:

   **Chrome/Edge/Brave:**
   - Go to `chrome://extensions/` (or `edge://extensions/`, `brave://extensions/`)
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `chromium-tab-migrator` folder

   **Firefox:**
   - Go to `about:debugging#/runtime/this-firefox`
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file

   **Opera:**
   - Go to `opera://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `chromium-tab-migrator` folder

## Usage

### Exporting

1. Click the extension icon in your browser toolbar
2. Select what to export: Tabs, Groups, Bookmarks
3. Configure optional filters (domains, pinned only, etc.)
4. Choose scope: All Windows or Current Window
5. Click "Export JSON"
6. Save the file

### Importing

1. Click the extension icon
2. Switch to "Import" tab
3. Select a previously exported JSON file
4. Choose your import strategy:
   - How to handle groups (map to groups/workspaces/windows)
   - How to handle bookmarks (merge/replace/folder)
5. Configure options (preserve pinned, skip duplicates, etc.)
6. Click "Import"

## Development

### Project Structure

```
chromium-tab-migrator/
├── manifest.json           # Extension manifest (V3)
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.css           # Styles
│   └── popup.js            # Popup logic
├── background/
│   └── service-worker.js   # Background service worker
├── lib/
│   ├── logger.js           # Structured logging
│   ├── browser-detect.js   # Browser capability detection
│   ├── exporter.js         # Export functionality
│   ├── importer.js         # Import orchestrator
│   └── adapters/           # Browser-specific adapters
│       ├── chrome-adapter.js
│       ├── firefox-adapter.js
│       ├── safari-adapter.js
│       ├── opera-adapter.js
│       ├── bookmarks-adapter.js
│       └── fallback-adapter.js
└── icons/
    ├── logo.svg            # Source logo
    ├── icon-16.png
    ├── icon-48.png
    └── icon-128.png
```

### Export Format

The extension uses a universal JSON format (v1.0) that captures:
- Source browser and version
- Windows with grouped and ungrouped tabs
- Tab metadata (URL, title, pinned state, favicon)
- Group metadata (title, color, collapsed state)
- Bookmarks (full tree structure)

### Browser Detection

The extension automatically detects the current browser and its capabilities:
- Tab Groups support
- Workspace support (Opera)
- Color/collapse support
- Available APIs

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
