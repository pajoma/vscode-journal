export { Ctrl }  from './controller'; 
export { Startup } from './startup';

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
    prefixZero,
    DEV_MODE, 
    trace, 
    debug, 
    error
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