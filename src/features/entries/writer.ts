// Copyright (C) 2016  Patrick Maué
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
// 

'use strict';

import { IConfiguration, IFileSystem, ILogger } from '../../shared/model/index';

/**
 * Creates journal files with their configured content; returns their paths.
 * Opening and showing them is up to the editor (#239).
 */
export class Writer {

    constructor(
        private config: IConfiguration,
        private logger: ILogger,
        private fs: IFileSystem,
    ) { }

    /** Creates the file for a journal entry from the entry template. */
    public async createEntryForPath(path: string, date: Date): Promise<string> {
        this.logger.trace("Entering createEntryForPath() in writer.ts for path: ", path);
        const tpl = await this.config.getEntryTemplate(date);
        return this.createFile(path, tpl.value || "");
    }

    /** Creates the file for a weekly entry from the weekly template. */
    public async createWeeklyForPath(path: string, week: number, year: number): Promise<string> {
        this.logger.trace("Entering createWeeklyForPath() in writer.ts for path: ", path);
        const tpl = await this.config.getWeeklyTemplate(week, year);
        return this.createFile(path, tpl.value || "");
    }

    /** Writes a new file with the given content. */
    public async createFile(path: string, content: string): Promise<string> {
        this.logger.trace("Entering createFile() in writer.ts for path: ", path);
        await this.fs.writeFile(path, new TextEncoder().encode(content));
        this.logger.debug("Created file: ", path);
        return path;
    }
}
