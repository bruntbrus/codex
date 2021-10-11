import {
  Command,
  Event,
  EventEmitter,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  window,
} from 'vscode';

import * as fs from 'fs';
import * as path from 'path';

export class DepNodeProvider implements TreeDataProvider<Dependency> {

  private _onDidChangeTreeData: EventEmitter<Dependency | undefined | void> = new EventEmitter<Dependency | undefined | void>();
  readonly onDidChangeTreeData: Event<Dependency | undefined | void> = this._onDidChangeTreeData.event;

  constructor(private workspaceRoot: string) {
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Dependency): TreeItem {
    return element;
  }

  getChildren(element?: Dependency): Thenable<Dependency[]> {
    if (!this.workspaceRoot) {
      window.showInformationMessage('No dependency in empty workspace');
      return Promise.resolve([]);
    }

    if (element) {
      return Promise.resolve(this.getDepsInPackageJson(path.join(this.workspaceRoot, 'node_modules', element.label, 'package.json')));
    } else {
      const packageJsonPath = path.join(this.workspaceRoot, 'package.json');
      if (this.pathExists(packageJsonPath)) {
        return Promise.resolve(this.getDepsInPackageJson(packageJsonPath));
      } else {
        window.showInformationMessage('Workspace has no package.json');
        return Promise.resolve([]);
      }
    }

  }

  /**
   * Given the path to package.json, read all its dependencies and devDependencies.
   */
  private getDepsInPackageJson(packageJsonPath: string): Dependency[] {
    if (this.pathExists(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      const toDep = (moduleName: string, version: string): Dependency => {
        if (this.pathExists(path.join(this.workspaceRoot, 'node_modules', moduleName))) {
          return new Dependency(moduleName, version, TreeItemCollapsibleState.Collapsed);
        } else {
          return new Dependency(moduleName, version, TreeItemCollapsibleState.None, {
            command: 'extension.openPackageOnNpm',
            title: '',
            arguments: [moduleName]
          });
        }
      };

      const deps = packageJson.dependencies
        ? Object.keys(packageJson.dependencies).map(dep => toDep(dep, packageJson.dependencies[dep]))
        : [];
      const devDeps = packageJson.devDependencies
        ? Object.keys(packageJson.devDependencies).map(dep => toDep(dep, packageJson.devDependencies[dep]))
        : [];
      return deps.concat(devDeps);
    } else {
      return [];
    }
  }

  private pathExists(p: string): boolean {
    try {
      fs.accessSync(p);
    } catch (err) {
      return false;
    }

    return true;
  }
}

export class Dependency extends TreeItem {

  constructor(
    public readonly label: string,
    private readonly version: string,
    public readonly collapsibleState: TreeItemCollapsibleState,
    public readonly command?: Command
  ) {
    super(label, collapsibleState);

    this.tooltip = `${this.label}-${this.version}`;
    this.description = this.version;
  }

  iconPath = {
    light: path.join(__filename, '..', '..', 'resources', 'light', 'dependency.svg'),
    dark: path.join(__filename, '..', '..', 'resources', 'dark', 'dependency.svg')
  };

  contextValue = 'dependency';
}
