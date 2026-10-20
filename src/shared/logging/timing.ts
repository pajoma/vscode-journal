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

import { ILogger } from '../model/index';

/**
 * Runs the task and logs how long it took, `[timing] <label>: 123 ms`, at
 * debug level (shown with `journal.dev`). For finding what makes a click slow.
 */
export async function timed<T>(logger: ILogger, label: string, task: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
        return await task();
    } finally {
        logger.debug(`[timing] ${label}: ${Date.now() - start} ms`);
    }
}
