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

import { JournalPaths, JournalScopes, JournalSettings } from 'journal-core';

type Config = JournalSettings & JournalScopes & JournalPaths;

/** The current layout of every scope (its patterns and extension), to notice when the settings change it (#309). */
export function currentLayouts(config: Config): Map<string, string> {
    return new Map(config.getScopeList().map(scope => {
        const [layout] = config.getLayouts(scope.isDefault ? undefined : scope.name);
        return [scope.name, JSON.stringify([layout.patterns, layout.ext])];
    }));
}

/** The scopes whose layout changed; scopes that were added or removed in between do not count. */
export function changedLayouts(before: Map<string, string>, after: Map<string, string>): string[] {
    return [...after].filter(([scope, layout]) => before.has(scope) && before.get(scope) !== layout).map(([scope]) => scope);
}
