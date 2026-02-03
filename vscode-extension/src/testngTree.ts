import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";

export type SuiteStatus = "idle" | "running";
export type SuiteMeta = {
  lastRunAt?: number;
  lastExitCode?: number;
};

const TESTNG_DOCTYPE_RE =
  /<!DOCTYPE\s+suite\s+SYSTEM\s+["']https?:\/\/testng\.org\/testng-1\.0\.dtd["']\s*>/i;

export type TreeNode = FolderNode | SuiteItem;

export class SuiteItem extends vscode.TreeItem {
  public status: SuiteStatus;
  public readonly suitePath: string;
  public readonly workspaceFolder: vscode.WorkspaceFolder;
  public meta: SuiteMeta;

  constructor(
    label: string,
    suitePath: string,
    workspaceFolder: vscode.WorkspaceFolder,
    status: SuiteStatus,
    meta: SuiteMeta
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.suitePath = suitePath;
    this.workspaceFolder = workspaceFolder;
    this.status = status;
    this.meta = meta;
    this.contextValue = "testngSuite";
    this.description = this.buildDescription();
    this.iconPath = new vscode.ThemeIcon(
      status === "running" ? "play-circle" : "circle-outline"
    );
    this.tooltip = this.suitePath;
  }

  buildDescription(): string {
    if (this.status === "running") return "running";
    if (!this.meta.lastRunAt) return "";
    const when = new Date(this.meta.lastRunAt).toLocaleString();
    const code =
      this.meta.lastExitCode === undefined ? "?" : this.meta.lastExitCode;
    return `last: ${when}, code ${code}`;
  }
}

export class FolderNode extends vscode.TreeItem {
  public readonly fullPath: string;
  public readonly children: TreeNode[];
  public readonly isWorkspaceRoot: boolean;

  constructor(label: string, fullPath: string, isWorkspaceRoot: boolean) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.fullPath = fullPath;
    this.children = [];
    this.isWorkspaceRoot = isWorkspaceRoot;
    this.contextValue = "testngFolder";
    this.iconPath = new vscode.ThemeIcon(
      isWorkspaceRoot ? "root-folder" : "folder"
    );
  }
}

export class TestngSuiteProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private suites: SuiteItem[] = [];
  private roots: FolderNode[] = [];
  private statusByPath = new Map<string, SuiteStatus>();
  private metaByPath = new Map<string, SuiteMeta>();
  private scanned = false;

  constructor(
    private readonly output: vscode.OutputChannel,
    metaByPath: Map<string, SuiteMeta>
  ) {
    this.metaByPath = metaByPath;
  }

  refresh(): void {
    this.scanned = false;
    this._onDidChangeTreeData.fire(undefined);
  }

  setStatus(suitePath: string, status: SuiteStatus): void {
    this.statusByPath.set(suitePath, status);
    const item = this.suites.find((s) => s.suitePath === suitePath);
    if (item) {
      item.status = status;
      item.description = item.buildDescription();
      item.iconPath = new vscode.ThemeIcon(
        status === "running" ? "play-circle" : "circle-outline"
      );
      this._onDidChangeTreeData.fire(item);
    }
  }

  setMeta(suitePath: string, meta: SuiteMeta): void {
    this.metaByPath.set(suitePath, meta);
    const item = this.suites.find((s) => s.suitePath === suitePath);
    if (item) {
      item.meta = meta;
      item.description = item.buildDescription();
      this._onDidChangeTreeData.fire(item);
    }
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeNode): Promise<TreeNode[]> {
    await this.scanIfNeeded();
    if (!element) {
      return this.roots;
    }
    if (element instanceof FolderNode) {
      return element.children;
    }
    return [];
  }

  async getAllSuites(): Promise<SuiteItem[]> {
    await this.scanIfNeeded();
    return this.suites;
  }

  private async scanIfNeeded(): Promise<void> {
    if (this.scanned) return;
    this.scanned = true;
    this.suites = [];
    this.roots = [];

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return;
    }

    const xmlFiles = await vscode.workspace.findFiles(
      "**/*.xml",
      "{**/node_modules/**,**/target/**}"
    );

    const rootByFolder = new Map<string, FolderNode>();
    for (const ws of folders) {
      const root = new FolderNode(ws.name, ws.uri.fsPath, true);
      rootByFolder.set(ws.uri.fsPath, root);
      this.roots.push(root);
    }

    for (const file of xmlFiles) {
      const folder = folders.find((f) => file.fsPath.startsWith(f.uri.fsPath));
      if (!folder) continue;
      if (!(await isTestngSuite(file.fsPath))) continue;

      const rel = path.relative(folder.uri.fsPath, file.fsPath);
      const relDir = path.dirname(rel);
      const root = rootByFolder.get(folder.uri.fsPath);
      if (!root) continue;

      let parent = root;
      if (relDir && relDir !== ".") {
        const parts = relDir.split(path.sep);
        let currentPath = folder.uri.fsPath;
        for (const part of parts) {
          currentPath = path.join(currentPath, part);
          let child = parent.children.find(
            (c) => c instanceof FolderNode && c.fullPath === currentPath
          ) as FolderNode | undefined;
          if (!child) {
            child = new FolderNode(part, currentPath, false);
            parent.children.push(child);
          }
          parent = child;
        }
      }

      const status = this.statusByPath.get(file.fsPath) ?? "idle";
      const meta = this.metaByPath.get(file.fsPath) ?? {};
      const suite = new SuiteItem(
        path.basename(file.fsPath),
        file.fsPath,
        folder,
        status,
        meta
      );
      parent.children.push(suite);
      this.suites.push(suite);
    }

    sortTree(this.roots);
  }

  findPomDir(suitePath: string, workspaceFolder: vscode.WorkspaceFolder): string {
    let current = path.dirname(suitePath);
    const root = workspaceFolder.uri.fsPath;

    while (true) {
      const pom = path.join(current, "pom.xml");
      if (fs.existsSync(pom)) {
        return current;
      }
      if (current.toLowerCase() === root.toLowerCase()) {
        return path.dirname(suitePath);
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return path.dirname(suitePath);
      }
      current = parent;
    }
  }
}

function sortTree(nodes: FolderNode[]): void {
  for (const node of nodes) {
    node.children.sort((a, b) => {
      const aIsFolder = a instanceof FolderNode;
      const bIsFolder = b instanceof FolderNode;
      if (aIsFolder && !bIsFolder) return -1;
      if (!aIsFolder && bIsFolder) return 1;
      return (a.label as string).localeCompare(b.label as string);
    });
    const childFolders = node.children.filter(
      (c) => c instanceof FolderNode
    ) as FolderNode[];
    sortTree(childFolders);
  }
}

async function isTestngSuite(filePath: string): Promise<boolean> {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    const head = data.slice(0, 4096);
    return TESTNG_DOCTYPE_RE.test(head);
  } catch {
    return false;
  }
}
