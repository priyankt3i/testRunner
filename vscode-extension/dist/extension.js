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
const net = __importStar(require("net"));
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
    context.subscriptions.push(vscode.commands.registerCommand("testngRunner.selectTestCategory", async () => {
        const picked = await pickTestCategory(provider);
        if (!picked)
            return;
        const config = vscode.workspace.getConfiguration("testngRunner");
        await config.update("testngRunner.testCategory", picked, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`Test Category set to: ${picked}`);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("testngRunner.openSettings", async () => {
        await vscode.commands.executeCommand("workbench.action.openSettings", "testngRunner");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("testngRunner.runSuite", async (item) => {
        const suite = item ?? (await pickSuite(provider));
        if (!suite)
            return;
        await runSuiteInternal(suite, "run");
    }));
    context.subscriptions.push(vscode.commands.registerCommand("testngRunner.debugSuite", async (item) => {
        const suite = item ?? (await pickSuite(provider));
        if (!suite)
            return;
        await runSuiteInternal(suite, "debug");
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
            await runSuiteInternal(suite, "run", true);
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
    async function runSuiteInternal(suite, mode, quiet = false) {
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
        const testCategoryMode = (config.get("testCategoryMode") || "prompt").trim();
        const headless = (config.get("headless") || "default").trim();
        const extraArgs = config.get("mavenArgs") || [];
        const debugPort = config.get("debugPort") || 5005;
        if (mode === "debug") {
            const busy = await isPortInUse(debugPort);
            if (busy) {
                vscode.window.showErrorMessage(`Debug port ${debugPort} is already in use. Change 'testngRunner.debugPort' and retry.`);
                return;
            }
        }
        const mvnCmd = getMavenCommand(mavenHome);
        const workDir = provider.findPomDir(suite.suitePath, suite.workspaceFolder);
        const suiteRel = path.relative(workDir, suite.suitePath);
        const suiteRelPosix = suiteRel.split(path.sep).join("/");
        output.show(true);
        output.appendLine(`${mode === "debug" ? "Debugging" : "Running"}: ${suiteRel}`);
        output.appendLine(`Working dir: ${workDir}`);
        const suiteOutput = getSuiteOutput(suite.suitePath);
        suiteOutput.show(true);
        suiteOutput.appendLine(`${mode === "debug" ? "Debugging" : "Running"}: ${suiteRel}`);
        suiteOutput.appendLine(`Working dir: ${workDir}`);
        appendLog(context, suite.suitePath, `\n${mode === "debug" ? "Debugging" : "Running"}: ${suiteRel}\nWorking dir: ${workDir}\n`);
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
        if (mode === "debug") {
            args.push(`-Dmaven.surefire.debug=-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=${debugPort}`);
            output.appendLine(`Starting Surefire in debug mode on port ${debugPort} (suspend=y).`);
            suiteOutput.appendLine(`Starting Surefire in debug mode on port ${debugPort} (suspend=y).`);
        }
        const category = await resolveTestCategory(testCategoryMode, provider);
        if (category) {
            args.push(`-DtestCategory=${category}`);
        }
        if (headless === "true" || headless === "false") {
            args.push(`-Dheadless=${headless}`);
        }
        if (extraArgs.length > 0) {
            for (const arg of extraArgs) {
                if (typeof arg === "string" && arg.trim().length > 0) {
                    args.push(arg.trim());
                }
            }
        }
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
        let debugAttachStarted = false;
        let debugAttachTimer;
        const startAttach = async () => {
            if (mode !== "debug" || debugAttachStarted)
                return;
            debugAttachStarted = true;
            const started = await startJavaAttachDebugSessionWhenReady(debugPort, child);
            if (!started) {
                output.appendLine(`Could not start VS Code Java debugger attach session on port ${debugPort}.`);
                suiteOutput.appendLine(`Could not start VS Code Java debugger attach session on port ${debugPort}.`);
                vscode.window.showWarningMessage("Debug run started, but VS Code debugger did not attach automatically.");
            }
        };
        child.stdout.on("data", (data) => {
            const text = data.toString();
            append(text);
            if (mode === "debug" &&
                /Listening for transport dt_socket at address:/i.test(text)) {
                void startAttach();
            }
        });
        child.stderr.on("data", (data) => {
            const text = data.toString();
            append(text);
            if (mode === "debug" &&
                /Listening for transport dt_socket at address:/i.test(text)) {
                void startAttach();
            }
        });
        if (mode === "debug") {
            debugAttachTimer = setTimeout(() => {
                void startAttach();
            }, 2000);
        }
        const exitCode = await new Promise((resolve) => {
            child.on("exit", (code) => resolve(code ?? undefined));
        });
        if (debugAttachTimer) {
            clearTimeout(debugAttachTimer);
        }
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
async function resolveTestCategory(mode, provider) {
    const normalized = mode.toLowerCase();
    if (normalized === "all")
        return;
    if (normalized === "value") {
        const config = vscode.workspace.getConfiguration("testngRunner");
        const value = (config.get("testCategory") || "").trim();
        return value || undefined;
    }
    return pickTestCategory(provider);
}
async function pickTestCategory(provider) {
    const categories = await detectTestCategories();
    const items = [];
    for (const c of categories) {
        items.push({ label: c });
    }
    if (items.length === 0) {
        vscode.window.showWarningMessage("No Test Categories detected. Set one in settings or add @Test(groups=...).");
        return;
    }
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: "Select a Test Category"
    });
    return picked?.label;
}
async function detectTestCategories() {
    const files = await vscode.workspace.findFiles("**/*.java", "{**/node_modules/**,**/target/**,**/build/**,**/bin/**}");
    const categories = new Set();
    const groupsArrayRe = /groups\s*=\s*\{([^}]*)\}/gi;
    const groupsSingleRe = /groups\s*=\s*"([^"]+)"/gi;
    for (const file of files) {
        let content = "";
        try {
            const data = await vscode.workspace.fs.readFile(file);
            content = Buffer.from(data).toString("utf8");
        }
        catch {
            continue;
        }
        let match;
        while ((match = groupsArrayRe.exec(content)) !== null) {
            const raw = match[1];
            const parts = raw
                .split(",")
                .map((s) => s.trim().replace(/^"(.*)"$/, "$1"))
                .filter(Boolean);
            for (const p of parts)
                categories.add(p);
        }
        while ((match = groupsSingleRe.exec(content)) !== null) {
            const value = match[1].trim();
            if (value)
                categories.add(value);
        }
    }
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
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
async function startJavaAttachDebugSession(port) {
    const config = {
        type: "java",
        name: `Attach TestNG (${port})`,
        request: "attach",
        hostName: "localhost",
        port
    };
    try {
        return await vscode.debug.startDebugging(undefined, config);
    }
    catch {
        return false;
    }
}
async function startJavaAttachDebugSessionWhenReady(port, proc) {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        if (proc.killed || proc.exitCode !== null) {
            return false;
        }
        const ready = await canConnectToPort(port);
        if (ready) {
            return startJavaAttachDebugSession(port);
        }
        await sleep(300);
    }
    return false;
}
async function canConnectToPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(500);
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("timeout", () => {
            socket.destroy();
            resolve(false);
        });
        socket.once("error", () => {
            socket.destroy();
            resolve(false);
        });
        socket.connect(port, "127.0.0.1");
    });
}
async function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.once("error", (err) => {
            resolve(err.code === "EADDRINUSE");
        });
        server.once("listening", () => {
            server.close(() => resolve(false));
        });
        server.listen(port, "127.0.0.1");
    });
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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