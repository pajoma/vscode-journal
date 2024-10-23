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


export { Ctrl } from './controller';

export { ConsoleLogger, Logger } from './logger';

export {
    isNotNullOrUndefined,
    isNullOrUndefined,
    isError


} from './util';


export {
    formatDate, 
    getDayOfWeekForString, 
    replaceDateFormats, 
    replaceDateTemplatesWithMomentsFormats, 
    getMonthForString
}
from './dates'; 

export {
    getNextLine, 
    denormalizeFilename,
    getDayAsString,
    isString,
    normalizeFilename,
    prefixZero,replaceVariableValue,stringIsNotEmpty
}
from './strings'; 

export {
    checkIfFileIsAccessible,
    getDateFromURI,
    getDateFromURIAndConfig,
    getFileInURI,
    getFilePathInDateFolder,
    getPathAsString,
    getPathOfMonth,
    inferType,
    resolvePath
}
from './paths'; 

/*
declare module Comm {
    export const Comfiguration  = _Configuration; 
    export const TemplateInfo  = _TemplateInfo; 
    export const Util  = _Util; 
}

export namespace Common {
    export const Comfiguration  = _Configuration; 
    export const TemplateInfo  = _TemplateInfo; 
    export const Util  = _Util; 
}
*/