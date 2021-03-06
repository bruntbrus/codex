import {
  commands,
  ExtensionContext,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  window,
} from 'vscode';

export class TestView {

  constructor(context: ExtensionContext) {
    const view = window.createTreeView('testView', { treeDataProvider: aNodeWithIdTreeDataProvider(), showCollapseAll: true });
    context.subscriptions.push(view);
    commands.registerCommand('testView.reveal', async () => {
      const key = await window.showInputBox({ placeHolder: 'Type the label of the item to reveal' });
      if (key) {
        await view.reveal({ key }, { focus: true, select: false, expand: true });
      }
    });
    commands.registerCommand('testView.changeTitle', async () => {
      const title = await window.showInputBox({ prompt: 'Type the new title for the Test View', placeHolder: view.title });
      if (title) {
        view.title = title;
      }
    });
  }
}

const tree = {
  'a': {
    'aa': {
      'aaa': {
        'aaaa': {
          'aaaaa': {
            'aaaaaa': {

            }
          }
        }
      }
    },
    'ab': {}
  },
  'b': {
    'ba': {},
    'bb': {}
  }
};
const nodes = {};

function aNodeWithIdTreeDataProvider(): TreeDataProvider<{ key: string }> {
  return {
    getChildren: (element: { key: string }): { key: string }[] => {
      return getChildren(element ? element.key : undefined).map(key => getNode(key));
    },
    getTreeItem: (element: { key: string }): TreeItem => {
      const treeItem = getTreeItem(element.key);
      treeItem.id = element.key;
      return treeItem;
    },
    getParent: ({ key }: { key: string }): { key: string } => {
      const parentKey = key.substring(0, key.length - 1);
      return parentKey ? new Key(parentKey) : void 0;
    }
  };
}

function getChildren(key: string): string[] {
  if (!key) {
    return Object.keys(tree);
  }
  const treeElement = getTreeElement(key);
  if (treeElement) {
    return Object.keys(treeElement);
  }
  return [];
}

function getTreeItem(key: string): TreeItem {
  const treeElement = getTreeElement(key);
  return {
    label: /**TreeItemLabel**/<any>{ label: key, highlights: key.length > 1 ? [[key.length - 2, key.length - 1]] : void 0},
    tooltip: `Tooltip for ${key}`,
    collapsibleState: treeElement && Object.keys(treeElement).length ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
  };
}

function getTreeElement(element): any {
  let parent = tree;
  for (let i = 0; i < element.length; i++) {
    parent = parent[element.substring(0, i + 1)];
    if (!parent) {
      return null;
    }
  }
  return parent;
}

function getNode(key: string): { key: string } {
  if (!nodes[key]) {
    nodes[key] = new Key(key);
  }
  return nodes[key];
}

class Key {
  constructor(readonly key: string) { }
}
