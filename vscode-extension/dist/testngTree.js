"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestngSuiteProvider = exports.FolderNode = exports.SuiteItem = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const vscode = __importStar(require("vscode"));
const TESTNG_DOCTYPE_RE = /<!DOCTYPE\s+suite\s+SYSTEM\s+["']https?:\/\/testng\.org\/testng-1\.0\.dtd["']\s*>/i;
class SuiteItem extends vscode.TreeItem {
    constructor(label, suitePath, workspaceFolder, status, meta) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.suitePath = suitePath;
        this.workspaceFolder = workspaceFolder;
        this.status = status;
        this.meta = meta;
        this.contextValue = "testngSuite";
        this.description = this.buildDescription();
        this.iconPath = new vscode.ThemeIcon(status === "running" ? "play-circle" : "circle-outline");
        this.tooltip = this.suitePath;
    }
    buildDescription() {
        if (this.status === "running")
            return "running";
        if (!this.meta.lastRunAt)
            return "";
        const when = new Date(this.meta.lastRunAt).toLocaleString();
        const code = this.meta.lastExitCode === undefined ? "?" : this.meta.lastExitCode;
        return `last: ${when}, code ${code}`;
    }
}
exports.SuiteItem = SuiteItem;
class FolderNode extends vscode.TreeItem {
    constructor(label, fullPath, isWorkspaceRoot) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.fullPath = fullPath;
        this.children = [];
        this.isWorkspaceRoot = isWorkspaceRoot;
        this.contextValue = "testngFolder";
        this.iconPath = new vscode.ThemeIcon(isWorkspaceRoot ? "root-folder" : "folder");
    }
}
exports.FolderNode = FolderNode;
class TestngSuiteProvider {
    constructor(output, metaByPath) {
        this.output = output;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.suites = [];
        this.roots = [];
        this.statusByPath = new Map();
        this.metaByPath = new Map();
        this.scanned = false;
        this.metaByPath = metaByPath;
    }
    refresh() {
        this.scanned = false;
        this._onDidChangeTreeData.fire(undefined);
    }
    setStatus(suitePath, status) {
        this.statusByPath.set(suitePath, status);
        const item = this.suites.find((s) => s.suitePath === suitePath);
        if (item) {
            item.status = status;
            item.description = item.buildDescription();
            item.iconPath = new vscode.ThemeIcon(status === "running" ? "play-circle" : "circle-outline");
            this._onDidChangeTreeData.fire(item);
        }
    }
    setMeta(suitePath, meta) {
        this.metaByPath.set(suitePath, meta);
        const item = this.suites.find((s) => s.suitePath === suitePath);
        if (item) {
            item.meta = meta;
            item.description = item.buildDescription();
            this._onDidChangeTreeData.fire(item);
        }
    }
    getTreeItem(element) {
        return element;
    }
    async getChildren(element) {
        await this.scanIfNeeded();
        if (!element) {
            return this.roots;
        }
        if (element instanceof FolderNode) {
            return element.children;
        }
        return [];
    }
    async getAllSuites() {
        await this.scanIfNeeded();
        return this.suites;
    }
    async scanIfNeeded() {
        if (this.scanned)
            return;
        this.scanned = true;
        this.suites = [];
        this.roots = [];
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
            return;
        }
        const xmlFiles = await vscode.workspace.findFiles("**/*.xml", "{**/node_modules/**,**/target/**}");
        const rootByFolder = new Map();
        for (const ws of folders) {
            const root = new FolderNode(ws.name, ws.uri.fsPath, true);
            rootByFolder.set(ws.uri.fsPath, root);
            this.roots.push(root);
        }
        for (const file of xmlFiles) {
            const folder = folders.find((f) => file.fsPath.startsWith(f.uri.fsPath));
            if (!folder)
                continue;
            if (!(await isTestngSuite(file.fsPath)))
                continue;
            const rel = path.relative(folder.uri.fsPath, file.fsPath);
            const relDir = path.dirname(rel);
            const root = rootByFolder.get(folder.uri.fsPath);
            if (!root)
                continue;
            let parent = root;
            if (relDir && relDir !== ".") {
                const parts = relDir.split(path.sep);
                let currentPath = folder.uri.fsPath;
                for (const part of parts) {
                    currentPath = path.join(currentPath, part);
                    let child = parent.children.find((c) => c instanceof FolderNode && c.fullPath === currentPath);
                    if (!child) {
                        child = new FolderNode(part, currentPath, false);
                        parent.children.push(child);
                    }
                    parent = child;
                }
            }
            const status = this.statusByPath.get(file.fsPath) ?? "idle";
            const meta = this.metaByPath.get(file.fsPath) ?? {};
            const suite = new SuiteItem(path.basename(file.fsPath), file.fsPath, folder, status, meta);
            parent.children.push(suite);
            this.suites.push(suite);
        }
        sortTree(this.roots);
    }
    findPomDir(suitePath, workspaceFolder) {
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
exports.TestngSuiteProvider = TestngSuiteProvider;
function sortTree(nodes) {
    for (const node of nodes) {
        node.children.sort((a, b) => {
            const aIsFolder = a instanceof FolderNode;
            const bIsFolder = b instanceof FolderNode;
            if (aIsFolder && !bIsFolder)
                return -1;
            if (!aIsFolder && bIsFolder)
                return 1;
            return a.label.localeCompare(b.label);
        });
        const childFolders = node.children.filter((c) => c instanceof FolderNode);
        sortTree(childFolders);
    }
}
async function isTestngSuite(filePath) {
    try {
        const data = fs.readFileSync(filePath, "utf8");
        const head = data.slice(0, 4096);
        return TESTNG_DOCTYPE_RE.test(head);
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=testngTree.js.map