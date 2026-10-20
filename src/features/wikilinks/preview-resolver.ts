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

import * as Path from 'path';
import { pathToFileURL } from 'url';
import { JournalFiles, resolveWikiTarget } from './journal-files';
import { WikiLinkResolver } from './markdown-plugin';

/** The document VS Code renders: `env.currentDocument`, a vscode.Uri when rendering, unset when parsing. */
interface RenderedDocument {
    scheme: string;
    fsPath: string;
}

/**
 * How the markdown preview finds and links the file of a wiki link (#92):
 * the file from the last scan of the journal (the preview renders
 * synchronously), the link relative to the rendered document. The preview
 * opens a link on click only if it has no scheme; without the document
 * (when parsing, or markdown.api.render with a text) the file's file: URI.
 */
export function previewResolver(files: () => JournalFiles | undefined): WikiLinkResolver {
    return {
        file: target => {
            const scanned = files();
            const resolved = scanned && resolveWikiTarget(target, scanned);
            return resolved?.kind === 'found' ? resolved.path : undefined;
        },
        href: previewHref,
    };
}

/** The href of a file for the rendered document: relative to it, else the file: URI. */
export function previewHref(file: string, env: unknown): string {
    const document = (env as { currentDocument?: RenderedDocument } | undefined)?.currentDocument;
    return document?.scheme === 'file'
        ? encodeURI(Path.relative(Path.dirname(document.fsPath), file).split(Path.sep).join('/'))
        : pathToFileURL(file).toString();
}
