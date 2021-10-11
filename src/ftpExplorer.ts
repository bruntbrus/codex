import {
  CancellationToken,
  commands,
  Event,
  EventEmitter,
  ExtensionContext,
  ProviderResult,
  TextDocumentContentProvider,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  TreeView,
  Uri,
  window,
  workspace,
} from 'vscode';

import * as Client from 'ftp';
import * as path from 'path';

interface IEntry {
  name: string;
  type: string;
}

export interface FtpNode {
  resource: Uri;
  isDirectory: boolean;
}

export class FtpModel {
  constructor(readonly host: string, private user: string, private password: string) {}

  public connect(): Thenable<Client> {
    return new Promise((resolve, reject) => {
      const client = new Client();

      client.on('ready', () => {
        resolve(client);
      });

      client.on('error', (error) => {
        reject(`Error while connecting: ${error.message}`);
      });

      client.connect({
        host: this.host,
        username: this.user,
        password: this.password,
      });
    });
  }

  public get roots(): Thenable<FtpNode[]> {
    return this.connect().then((client: Client) => {
      return new Promise((resolve, reject) => {
        client.list((err, list) => {
          if (err) {
            return reject(err);
          }

          client.end();

          return resolve(this.sort(list.map((entry) => ({
            resource: Uri.parse(`ftp://${this.host}///${entry.name}`),
            isDirectory: entry.type === 'd',
          }))));
        });
      });
    });
  }

  public getChildren(node: FtpNode): Thenable<FtpNode[]> {
    return this.connect().then((client: Client) => {
      return new Promise((resolve, reject) => {
        client.list(node.resource.fsPath, (err, list) => {
          if (err) {
            return reject(err);
          }

          client.end();

          return resolve(this.sort(list.map((entry) => ({
            resource: Uri.parse(`${node.resource.fsPath}/${entry.name}`),
            isDirectory: entry.type === 'd',
          }))));
        });
      });
    });
  }

  private sort(nodes: FtpNode[]): FtpNode[] {
    return nodes.sort((n1, n2) => {
      if (n1.isDirectory && !n2.isDirectory) {
        return -1;
      }

      if (!n1.isDirectory && n2.isDirectory) {
        return 1;
      }

      return path.basename(n1.resource.fsPath).localeCompare(path.basename(n2.resource.fsPath));
    });
  }

  public getContent(resource: Uri): Thenable<string> {
    return this.connect().then((client: Client) => {
      return new Promise((resolve, reject) => {
        client.get(resource.path.substr(2), (err, stream) => {
          if (err) {
            return reject(err);
          }

          let string = '';

          stream.on('data', (buffer) => {
            if (buffer) {
              string += buffer.toString();
            }
          });

          stream.on('end', () => {
            client.end();
            resolve(string);
          });
        });
      });
    });
  }
}

export class FtpTreeDataProvider implements TreeDataProvider<FtpNode>, TextDocumentContentProvider {
  private _onDidChangeTreeData: EventEmitter<any> = new EventEmitter<any>();

  readonly onDidChangeTreeData: Event<any> = this._onDidChangeTreeData.event;

  constructor(private readonly model: FtpModel) {}

  public refresh(): any {
    this._onDidChangeTreeData.fire(undefined);
  }

  public getTreeItem(element: FtpNode): TreeItem {
    return {
      resourceUri: element.resource,
      collapsibleState: element.isDirectory ? TreeItemCollapsibleState.Collapsed : void 0,
      command: element.isDirectory ? void 0 : {
        command: 'ftpExplorer.openFtpResource',
        arguments: [element.resource],
        title: 'Open FTP Resource',
      },
    };
  }

  public getChildren(element?: FtpNode): FtpNode[] | Thenable<FtpNode[]> {
    return element ? this.model.getChildren(element) : this.model.roots;
  }

  public getParent(element: FtpNode): FtpNode {
    const parent = element.resource.with({ path: path.dirname(element.resource.path) });

    return parent.path !== '//' ? { resource: parent, isDirectory: true } : null;
  }

  public provideTextDocumentContent(uri: Uri, token: CancellationToken): ProviderResult<string> {
    return this.model.getContent(uri).then(content => content);
  }
}

export class FtpExplorer {
  private ftpViewer: TreeView<FtpNode>;

  constructor(context: ExtensionContext) {
    /* Please note that login information is hardcoded only for this example purpose and recommended not to do it in general. */
    const ftpModel = new FtpModel('mirror.switch.ch', 'anonymous', 'anonymous@anonymous.de');
    const treeDataProvider = new FtpTreeDataProvider(ftpModel);

    context.subscriptions.push(workspace.registerTextDocumentContentProvider('ftp', treeDataProvider));

    this.ftpViewer = window.createTreeView('ftpExplorer', { treeDataProvider });

    commands.registerCommand(
      'ftpExplorer.refresh',
      () => treeDataProvider.refresh()
    );

    commands.registerCommand(
      'ftpExplorer.openFtpResource',
      resource => this.openResource(resource)
    );

    commands.registerCommand(
      'ftpExplorer.revealResource',
      () => this.reveal()
    );
  }

  private openResource(resource: Uri): void {
    window.showTextDocument(resource);
  }

  private reveal(): Thenable<void> {
    const node = this.getNode();

    if (node) {
      return this.ftpViewer.reveal(node);
    }

    return null;
  }

  private getNode(): FtpNode {
    const { activeTextEditor } = window;

    if (activeTextEditor) {
      const { uri } = activeTextEditor.document;

      if (uri.scheme === 'ftp') {
        return {
          resource: uri,
          isDirectory: false,
        };
      }
    }
    return null;
  }
}
