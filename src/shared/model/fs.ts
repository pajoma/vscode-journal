'use strict';

export enum JFileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
}

export interface JFileStat {
    type: JFileType;
    ctime: number;
    mtime: number;
    size: number;
}
