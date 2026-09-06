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
| Vivaldi | Yes | Yes | Tab Stacks |

Detection is based on the user agent. Vivaldi hides its own identity by default, so
it is detected as Chrome and uses the Chromium code path — which is what you want,
since Vivaldi renders Chromium tab groups as Tab Stacks.

## Features

### Core Features

- **Universal Export**: Export tabs, groups, and bookmarks to a browser-agnostic JSON format
- **Universal Import**: Import JSON with automatic browser-specific mapping
- **Granular Control**: Choose whether to move tabs & groups, bookmarks, or both
- **Export Filters**: Restrict the export to a list of domains, and skip internal pages (`chrome://`, `about:`)
- **Progress Tracking**: Live progress bar with a working cancel button
- **Safe Import**: Tabs are created inactive and immediately discarded, so restoring a
  few hundred tabs does not load a few hundred pages
- **Light & Dark**: Follows your OS theme, with a toggle in the popup that sticks

### Mapping

The destination for imported tabs follows what the current browser supports: browsers
with the Tab Groups API get real tab groups, and Opera-style browsers with workspaces
get workspaces. The popup shows which one applies and disables the option your browser
cannot provide.

**Bookmarks:**
- Merge (keeps everything you have, adds the backup under "Other Bookmarks")
- Into a subfolder (everything lands in one dated folder, easiest to undo)

## Installation

### From Source (Development)

1. Clone this repository:
   ```bash
   git clone https://github.com/rennerdo30/chromium-tab-migrator.git
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
2. Select what to save: Tabs & groups, Bookmarks, or both
3. Optionally narrow it down with the domain filter, and choose whether to skip
   internal pages
4. Click "Export data" and pick where to save the file

Every normal window is included. The file is named `tabs-export-YYYY-MM-DD.json`.

### Importing

1. Click the extension icon and switch to the "Import" tab
2. Choose a JSON file created by Export — the popup reports how many tabs, windows
   and bookmarks it found before you commit to anything
3. Pick what to restore and which bookmarks mode to use
4. Click "Start restore". Use "Cancel restore" to stop partway; tabs already
   created stay put

Each window in the backup becomes a new browser window.

## Development

### Project Structure

```
chromium-tab-migrator/
├── manifest.json           # Extension manifest (V3)
├── popup/
│   ├── popup.html          # Extension popup UI
│   ├── popup.css           # Design tokens, light/dark themes, styles
│   ├── theme.js            # Applies the stored theme before first paint
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

### Tech Stack

No build step, no bundler, no dependencies — load the folder and it runs.

- Manifest V3, ES modules, plain DOM
- Hand-written CSS with custom-property design tokens, and a light and dark palette
  that follow `prefers-color-scheme` until you pick one
- No remote assets. MV3's extension CSP has no way to allow a remote stylesheet or
  font host, so the popup uses the platform UI font stack and inline SVG icons

### Accessibility

- Every control is reachable by keyboard with a visible focus ring
- The Export/Import switcher is a real ARIA tablist with arrow-key navigation
- Status and progress updates are announced via live regions
- Animations are dropped under `prefers-reduced-motion`

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
