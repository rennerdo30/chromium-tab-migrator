Now I understand the issue. Let me provide the actual information:

## Opera Workspaces API - Current Status

**Unfortunately, Opera does NOT have a public API to CREATE or MANAGE workspaces programmatically.** Here's what's actually available:

### What the Tabs API Provides (Opera 77+)

You can only **read** workspace information from tabs, not create workspaces:

```javascript
// Get all tabs with workspace information
chrome.tabs.query({}, (tabs) => {
  tabs.forEach(tab => {
    console.log({
      title: tab.title,
      workspaceId: tab.workspaceId,    // Available in Opera 77+
      workspaceName: tab.workspaceName  // Available in Opera 77+
    });
  });
});
```

### Limitations

- ❌ **No `chrome.workspaces` API** to create/delete workspaces
- ❌ **No method** to programmatically create or configure workspaces
- ❌ **Read-only**: You can only query which workspace a tab belongs to
- ✅ **What works**: You can organize tabs by detecting their workspace and performing actions on them

### Workaround: Organize Tabs into Groups

Since workspace creation isn't available via API, you can use **tab groups** instead:

```javascript
// Create a tab group (Chrome/Opera 88+)
chrome.tabs.group({
  tabIds: [tabId1, tabId2, tabId3]
}, (groupId) => {
  console.log('Tabs grouped with ID:', groupId);
  
  // Update group title
  chrome.tabGroups.update(groupId, {
    title: "Work Project",
    color: "blue"
  });
});
```

### Feature Request

The Opera team hasn't implemented workspace creation APIs yet. Your best option is:

1. **Use tab groups API** (limited but works)
2. **Request the feature** from Opera via their extension forum
3. **Consider using Chrome/Brave** which have more advanced tab grouping features

Would you like help creating an extension that uses **tab groups** to simulate workspace organization instead?

[1](https://stackoverflow.com/questions/66994576/opera-api-is-there-a-way-to-get-the-tabs-in-the-current-workspace)
[2](https://github.com/operasoftware/operaextensions.js/)
[3](https://help.opera.com/en/extensions/apis/)
[4](https://www.reddit.com/r/operabrowser/comments/1cp65jj/oprea_gx_workspaces_how_do_they_work/)
[5](https://docs.devolutions.net/workspace/workspace-browser-extension/installation/opera/)
[6](https://learn.microsoft.com/en-us/rest/api/fabric/core/workspaces/create-workspace)
[7](https://docs.devolutions.net/workspace/kb/workspace-browser-extension/workspace-browser-extension-troubleshooting-connection-logs/)
[8](https://help.opera.com/en/opera-mini-and-javascript/)
[9](https://help.opera.com/en/extensions/addons-api/)
[10](https://docs.devolutions.net/kb/workspace-browser-extension/how-to-articles/workspace-browser-extension-opera-installation/)