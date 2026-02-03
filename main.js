const { app, BrowserWindow, ipcMain, dialog } = require("electron");
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
