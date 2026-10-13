// Copyright (C) 2026 Patrick Maué
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

export { replaceVariable, resolveDate, resolveDayOffsets, templatePattern, toMomentFormat } from './template';
export { normalizeFilename } from './filenames';
export { daysOfWeek, firstDayOfWeek, Week, weekOf } from './weeks';
export { CHECKBOX, DONE_ANNOTATION, DONE_TIME_FORMAT, doneSuffix, MOVED_SUFFIX, movedSuffix, TASK_BOX, withoutDone } from './tasks';
export { DEFAULT_PATTERNS, SETTINGS_DEFAULTS, SettingsWithDefaults } from './config/defaults';
export { JournalPaths, JournalScopes, JournalSettings, JournalTemplates } from './config/interfaces';
export { JournalConfiguration } from './config/journal-configuration';
export { PathResolver } from './config/path-resolver';
export { Scope, ScopeKind } from './config/scope';
export { SCOPE_NAME, ScopeRegistry } from './config/scope-registry';
export { SettingsReader } from './config/settings-reader';
export { TEMPLATE_FALLBACKS, TemplateProvider } from './config/template-provider';
export {
    EntryGranularity, HeaderTemplate, HostEnvironment, InlineTemplate, IWorkspaceConfigReader, NO_HOST,
    PatternDefinition, Resolved, SCOPE_DEFAULT, ScopeDefinition, ScopedTemplate,
} from './config/types';
