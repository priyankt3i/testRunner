const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, execFile } = require("child_process");

const processes = new Map();

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#f6f7fb",
    titleBarStyle: "default",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function looksLikeTestngSuite(filePath) {
  try {
    const fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(4096);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    const header = buffer.toString("utf8", 0, bytesRead).toLowerCase();
    return header.includes("<!doctype suite") && header.includes("testng-1.0.dtd");
  } catch {
    return false;
  }
}

function findTestngXml(rootDir) {
  const results = [];
  const skipDirs = new Set(["node_modules", "target", ".git", ".idea", ".vscode", "dist", "build"]);

  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".xml")) {
        if (looksLikeTestngSuite(fullPath)) {
          results.push(fullPath);
        }
      }
    }
  }

  walk(rootDir);
  return results;
}

function findMavenProjectRoot(startPath) {
  let current = path.dirname(startPath);
  const root = path.parse(current).root;
  while (current && current !== root) {
    const pomPath = path.join(current, "pom.xml");
    if (fs.existsSync(pomPath)) return current;
    current = path.dirname(current);
  }
  return path.dirname(startPath);
}

function resolveMavenCommand(mavenHome) {
  if (!mavenHome) return "mvn";
  const candidate = path.join(mavenHome, "bin", "mvn.cmd");
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

function resolveJavaCommand(javaHome) {
  if (!javaHome) return "java";
  const candidate = path.join(javaHome, "bin", "java.exe");
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

function runCommand(command, args, env, cwd) {
  return new Promise((resolve) => {
    if (process.platform === "win32") {
      const fullArgs = ["/c", command, ...args];
      const child = spawn("cmd.exe", fullArgs, { env, cwd, windowsHide: true });
      let output = "";
      child.stdout.on("data", (data) => {
        output += data.toString();
      });
      child.stderr.on("data", (data) => {
        output += data.toString();
      });
      child.on("error", (err) => resolve({ ok: false, output: err.message }));
      child.on("close", (code) => resolve({ ok: code === 0, output: output.trim() }));
    } else {
      const child = spawn(command, args, { env, cwd });
      let output = "";
      child.stdout.on("data", (data) => {
        output += data.toString();
      });
      child.stderr.on("data", (data) => {
        output += data.toString();
      });
      child.on("error", (err) => resolve({ ok: false, output: err.message }));
      child.on("close", (code) => resolve({ ok: code === 0, output: output.trim() }));
    }
  });
}

function parseAttributes(tagLine, attrs) {
  const result = {};
  for (const attr of attrs) {
    const match = new RegExp(`${attr}="([^"]+)"`, "i").exec(tagLine);
    if (match) result[attr] = match[1];
  }
  return result;
}

function parseSurefireReports(workingDir) {
  try {
    const reportDir = path.join(workingDir, "target", "surefire-reports");
    if (!fs.existsSync(reportDir)) return null;

    const files = fs.readdirSync(reportDir).filter((f) => f.startsWith("TEST-") && f.endsWith(".xml"));
    if (files.length === 0) return null;

    let totalTests = 0;
    let totalFailures = 0;
    let totalErrors = 0;
    let totalSkipped = 0;
    let totalTime = 0;

    for (const file of files) {
      const content = fs.readFileSync(path.join(reportDir, file), "utf8");
      const lineMatch = /<testsuite\b[^>]*>/i.exec(content);
      if (!lineMatch) continue;
      const attrs = parseAttributes(lineMatch[0], ["tests", "failures", "errors", "skipped", "time"]);
      totalTests += Number(attrs.tests || 0);
      totalFailures += Number(attrs.failures || 0);
      totalErrors += Number(attrs.errors || 0);
      totalSkipped += Number(attrs.skipped || 0);
      totalTime += Number(attrs.time || 0);
    }

    return {
      tests: totalTests,
      failures: totalFailures,
      errors: totalErrors,
      skipped: totalSkipped,
      time: totalTime
    };
  } catch {
    return null;
  }
}

function parseTestngResults(workingDir) {
  try {
    const reportPath = path.join(workingDir, "target", "surefire-reports", "testng-results.xml");
    if (!fs.existsSync(reportPath)) return null;
    const content = fs.readFileSync(reportPath, "utf8");
    const lineMatch = /<testng-results\b[^>]*>/i.exec(content);
    if (!lineMatch) return null;
    const attrs = parseAttributes(lineMatch[0], ["total", "passed", "failed", "skipped"]);
    return {
      tests: Number(attrs.total || 0),
      failures: Number(attrs.failed || 0),
      errors: 0,
      skipped: Number(attrs.skipped || 0),
      time: 0
    };
  } catch {
    return null;
  }
}

ipcMain.handle("select-root", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("scan-root", async (_event, rootDir) => {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  const xmls = findTestngXml(rootDir);
  return xmls.map((filePath) => ({
    id: filePath,
    name: path.basename(filePath, path.extname(filePath)),
    path: filePath
  }));
});

ipcMain.handle("run-suite", async (event, payload) => {
  const { suitePath, settings } = payload;
  const mavenCmd = resolveMavenCommand(settings.mavenHome);

  if (settings.mavenHome && !mavenCmd) {
    return { ok: false, error: "Maven Home is set but mvn.cmd was not found in bin." };
  }

  const workingDir = findMavenProjectRoot(suitePath);
  if (!workingDir || !fs.existsSync(workingDir)) {
    return { ok: false, error: "Project folder not found for the selected suite." };
  }
  const args = ["test", `-DsuiteXmlFile=${suitePath}`];

  const env = {
    ...process.env,
    JAVA_HOME: settings.javaHome || process.env.JAVA_HOME,
    MAVEN_HOME: settings.mavenHome || process.env.MAVEN_HOME
  };

  let child;
  if (process.platform === "win32") {
    const command = mavenCmd || "mvn";
    child = spawn("cmd.exe", ["/c", command, ...args], {
      cwd: workingDir,
      env,
      windowsHide: true
    });
  } else {
    child = spawn(mavenCmd || "mvn", args, {
      cwd: workingDir,
      env
    });
  }

  processes.set(suitePath, child);
  event.sender.send("suite-status", { suitePath, status: "Running" });

  child.stdout.on("data", (data) => {
    event.sender.send("suite-output", {
      suitePath,
      type: "stdout",
      line: data.toString()
    });
  });

  child.stderr.on("data", (data) => {
    event.sender.send("suite-output", {
      suitePath,
      type: "stderr",
      line: data.toString()
    });
  });

  child.on("error", (err) => {
    const isMissingMaven = err && err.code === "ENOENT";
    event.sender.send("suite-output", {
      suitePath,
      type: "stderr",
      line: isMissingMaven
        ? "Maven was not found. Add Maven Home in Settings or add mvn to PATH.\n"
        : `Failed to start Maven: ${err.message}\n`
    });
    event.sender.send("suite-status", { suitePath, status: "Failed" });
    processes.delete(suitePath);
  });

  child.on("close", (code) => {
    const status = code === 0 ? "Completed" : "Failed";
    event.sender.send("suite-status", { suitePath, status });
    const summary =
      parseSurefireReports(workingDir) ||
      parseTestngResults(workingDir);
    if (summary) {
      event.sender.send("suite-summary", {
        suitePath,
        summary,
        meta: {
          completedAt: new Date().toISOString()
        }
      });
    }
    processes.delete(suitePath);
  });

  return { ok: true };
});

ipcMain.handle("stop-suite", async (event, suitePath) => {
  const child = processes.get(suitePath);
  if (!child) return { ok: false, error: "No running process for this suite." };

  return new Promise((resolve) => {
    execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], (err) => {
      if (err) {
        event.sender.send("suite-output", {
          suitePath,
          type: "stderr",
          line: `Failed to stop process: ${err.message}\n`
        });
        return resolve({ ok: false, error: "Failed to stop the process." });
      }

      event.sender.send("suite-output", {
        suitePath,
        type: "stdout",
        line: "Process stopped by user.\n"
      });
      event.sender.send("suite-status", { suitePath, status: "Idle" });
      processes.delete(suitePath);
      return resolve({ ok: true });
    });
  });
});

ipcMain.handle("preflight-check", async (_event, payload) => {
  const settings = payload.settings || {};
  const env = {
    ...process.env,
    JAVA_HOME: settings.javaHome || process.env.JAVA_HOME,
    MAVEN_HOME: settings.mavenHome || process.env.MAVEN_HOME
  };

  const mavenCmd = resolveMavenCommand(settings.mavenHome);
  const javaCmd = resolveJavaCommand(settings.javaHome);

  const mavenResult = await runCommand(mavenCmd || "mvn", ["-v"], env);
  const javaResult = await runCommand(javaCmd || "java", ["-version"], env);

  const mavenDetails = mavenResult.ok
    ? mavenResult.output || "Maven is available."
    : settings.mavenHome && !mavenCmd
    ? "Maven Home is set but mvn.cmd was not found in bin."
    : mavenResult.output || "Maven not found.";

  const javaDetails = javaResult.ok
    ? javaResult.output || "Java is available."
    : settings.javaHome && !javaCmd
    ? "Java Home is set but java.exe was not found in bin."
    : javaResult.output || "Java not found.";

  return {
    ok: true,
    maven: { ok: mavenResult.ok, details: mavenDetails },
    java: { ok: javaResult.ok, details: javaDetails }
  };
});

ipcMain.handle("open-report-folder", async (_event, suitePath) => {
  try {
    const workingDir = findMavenProjectRoot(suitePath);
    if (!workingDir || !fs.existsSync(workingDir)) {
      return { ok: false, error: "Project folder not found for the selected suite." };
    }
    const reportDir = path.join(workingDir, "target", "surefire-reports");
    if (!fs.existsSync(reportDir)) {
      return { ok: false, error: "Report folder not found. Run the suite first." };
    }
    await shell.openPath(reportDir);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("export-summary", async (_event, payload) => {
  try {
    const rows = payload.rows || [];
    const defaultName = "testng-summary.csv";
    const result = await dialog.showSaveDialog({
      title: "Export Summary",
      defaultPath: payload.rootDir ? path.join(payload.rootDir, defaultName) : defaultName,
      filters: [{ name: "CSV", extensions: ["csv"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, error: "Export cancelled." };

    const header = [
      "Suite",
      "Path",
      "Tests",
      "Failures",
      "Errors",
      "Skipped",
      "TimeSeconds",
      "CompletedAt"
    ];
    const lines = [header.join(",")];
    for (const row of rows) {
      const values = [
        row.name,
        row.path,
        row.tests,
        row.failures,
        row.errors,
        row.skipped,
        row.timeSeconds,
        row.completedAt
      ].map((value) => {
        const safe = String(value ?? "");
        if (safe.includes(",") || safe.includes("\"") || safe.includes("\n")) {
          return `"${safe.replace(/"/g, "\"\"")}"`;
        }
        return safe;
      });
      lines.push(values.join(","));
    }

    fs.writeFileSync(result.filePath, lines.join("\n"), "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("export-log", async (_event, payload) => {
  try {
    const entries = payload.entries || [];
    const defaultName = "suite-log.txt";
    const result = await dialog.showSaveDialog({
      title: "Export Suite Log",
      defaultPath: defaultName,
      filters: [{ name: "Text", extensions: ["txt", "log"] }]
    });
    if (result.canceled || !result.filePath) return { ok: false, error: "Export cancelled." };

    const lines = entries.map((entry) => `[${entry.ts}] ${entry.line}`);
    fs.writeFileSync(result.filePath, lines.join(""), "utf8");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});
