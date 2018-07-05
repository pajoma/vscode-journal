export { Ctrl }  from './controller'; 
export { Startup } from './startup';
export { Logger }  from './logger';

export {
    checkIfFileIsAccessible,
    denormalizeFilename,
    formatDate,
    getDayAsString,
    getDayOfWeekForString,
    getEntryPathForDate,
    getFileInURI,
    getFilePathInDateFolder,
    getNextLine,
    getPathOfMonth,
    normalizeFilename,
    prefixZero
} from './util';


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