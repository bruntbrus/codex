import {
  commands,
  ExtensionContext,
  Range,
  Uri,
  window,
  workspace,
} from 'vscode';

import { DepNodeProvider, Dependency } from './nodeDependencies';
import { JsonOutlineProvider } from './jsonOutline';
import { FtpExplorer } from './ftpExplorer';
import { FileExplorer } from './fileExplorer';
import { TestView } from './testView';

export function activate(context: ExtensionContext) {
  const nodeDependenciesProvider = new DepNodeProvider(workspace.rootPath);

  window.registerTreeDataProvider('nodeDependencies', nodeDependenciesProvider);

  commands.registerCommand(
    'nodeDependencies.refreshEntry',
    () => nodeDependenciesProvider.refresh()
  );

  commands.registerCommand(
    'extension.openPackageOnNpm',
    (moduleName: string) => commands.executeCommand('vscode.open', Uri.parse(`https://www.npmjs.com/package/${moduleName}`))
  );

  commands.registerCommand(
    'nodeDependencies.addEntry',
    () => window.showInformationMessage(`Successfully called add entry.`)
  );

  commands.registerCommand(
    'nodeDependencies.editEntry',
    (node: Dependency) => window.showInformationMessage(`Successfully called edit entry on ${node.label}.`)
  );

  commands.registerCommand(
    'nodeDependencies.deleteEntry',
    (node: Dependency) => window.showInformationMessage(`Successfully called delete entry on ${node.label}.`)
  );

  const jsonOutlineProvider = new JsonOutlineProvider(context);

  window.registerTreeDataProvider('jsonOutline', jsonOutlineProvider);

  commands.registerCommand(
    'jsonOutline.refresh',
    () => jsonOutlineProvider.refresh()
  );

  commands.registerCommand(
    'jsonOutline.refreshNode',
    (offset: number) => jsonOutlineProvider.refresh(offset)
  );

  commands.registerCommand(
    'jsonOutline.renameNode',
    (offset: number) => jsonOutlineProvider.rename(offset)
  );

  commands.registerCommand(
    'extension.openJsonSelection',
    (range: Range) => jsonOutlineProvider.select(range)
  );

  new FtpExplorer(context);
  new FileExplorer(context);
  new TestView(context);
}
