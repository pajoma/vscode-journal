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

import { InlineTemplate } from '../../model';

/** Shape of the `journal.patterns` setting. */
export type PatternDefinition = {
    notes: { path: string; file: string };
    entries: { path: string; file: string };
    weeks: { path: string; file: string };
    weeklyNotes?: { path: string; file: string };
};

/** Shape of a single entry in the `journal.scopes` setting. */
export type ScopeDefinition = {
    name: string;
    base?: string;
    patterns: PatternDefinition;
    templates: InlineTemplate[];
};

export const defaultPatternDefinition: PatternDefinition = {
    notes: {
        path: "${base}/${year}/${month}/${day}",
        file: "${input}.${ext}"
    },
    entries: {
        path: "${base}/${year}/${month}",
        file: "${day}.${ext}"
    },
    weeks: {
        path: "${base}/${year}",
        file: "week_${week}.${ext}"
    },
    weeklyNotes: {
        path: "${base}/${year}/w${week}",
        file: "${input}.${ext}"
    }
};
