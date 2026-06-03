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

import { IConfiguration, ILogger } from '../../shared/model/index';

/**
 * Builds the initial content of new journal files from the configured
 * templates. Pure domain logic — no VS Code dependency; the caller writes the
 * content and opens the document via the editor adapter (#239).
 */
export class Writer {

    constructor(
        private config: IConfiguration,
        private logger: ILogger,
    ) { }

    /** Renders the configured entry template for the given date. */
    public async buildEntryContent(date: Date, scopeId?: string): Promise<string> {
        this.logger.trace("Entering buildEntryContent() in writer.ts for date: ", date.toISOString());
        const tpl = await this.config.getEntryTemplate(date, scopeId);
        return tpl.value || "";
    }

    /** Renders the configured weekly template for the given week number. */
    public async buildWeeklyContent(week: Number, scopeId?: string): Promise<string> {
        this.logger.trace("Entering buildWeeklyContent() in writer.ts for week: ", week);
        const tpl = await this.config.getWeeklyTemplate(week, scopeId);
        return tpl.value || "";
    }
}
