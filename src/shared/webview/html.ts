// Copyright (C) 2026  Patrick Maué
//
// This file is part of vscode-journal.
//
// vscode-journal is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// vscode-journal is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with vscode-journal.  If not, see <http://www.gnu.org/licenses/>.

'use strict';

/**
 * Building blocks for the extension's webviews: the page with its content
 * security policy and the VS Code theme, and HTML escaping. No vscode import:
 * the pages are rendered and tested without VS Code; the panel passes in the
 * webview's `cspSource` and a fresh nonce.
 */

/** What a page needs from its webview. */
export interface WebviewPage {
    /** `webview.cspSource`: the origin of the webview's own resources. */
    cspSource: string;
    /** A fresh random value per rendering; only scripts and styles with it run. */
    nonce: string;
}

/** Text for HTML content and attribute values. */
export function escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A random nonce for the content security policy. */
export function createNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) { nonce += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return nonce;
}

/**
 * A complete page: no remote content, only the inline style and script with
 * the nonce, colors and fonts from the VS Code theme.
 */
export function webviewHtml(page: WebviewPage, title: string, body: string, script = '', style = ''): string {
    const csp = [
        "default-src 'none'",
        `img-src ${page.cspSource} data:`,
        `style-src 'nonce-${page.nonce}'`,
        `script-src 'nonce-${page.nonce}'`,
    ].join('; ');
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style nonce="${page.nonce}">${BASE_STYLE}${style}</style>
</head>
<body>
${body}
${script ? `<script nonce="${page.nonce}">${script}</script>` : ''}
</body>
</html>`;
}

/** Theme-aware defaults for every page: text, tables, buttons, inputs, notices. */
const BASE_STYLE = `
body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 0 20px 24px; line-height: 1.5; }
h1 { font-size: 1.5em; font-weight: 600; margin: 16px 0 8px; }
h2 { font-size: 1.15em; font-weight: 600; margin: 24px 0 8px; border-bottom: 1px solid var(--vscode-panel-border, transparent); padding-bottom: 4px; }
code, .path { font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
table { border-collapse: collapse; width: 100%; }
th, td { text-align: left; padding: 4px 8px; vertical-align: top; border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.2)); }
th { font-weight: 600; color: var(--vscode-descriptionForeground); }
td.path { word-break: break-all; }
button { font-family: inherit; font-size: inherit; padding: 4px 14px; border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; cursor: pointer; color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
button:hover { background: var(--vscode-button-hoverBackground); }
button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
button:disabled { opacity: .5; cursor: default; }
input[type=search] { font-family: inherit; font-size: inherit; padding: 3px 6px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, transparent); min-width: 240px; }
.notice { padding: 8px 12px; margin: 12px 0; border-left: 3px solid var(--vscode-textLink-foreground); background: var(--vscode-textBlockQuote-background); }
.notice.warning { border-left-color: var(--vscode-editorWarning-foreground); }
.notice.error { border-left-color: var(--vscode-editorError-foreground); }
.muted { color: var(--vscode-descriptionForeground); }
.toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 12px 0; }
.toolbar .spacer { flex: 1; }
details { margin: 4px 0; }
summary { cursor: pointer; }
`;
