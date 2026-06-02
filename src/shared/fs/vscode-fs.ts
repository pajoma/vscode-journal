'use strict';

import * as vscode from 'vscode';
import { IFileSystem, JFileStat, JFileType } from '../model/index';

function toJFileType(t: vscode.FileType): JFileType {
    switch (t) {
        case vscode.FileType.File: return JFileType.File;
        case vscode.FileType.Directory: return JFileType.Directory;
        case vscode.FileType.SymbolicLink: return JFileType.SymbolicLink;
        default: return JFileType.Unknown;
    }
}

function toJFileStat(s: vscode.FileStat): JFileStat {
    return { type: toJFileType(s.type), ctime: s.ctime, mtime: s.mtime, size: s.size };
}

export class VscodeFileSystem implements IFileSystem {

    private uri(path: string): vscode.Uri {
        return vscode.Uri.file(path);
    }

    async stat(path: string): Promise<JFileStat> {
        return toJFileStat(await vscode.workspace.fs.stat(this.uri(path)));
    }

    async readFile(path: string): Promise<Uint8Array> {
        return vscode.workspace.fs.readFile(this.uri(path));
    }

    async writeFile(path: string, content: Uint8Array): Promise<void> {
        return vscode.workspace.fs.writeFile(this.uri(path), content);
    }

    async readDirectory(path: string): Promise<[string, JFileType][]> {
        const entries = await vscode.workspace.fs.readDirectory(this.uri(path));
        return entries.map(([name, type]) => [name, toJFileType(type)]);
    }

    async createDirectory(path: string): Promise<void> {
        return vscode.workspace.fs.createDirectory(this.uri(path));
    }

    async delete(path: string, options?: { recursive?: boolean }): Promise<void> {
        return vscode.workspace.fs.delete(this.uri(path), options);
    }
}
