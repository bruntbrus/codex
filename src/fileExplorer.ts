import {
  CancellationToken,
  commands,
  Disposable,
  Event,
  EventEmitter,
  ExtensionContext,
  FileChangeEvent,
  FileChangeType,
  FileSystemError,
  FileType,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
  window,
  workspace,
} from 'vscode';

import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as rimraf from 'rimraf';

//#region Utilities

namespace _ {

  function handleResult<T>(
    resolve: (result: T) => void,
    reject: (error: Error) => void,
    error: Error | null | undefined,
    result: T
  ): void {
    if (error) {
      reject(massageError(error));
    } else {
      resolve(result);
    }
  }

  function massageError(error: Error & { code?: string }): Error {
    const { code } = error;

    if (code === 'ENOENT') {
      return FileSystemError.FileNotFound();
    }

    if (code === 'EISDIR') {
      return FileSystemError.FileIsADirectory();
    }

    if (code === 'EEXIST') {
      return FileSystemError.FileExists();
    }

    if (code === 'EPERM' || code === 'EACCESS') {
      return FileSystemError.NoPermissions();
    }

    return error;
  }

  export function checkCancellation(token: CancellationToken): void {
    if (token.isCancellationRequested) {
      throw new Error('Operation cancelled');
    }
  }

  export function normalizeNFC(items: string): string;

  export function normalizeNFC(items: string[]): string[];

  export function normalizeNFC(items: string | string[]): string | string[] {
    if (process.platform !== 'darwin') {
      return items;
    }

    if (Array.isArray(items)) {
      return items.map(item => item.normalize('NFC'));
    }

    return items.normalize('NFC');
  }

  export function readdir(path: string): Promise<string[]> {
    return new Promise<string[]>((resolve, reject) => {
      fs.readdir(path, (error, children) => handleResult(resolve, reject, error, normalizeNFC(children)));
    });
  }

  export function stat(path: string): Promise<fs.Stats> {
    return new Promise<fs.Stats>((resolve, reject) => {
      fs.stat(path, (error, stat) => handleResult(resolve, reject, error, stat));
    });
  }

  export function readfile(path: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      fs.readFile(path, (error, buffer) => handleResult(resolve, reject, error, buffer));
    });
  }

  export function writefile(path: string, content: Buffer): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      fs.writeFile(path, content, error => handleResult(resolve, reject, error, void 0));
    });
  }

  export function exists(path: string): Promise<boolean> {
    return new Promise<boolean>((resolve, reject) => {
      fs.exists(path, exists => handleResult(resolve, reject, null, exists));
    });
  }

  export function rmrf(path: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      rimraf(path, error => handleResult(resolve, reject, error, void 0));
    });
  }

  export function mkdir(path: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      mkdirp(path, error => handleResult(resolve, reject, error, void 0));
    });
  }

  export function rename(oldPath: string, newPath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      fs.rename(oldPath, newPath, error => handleResult(resolve, reject, error, void 0));
    });
  }

  export function unlink(path: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      fs.unlink(path, error => handleResult(resolve, reject, error, void 0));
    });
  }
}

export class FileStat implements FileStat {
  constructor(private fsStat: fs.Stats) {}

  get type(): FileType {
    return this.fsStat.isFile()
      ? FileType.File
      : this.fsStat.isDirectory()
      ? FileType.Directory
      : this.fsStat.isSymbolicLink()
      ? FileType.SymbolicLink
      : FileType.Unknown;
  }

  get isFile(): boolean | undefined {
    return this.fsStat.isFile();
  }

  get isDirectory(): boolean | undefined {
    return this.fsStat.isDirectory();
  }

  get isSymbolicLink(): boolean | undefined {
    return this.fsStat.isSymbolicLink();
  }

  get size(): number {
    return this.fsStat.size;
  }

  get ctime(): number {
    return this.fsStat.ctime.getTime();
  }

  get mtime(): number {
    return this.fsStat.mtime.getTime();
  }
}

interface Entry {
  uri: Uri;
  type: FileType;
}

//#endregion

export class FileSystemProvider implements TreeDataProvider<Entry>, FileSystemProvider {
  private _onDidChangeFile: EventEmitter<FileChangeEvent[]>;

  constructor() {
    this._onDidChangeFile = new EventEmitter<FileChangeEvent[]>();
  }

  get onDidChangeFile(): Event<FileChangeEvent[]> {
    return this._onDidChangeFile.event;
  }

  watch(uri: Uri, options: { recursive: boolean; excludes: string[]; }): Disposable {
    const watcher = fs.watch(uri.fsPath, { recursive: options.recursive }, async (event: string, filename: string | Buffer) => {
      const filepath = path.join(uri.fsPath, _.normalizeNFC(filename.toString()));

      // TODO support excludes (using minimatch library?)

      this._onDidChangeFile.fire([{
        type: event === 'change' ? FileChangeType.Changed : await _.exists(filepath) ? FileChangeType.Created : FileChangeType.Deleted,
        uri: uri.with({ path: filepath }),
      } as FileChangeEvent]);
    });

    return {
      dispose: () => watcher.close(),
    };
  }

  stat(uri: Uri): FileStat | Thenable<FileStat> {
    return this._stat(uri.fsPath);
  }

  async _stat(path: string): Promise<FileStat> {
    return new FileStat(await _.stat(path));
  }

  readDirectory(uri: Uri): [string, FileType][] | Thenable<[string, FileType][]> {
    return this._readDirectory(uri);
  }

  async _readDirectory(uri: Uri): Promise<[string, FileType][]> {
    const children = await _.readdir(uri.fsPath);
    const result: [string, FileType][] = [];

    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const stat = await this._stat(path.join(uri.fsPath, child));

      result.push([child, stat.type]);
    }

    return Promise.resolve(result);
  }

  createDirectory(uri: Uri): void | Thenable<void> {
    return _.mkdir(uri.fsPath);
  }

  readFile(uri: Uri): Uint8Array | Thenable<Uint8Array> {
    return _.readfile(uri.fsPath);
  }

  writeFile(uri: Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): void | Thenable<void> {
    return this._writeFile(uri, content, options);
  }

  async _writeFile(uri: Uri, content: Uint8Array, options: { create: boolean; overwrite: boolean; }): Promise<void> {
    const exists = await _.exists(uri.fsPath);

    if (!exists) {
      if (!options.create) {
        throw FileSystemError.FileNotFound();
      }

      await _.mkdir(path.dirname(uri.fsPath));
    } else {
      if (!options.overwrite) {
        throw FileSystemError.FileExists();
      }
    }

    return _.writefile(uri.fsPath, content as Buffer);
  }

  delete(uri: Uri, options: { recursive: boolean; }): void | Thenable<void> {
    if (options.recursive) {
      return _.rmrf(uri.fsPath);
    }

    return _.unlink(uri.fsPath);
  }

  rename(oldUri: Uri, newUri: Uri, options: { overwrite: boolean; }): void | Thenable<void> {
    return this._rename(oldUri, newUri, options);
  }

  async _rename(oldUri: Uri, newUri: Uri, options: { overwrite: boolean; }): Promise<void> {
    const exists = await _.exists(newUri.fsPath);

    if (exists) {
      if (!options.overwrite) {
        throw FileSystemError.FileExists();
      } else {
        await _.rmrf(newUri.fsPath);
      }
    }

    const parentExists = await _.exists(path.dirname(newUri.fsPath));

    if (!parentExists) {
      await _.mkdir(path.dirname(newUri.fsPath));
    }

    return _.rename(oldUri.fsPath, newUri.fsPath);
  }

  // tree data provider

  async getChildren(element?: Entry): Promise<Entry[]> {
    if (element) {
      const children = await this.readDirectory(element.uri);

      return children.map(([name, type]) => ({ uri: Uri.file(path.join(element.uri.fsPath, name)), type }));
    }

    const workspaceFolder = workspace.workspaceFolders.filter(folder => folder.uri.scheme === 'file')[0];

    if (workspaceFolder) {
      const children = await this.readDirectory(workspaceFolder.uri);

      children.sort((a, b) => {
        if (a[1] === b[1]) {
          return a[0].localeCompare(b[0]);
        }

        return a[1] === FileType.Directory ? -1 : 1;
      });

      return children.map(([name, type]) => ({ uri: Uri.file(path.join(workspaceFolder.uri.fsPath, name)), type }));
    }

    return [];
  }

  getTreeItem(element: Entry): TreeItem {
    const treeItem = new TreeItem(
      element.uri,
      element.type === FileType.Directory ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
    );

    if (element.type === FileType.File) {
      treeItem.command = {
        command: 'fileExplorer.openFile',
        title: "Open File",
        arguments: [element.uri],
      };

      treeItem.contextValue = 'file';
    }

    return treeItem;
  }
}

export class FileExplorer {
  constructor(context: ExtensionContext) {
    const treeDataProvider = new FileSystemProvider();

    context.subscriptions.push(window.createTreeView('fileExplorer', { treeDataProvider }));

    commands.registerCommand(
      'fileExplorer.openFile',
      (resource: Uri) => this.openResource(resource)
    );
  }

  private openResource(resource: Uri): void {
    window.showTextDocument(resource);
  }
}
