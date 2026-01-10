/**
 * Bookmarks Adapter
 * Handles import of bookmark trees
 */

import { logger } from '../logger.js';

export class BookmarksAdapter {
    /**
     * Import bookmarks
     * @param {Array} bookmarksData - Root nodes from export
     * @param {string} strategy - 'merge', 'replace', 'folder'
     */
    async import(bookmarksData, strategy) {
        let count = 0;

        if (strategy === 'folder') {
            const folderName = `Imported ${new Date().toLocaleDateString()}`;
            const root = await chrome.bookmarks.create({ title: folderName });
            count = await this._processNodes(bookmarksData, root.id);
        } else {
            // Merge/Replace logic (simplified for MVP: Merge top-level)
            // Note: 'Replace' is dangerous, usually better to 'Merge'.
            // For MVP we will treat 'merge' and 'replace' similarly: add to Other Bookmarks or Bar
            // To strictly implement 'replace', we would need to delete everything first.

            // We'll traverse the exported tree and append to matching roots if found, 
            // or "Other Bookmarks" if not sure.

            // Standard Chrome Roots: '1' (Bar), '2' (Other), '3' (Mobile)
            // But IDs vary. We shouldn't rely on IDs.

            // Simple Approach: Import everything into 'Other Bookmarks' to be safe
            // unless we find better matching logic.
            const otherBookmarks = (await chrome.bookmarks.getTree())[0].children.find(n => n.title === 'Other Bookmarks') || { id: '2' };

            count = await this._processNodes(bookmarksData, otherBookmarks.id);
        }

        return count;
    }

    async _processNodes(nodes, parentId) {
        let imported = 0;
        for (const node of nodes) {
            if (node.id === '0') {
                // Root node, skip and process children
                if (node.children) imported += await this._processNodes(node.children, parentId);
                continue;
            }

            // Skip root folders like "Bookmarks Bar" if we are already inside a specific target
            // But if we are merging, we might want to find the matching local folder.

            if (node.url) {
                // It's a bookmark
                await chrome.bookmarks.create({
                    parentId,
                    title: node.title,
                    url: node.url
                });
                imported++;
            } else {
                // It's a folder
                const newFolder = await chrome.bookmarks.create({
                    parentId,
                    title: node.title
                });
                if (node.children) {
                    imported += await this._processNodes(node.children, newFolder.id);
                }
            }
        }
        return imported;
    }
}
