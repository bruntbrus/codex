import {
  commands,
  Event,
  EventEmitter,
  ExtensionContext,
  Range,
  Selection,
  TextDocumentChangeEvent,
  TextEditor,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  window,
  workspace,
} from 'vscode';

import { Node, getLocation, findNodeAtLocation, parseTree } from 'jsonc-parser';
import * as path from 'path';

export class JsonOutlineProvider implements TreeDataProvider<number> {
  private _onDidChangeTreeData: EventEmitter<number | null> = new EventEmitter<number | null>();
  readonly onDidChangeTreeData: Event<number | null> = this._onDidChangeTreeData.event;

  private tree: Node;
  private text: string;
  private editor: TextEditor;
  private autoRefresh = true;

  constructor(private context: ExtensionContext) {
    window.onDidChangeActiveTextEditor(() => this.onActiveEditorChanged());
    workspace.onDidChangeTextDocument((event) => this.onDocumentChanged(event));

    this.doParseTree();
    this.autoRefresh = workspace.getConfiguration('jsonOutline').get('autorefresh');

    workspace.onDidChangeConfiguration(() => {
      this.autoRefresh = workspace.getConfiguration('jsonOutline').get('autorefresh');
    });

    this.onActiveEditorChanged();
  }

  refresh(offset?: number): void {
    this.doParseTree();

    if (offset) {
      this._onDidChangeTreeData.fire(offset);
    } else {
      this._onDidChangeTreeData.fire(undefined);
    }
  }

  rename(offset: number): void {
    window.showInputBox({
      placeHolder: 'Enter the new label',
    }).then((value) => {
      if (value !== null && value !== undefined) {
        this.editor.edit((editBuilder) => {
          const locationPath = getLocation(this.text, offset).path;
          let propertyNode = findNodeAtLocation(this.tree, locationPath);

          if (propertyNode.parent.type !== 'array') {
            propertyNode = propertyNode.parent.children[0];
          }

          const { document } = this.editor;

          const range = new Range(
            document.positionAt(propertyNode.offset),
            document.positionAt(propertyNode.offset + propertyNode.length)
          );

          editBuilder.replace(range, `"${value}"`);

          setTimeout(() => {
            this.doParseTree();
            this.refresh(offset);
          }, 100);
        });
      }
    });
  }

  private onActiveEditorChanged(): void {
    const { activeTextEditor } = window;

    if (activeTextEditor) {
      const { document } = activeTextEditor;

      if (document.uri.scheme === 'file') {
        const enabled = document.languageId === 'json' || document.languageId === 'jsonc';

        commands.executeCommand('setContext', 'jsonOutlineEnabled', enabled);

        if (enabled) {
          this.refresh();
        }
      }
    } else {
      commands.executeCommand('setContext', 'jsonOutlineEnabled', false);
    }
  }

  private onDocumentChanged(changeEvent: TextDocumentChangeEvent): void {
    const { document } = this.editor;

    if (this.autoRefresh && changeEvent.document.uri.toString() === document.uri.toString()) {
      for (const change of changeEvent.contentChanges) {
        const locationPath = getLocation(this.text, document.offsetAt(change.range.start)).path;

        locationPath.pop();

        const node = locationPath.length ? findNodeAtLocation(this.tree, locationPath) : void 0;

        this.doParseTree();
        this._onDidChangeTreeData.fire(node ? node.offset : void 0);
      }
    }
  }

  private doParseTree(): void {
    this.text = '';
    this.tree = null;
    this.editor = window.activeTextEditor;

    if (this.editor && this.editor.document) {
      this.text = this.editor.document.getText();
      this.tree = parseTree(this.text);
    }
  }

  getChildren(offset?: number): Thenable<number[]> {
    if (offset) {
      const path = getLocation(this.text, offset).path;
      const node = findNodeAtLocation(this.tree, path);

      return Promise.resolve(this.getChildrenOffsets(node));
    }

    return Promise.resolve(this.tree ? this.getChildrenOffsets(this.tree) : []);
  }

  private getChildrenOffsets(node: Node): number[] {
    const offsets: number[] = [];

    for (const child of node.children) {
      const childLocation = getLocation(this.text, child.offset).path;
      const childNode = findNodeAtLocation(this.tree, childLocation);

      if (childNode) {
        offsets.push(childNode.offset);
      }
    }

    return offsets;
  }

  getTreeItem(offset: number): TreeItem {
    const location = getLocation(this.text, offset).path;
    const valueNode = findNodeAtLocation(this.tree, location);

    if (valueNode) {
      const hasChildren = valueNode.type === 'object' || valueNode.type === 'array';

      const treeItem = new TreeItem(
        this.getLabel(valueNode),
        hasChildren ? valueNode.type === 'object' ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
      );

      const { document } = this.editor;

      treeItem.command = {
        command: 'extension.openJsonSelection',
        title: '',
        arguments: [
          new Range(
            document.positionAt(valueNode.offset),
            document.positionAt(valueNode.offset + valueNode.length)
          ),
        ],
      };

      treeItem.iconPath = this.getIcon(valueNode);
      treeItem.contextValue = valueNode.type;

      return treeItem;
    }

    return null;
  }

  select(range: Range) {
    this.editor.selection = new Selection(range.start, range.end);
  }

  private getIcon(node: Node): any {
    const { context } = this;

    switch (node.type) {
      case 'boolean':
        return {
          light: context.asAbsolutePath(path.join('resources', 'light', 'boolean.svg')),
          dark: context.asAbsolutePath(path.join('resources', 'dark', 'boolean.svg')),
        };

      case 'string':
        return {
          light: context.asAbsolutePath(path.join('resources', 'light', 'string.svg')),
          dark: context.asAbsolutePath(path.join('resources', 'dark', 'string.svg')),
        };

      case 'number':
        return {
          light: context.asAbsolutePath(path.join('resources', 'light', 'number.svg')),
          dark: context.asAbsolutePath(path.join('resources', 'dark', 'number.svg')),
        };
    }

    return null;
  }

  private getLabel(node: Node): string {
    const { parent, type } = node;

    if (parent.type === 'array') {
      const prefix = parent.children.indexOf(node).toString();

      if (type === 'object') {
        return prefix + ':{ }';
      }

      if (type === 'array') {
        return prefix + ':[ ]';
      }

      return prefix + ':' + node.value.toString();
    }

    const property = parent.children[0].value.toString();

    if (type === 'array' || type === 'object') {
      if (type === 'object') {
        return '{ } ' + property;
      }

      if (type === 'array') {
        return '[ ] ' + property;
      }
    }

    const { document } = this.editor;
    const value = document.getText(new Range(document.positionAt(node.offset), document.positionAt(node.offset + node.length)));

    return `${property}: ${value}`;
  }
}
