// Copyright (C) 2018 Patrick Maué
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
import { types } from 'util';

export function isNullOrUndefined(value: any | undefined | null): boolean {
    return value === null || value === undefined;
}


export function isNotNullOrUndefined(value: any | undefined | null): boolean {
    return value !== null && value !== undefined;
}


export function isError(object: any | Error | undefined ): boolean {
    return isNotNullOrUndefined(object) && types.isNativeError(object);
}

