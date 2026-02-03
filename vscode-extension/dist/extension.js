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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const crypto_1 = require("crypto");
const child_process_1 = require("child_process");
const testngTree_1 = require("./testngTree");
function activate(context) {
    const output = vscode.window.createOutputChannel("TestNG Runner");
    const metaByPath = loadMeta(context);
    const provider = new testngTree_1.TestngSuiteProvider(output, metaByPath);
    const running = new Map();
    const suiteOutputs = new Map();
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    const treeView = vscode.window.createTreeView("testngRunner.suites", {
        treeDataProvider: provider,
        showCollapseAll: false
    });
    context.subscriptions.push(output, treeView, statusBar);
    updateStatusBar();
    validateSettings(false);
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("testngRunner")) {
            updateStatusBar();
            validateSettings(false);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("testngRunner.refreshSuites", () => provider.refresh()));
    context.subscriptions.push(vscode.commands.registerCommand("testngRunner.debugScan", async () => {
        output.show(true);
        output.appendLine("Debug Scan: searching for TestNG suites...");
        const suites = await provider.getAllSuites();
        if (suites.length === 0) {
            output.appendLine("No TestNG suites found.");
            return;
        }
        output.appendLine(`Found ${suites.length} suite(s):`);
        for (const s of suites) {
            output.appendLine(`- ${s.suitePath}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("testngRunner.openSettings", async () => {
        await vscode.commands.executeCommand("workbench.action.openSettings", "testngRunner");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("testngRunner.runSuite", async (item) => {
        const suite = item ?? (await pickSuite(provider));
        if (!suite)
            return;
        await runSuiteInternal(suite);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("testngRunner.runAllSuites", async () => {
        const suites = await provider.getAllSuites();
        if (suites.length === 0) {
            vscode.window.showInformationMessage("No TestNG suites found.");
            return;
        }
        for (const suite of suites) {
            if (running.has(suite.suitePath))
                continue;
            await runSuiteInternal(suite, true);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("testngRunner.stopSuite", async (item) => {
        const suite = item ?? (await pickSuite(provider));
        if (!suite)
            return;
        const run = running.get(suite.suitePath);
        if (!run) {
            vscode.window.showInformationMessage("Suite is not running.");
            return;
        }
        await stopProcess(run.pid);
        run.proc.kill();
        running.delete(suite.suitePath);
        provider.setStatus(suite.suitePath, "idle");
        output.appendLine("Stopped suite.");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("testngRunner.openSuiteLog", async (item) => {
        const suite = item ?? (await pickSuite(provider));
        if (!suite)
            return;
        const logPath = getLogFilePath(context, suite.suitePath);
        if (!logPath || !fs.existsSync(logPath)) {
            vscode.window.showInformationMessage("No log file found yet.");
            return;
        }
        const doc = await vscode.workspace.openTextDocument(logPath);
        await vscode.window.showTextDocument(doc, { preview: false });
    }));
    async function runSuiteInternal(suite, quiet = false) {
        if (running.has(suite.suitePath)) {
            if (!quiet) {
                vscode.window.showWarningMessage("Suite is already running.");
            }
            return;
        }
        if (!validateSettings(true)) {
            return;
        }
        const config = vscode.workspace.getConfiguration("testngRunner");
        const mavenHome = (config.get("mavenHome") || "").trim();
        const javaHome = (config.get("javaHome") || "").trim();
        const mvnCmd = getMavenCommand(mavenHome);
        const workDir = provider.findPomDir(suite.suitePath, suite.workspaceFolder);
        const suiteRel = path.relative(workDir, suite.suitePath);
        const suiteRelPosix = suiteRel.split(path.sep).join("/");
        output.show(true);
        output.appendLine(`Running: ${suiteRel}`);
        output.appendLine(`Working dir: ${workDir}`);
        const suiteOutput = getSuiteOutput(suite.suitePath);
        suiteOutput.show(true);
        suiteOutput.appendLine(`Running: ${suiteRel}`);
        suiteOutput.appendLine(`Working dir: ${workDir}`);
        appendLog(context, suite.suitePath, `\nRunning: ${suiteRel}\nWorking dir: ${workDir}\n`);
        const env = { ...process.env };
        if (javaHome) {
            env.JAVA_HOME = javaHome;
        }
        if (mavenHome) {
            const bin = path.join(mavenHome, "bin");
            env.PATH = `${bin};${env.PATH || ""}`;
            env.MAVEN_HOME = mavenHome;
        }
        const args = ["test", `-Dsurefire.suiteXmlFiles="${suiteRelPosix}"`];
        const child = (0, child_process_1.spawn)(mvnCmd, args, {
            cwd: workDir,
            env,
            shell: true
        });
        if (!child.pid) {
            vscode.window.showErrorMessage("Failed to start Maven process.");
            return;
        }
        running.set(suite.suitePath, { pid: child.pid, proc: child });
        provider.setStatus(suite.suitePath, "running");
        const append = (text) => {
            output.append(text);
            suiteOutput.append(text);
            appendLog(context, suite.suitePath, text);
        };
        child.stdout.on("data", (data) => append(data.toString()));
        child.stderr.on("data", (data) => append(data.toString()));
        const exitCode = await new Promise((resolve) => {
            child.on("exit", (code) => resolve(code ?? undefined));
        });
        running.delete(suite.suitePath);
        provider.setStatus(suite.suitePath, "idle");
        output.appendLine(`\nExited with code ${exitCode ?? "unknown"}\n`);
        suiteOutput.appendLine(`\nExited with code ${exitCode ?? "unknown"}\n`);
        const meta = {
            lastRunAt: Date.now(),
            lastExitCode: exitCode
        };
        saveMeta(context, suite.suitePath, meta);
        provider.setMeta(suite.suitePath, meta);
        return exitCode;
    }
    function getSuiteOutput(suitePath) {
        const existing = suiteOutputs.get(suitePath);
        if (existing)
            return existing;
        const name = `TestNG Runner - ${path.basename(suitePath)}`;
        const channel = vscode.window.createOutputChannel(name);
        context.subscriptions.push(channel);
        suiteOutputs.set(suitePath, channel);
        return channel;
    }
    function validateSettings(quiet) {
        const config = vscode.workspace.getConfiguration("testngRunner");
        const mavenHome = (config.get("mavenHome") || "").trim();
        const javaHome = (config.get("javaHome") || "").trim();
        const problems = [];
        const mavenCmd = getMavenCommand(mavenHome);
        const javaCmd = getJavaCommand(javaHome);
        if (!canExecute(mavenCmd, ["-v"], buildEnv(mavenHome, javaHome))) {
            problems.push("Maven could not be executed. Check PATH or Maven Home.");
        }
        if (!canExecute(javaCmd, ["-version"], buildEnv(mavenHome, javaHome))) {
            problems.push("Java could not be executed. Check PATH or Java Home.");
        }
        if (problems.length > 0 && !quiet) {
            vscode.window
                .showWarningMessage(problems.join(" "), "Open Settings")
                .then((choice) => {
                if (choice) {
                    vscode.commands.executeCommand("workbench.action.openSettings", "testngRunner");
                }
            });
            return false;
        }
        return true;
    }
    function updateStatusBar() {
        const config = vscode.workspace.getConfiguration("testngRunner");
        const mavenHome = (config.get("mavenHome") || "").trim();
        const javaHome = (config.get("javaHome") || "").trim();
        const mavenCmd = getMavenCommand(mavenHome);
        const javaCmd = getJavaCommand(javaHome);
        const env = buildEnv(mavenHome, javaHome);
        const mavenOk = canExecute(mavenCmd, ["-v"], env);
        const javaOk = canExecute(javaCmd, ["-version"], env);
        statusBar.text = `TestNG Runner: Maven ${mavenOk ? "OK" : "Missing"} | Java ${javaOk ? "OK" : "Missing"}`;
        const resolvedMaven = mavenHome || resolveOnPath("mvn") || "not found";
        const resolvedJava = javaHome || resolveOnPath("java") || "not found";
        statusBar.tooltip = `Maven: ${resolvedMaven}\nJava: ${resolvedJava}`;
        statusBar.command = "testngRunner.openSettings";
        statusBar.show();
    }
}
function deactivate() { }
async function pickSuite(provider) {
    const suites = await provider.getAllSuites();
    if (suites.length === 0) {
        vscode.window.showInformationMessage("No TestNG suites found.");
        return;
    }
    const picked = await vscode.window.showQuickPick(suites.map((s) => ({
        label: s.label,
        description: s.workspaceFolder.name,
        item: s
    })), { placeHolder: "Select a TestNG suite" });
    return picked?.item;
}
function getMavenCommand(mavenHome) {
    if (!mavenHome)
        return "mvn";
    return path.join(mavenHome, "bin", "mvn");
}
function getJavaCommand(javaHome) {
    if (!javaHome)
        return "java";
    return path.join(javaHome, "bin", "java");
}
function buildEnv(mavenHome, javaHome) {
    const env = { ...process.env };
    if (javaHome) {
        env.JAVA_HOME = javaHome;
    }
    if (mavenHome) {
        const bin = path.join(mavenHome, "bin");
        env.PATH = `${bin};${env.PATH || ""}`;
        env.MAVEN_HOME = mavenHome;
    }
    return env;
}
function canExecute(cmd, args, env) {
    try {
        const result = (0, child_process_1.spawnSync)(cmd, args, {
            env,
            shell: true,
            stdio: "ignore"
        });
        return result.status === 0;
    }
    catch {
        return false;
    }
}
function resolveOnPath(cmd) {
    try {
        if (process.platform === "win32") {
            const out = (0, child_process_1.execSync)(`where ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] })
                .toString()
                .trim()
                .split(/\r?\n/)[0];
            return out || undefined;
        }
        const out = (0, child_process_1.execSync)(`which ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] })
            .toString()
            .trim();
        return out || undefined;
    }
    catch {
        return undefined;
    }
}
function loadMeta(context) {
    const stored = context.workspaceState.get("suiteMeta") || {};
    return new Map(Object.entries(stored));
}
function saveMeta(context, suitePath, meta) {
    const stored = context.workspaceState.get("suiteMeta") || {};
    stored[suitePath] = meta;
    context.workspaceState.update("suiteMeta", stored);
}
function getLogFilePath(context, suitePath) {
    const storageUri = context.storageUri ?? context.globalStorageUri;
    if (!storageUri)
        return;
    const logsDir = path.join(storageUri.fsPath, "logs");
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    const base = path.basename(suitePath, path.extname(suitePath));
    const hash = (0, crypto_1.createHash)("sha1").update(suitePath).digest("hex").slice(0, 8);
    return path.join(logsDir, `${base}-${hash}.log`);
}
function appendLog(context, suitePath, text) {
    const logPath = getLogFilePath(context, suitePath);
    if (!logPath)
        return;
    fs.appendFileSync(logPath, text, "utf8");
}
function isValidMavenHome(mavenHome) {
    if (!fs.existsSync(mavenHome))
        return false;
    const mvn = process.platform === "win32" ? "mvn.cmd" : "mvn";
    return fs.existsSync(path.join(mavenHome, "bin", mvn));
}
function isValidJavaHome(javaHome) {
    if (!fs.existsSync(javaHome))
        return false;
    const java = process.platform === "win32" ? "java.exe" : "java";
    return fs.existsSync(path.join(javaHome, "bin", java));
}
function stopProcess(pid) {
    return new Promise((resolve) => {
        if (process.platform === "win32") {
            (0, child_process_1.exec)(`taskkill /PID ${pid} /T /F`, () => resolve());
        }
        else {
            try {
                process.kill(-pid, "SIGTERM");
            }
            catch {
                try {
                    process.kill(pid, "SIGTERM");
                }
                catch {
                    // ignore
                }
            }
            resolve();
        }
    });
}
//# sourceMappingURL=extension.js.map