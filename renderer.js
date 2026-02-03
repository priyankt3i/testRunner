const { ipcRenderer } = require("electron");
const path = require("path");

const state = {
  rootDir: null,
  suites: [],
  statuses: {},
  recentRoots: [],
  runQueue: [],
  queueRunning: false,
  settings: {
    mavenHome: "",
    javaHome: ""
  }
};
state.summaries = {};
state.summaryMeta = {};
state.logs = {};
state.selectedLogSuite = "";

const els = {
  rootPath: document.getElementById("rootPath"),
  selectRoot: document.getElementById("selectRoot"),
  refreshRoot: document.getElementById("refreshRoot"),
  suiteList: document.getElementById("suiteList"),
  consoleOutput: document.getElementById("consoleOutput"),
  clearConsole: document.getElementById("clearConsole"),
  tabSuites: document.getElementById("tabSuites"),
  tabSettings: document.getElementById("tabSettings"),
  paneSuites: document.getElementById("paneSuites"),
  paneSettings: document.getElementById("paneSettings"),
  suiteSearch: document.getElementById("suiteSearch"),
  recentRoots: document.getElementById("recentRoots"),
  runAll: document.getElementById("runAll"),
  exportSummary: document.getElementById("exportSummary"),
  logSuiteSelect: document.getElementById("logSuiteSelect"),
  exportLog: document.getElementById("exportLog"),
  mavenHome: document.getElementById("mavenHome"),
  javaHome: document.getElementById("javaHome"),
  saveSettings: document.getElementById("saveSettings"),
  runPreflight: document.getElementById("runPreflight"),
  mavenStatus: document.getElementById("mavenStatus"),
  javaStatus: document.getElementById("javaStatus"),
  mavenDetails: document.getElementById("mavenDetails"),
  javaDetails: document.getElementById("javaDetails")
};

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem("settings") || "{}");
  state.settings.mavenHome = saved.mavenHome || "";
  state.settings.javaHome = saved.javaHome || "";
  els.mavenHome.value = state.settings.mavenHome;
  els.javaHome.value = state.settings.javaHome;
}

function loadRecentRoots() {
  const saved = JSON.parse(localStorage.getItem("recentRoots") || "[]");
  state.recentRoots = Array.isArray(saved) ? saved : [];
  renderRecentRoots();
}

function saveRecentRoots() {
  localStorage.setItem("recentRoots", JSON.stringify(state.recentRoots));
}

function addRecentRoot(rootDir) {
  if (!rootDir) return;
  state.recentRoots = state.recentRoots.filter((item) => item !== rootDir);
  state.recentRoots.unshift(rootDir);
  state.recentRoots = state.recentRoots.slice(0, 10);
  saveRecentRoots();
  renderRecentRoots();
}

function renderRecentRoots() {
  const options = [
    `<option value="">Recent projects</option>`,
    ...state.recentRoots.map((root) => `<option value="${root}">${root}</option>`)
  ];
  els.recentRoots.innerHTML = options.join("");
}

function saveSettings() {
  state.settings.mavenHome = els.mavenHome.value.trim();
  state.settings.javaHome = els.javaHome.value.trim();
  localStorage.setItem("settings", JSON.stringify(state.settings));
}

function setPreflightStatus(kind, status, details) {
  const statusEl = kind === "maven" ? els.mavenStatus : els.javaStatus;
  const detailsEl = kind === "maven" ? els.mavenDetails : els.javaDetails;
  statusEl.textContent = status;
  statusEl.className = `status ${status.toLowerCase()}`;
  detailsEl.textContent = details;
}

function setTab(tab) {
  const isSuites = tab === "suites";
  els.tabSuites.classList.toggle("tab-active", isSuites);
  els.tabSettings.classList.toggle("tab-active", !isSuites);
  els.paneSuites.classList.toggle("hidden", !isSuites);
  els.paneSettings.classList.toggle("hidden", isSuites);
}

function groupSuites(suites) {
  const groups = new Map();
  for (const suite of suites) {
    const dirPath = path.dirname(suite.path);
    const relDir = state.rootDir ? path.relative(state.rootDir, dirPath) : dirPath;
    const label = relDir && relDir !== "" ? relDir : ".";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(suite);
  }
  return groups;
}

function getVisibleSuites() {
  const query = (els.suiteSearch.value || "").trim().toLowerCase();
  if (!query) return state.suites;
  return state.suites.filter((suite) => {
    const relDir = state.rootDir
      ? path.relative(state.rootDir, path.dirname(suite.path))
      : path.dirname(suite.path);
    return (
      suite.name.toLowerCase().includes(query) ||
      relDir.toLowerCase().includes(query) ||
      suite.path.toLowerCase().includes(query)
    );
  });
}

function renderSuites() {
  const query = (els.suiteSearch.value || "").trim().toLowerCase();
  const visibleSuites = getVisibleSuites();

  if (!visibleSuites.length) {
    const hasQuery = query.length > 0;
    els.suiteList.innerHTML = `
      <div class="empty-card">
        <div class="text-lg font-semibold">${hasQuery ? "No matching suites" : "No test suites found"}</div>
        <div class="text-sm text-slate-500">${
          hasQuery
            ? "Try a different search or select another root folder."
            : "Pick a root folder that contains Maven projects with TestNG suite XML files."
        }</div>
      </div>
    `;
    return;
  }

  const groups = groupSuites(visibleSuites);
  const sortedGroupNames = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));

  els.suiteList.innerHTML = sortedGroupNames
    .map((groupName) => {
      const groupSuites = groups.get(groupName) || [];
      groupSuites.sort((a, b) => a.name.localeCompare(b.name));
      const groupLabel = groupName === "." ? "Root" : groupName.replace(/\\/g, " / ");
      const encodedGroup = encodeURIComponent(groupName);

      const items = groupSuites
        .map((suite) => {
          const status = state.statuses[suite.path] || "Idle";
          const summary = state.summaries[suite.path];
          const meta = state.summaryMeta[suite.path] || {};
          const summaryText = summary
            ? `Tests: ${summary.tests} • Fail: ${summary.failures + summary.errors} • Skip: ${summary.skipped} • Time: ${formatDuration(summary.time)} • Run: ${formatTimestamp(meta.completedAt)}`
            : "No results yet.";
          return `
            <div class="suite-card">
              <div class="suite-info">
                <div class="suite-title" title="${suite.name}">${suite.name}</div>
                <div class="suite-path" title="${suite.path}">${suite.path}</div>
                <div class="suite-summary" title="${summaryText}">${summaryText}</div>
              </div>
              <div class="suite-actions">
                <span class="status ${status.toLowerCase()}">${status}</span>
                <button class="btn secondary" data-action="open-report" data-path="${suite.path}">
                  <i data-lucide="folder-open"></i>
                  Report
                </button>
                <button class="btn run" data-action="run" data-path="${suite.path}">
                  <i data-lucide="play"></i>
                  Run
                </button>
                <button class="btn stop" data-action="stop" data-path="${suite.path}">
                  <i data-lucide="square"></i>
                  Stop
                </button>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="suite-group">
          <div class="suite-group-title">
            <span title="${groupName}">${groupLabel}</span>
            <button class="btn secondary" data-action="run-group" data-group="${encodedGroup}">
              <i data-lucide="play-circle"></i>
              Run Group
            </button>
          </div>
          <div class="suite-group-items">${items}</div>
        </div>
      `;
    })
    .join("");

  if (window.lucide) window.lucide.createIcons();
  renderLogSuiteSelect();
}

async function scanRoot() {
  if (!state.rootDir) return;
  const suites = await ipcRenderer.invoke("scan-root", state.rootDir);
  state.suites = suites;
  state.statuses = {};
  state.logs = {};
  renderSuites();
  renderLogSuiteSelect();
}

function appendConsole(line, type) {
  const span = document.createElement("span");
  span.className = type === "stderr" ? "text-rose-300" : "text-slate-200";
  span.textContent = line;
  els.consoleOutput.appendChild(span);
  els.consoleOutput.scrollTop = els.consoleOutput.scrollHeight;
}

function appendSuiteLog(suitePath, line, type) {
  if (!suitePath) return;
  if (!state.logs[suitePath]) state.logs[suitePath] = [];
  const entry = {
    ts: new Date().toISOString(),
    type,
    line
  };
  state.logs[suitePath].push(entry);
  if (state.selectedLogSuite === suitePath) {
    appendConsole(line, type);
  }
}

function setSelectedLogSuite(suitePath) {
  state.selectedLogSuite = suitePath || "";
  els.consoleOutput.textContent = "";
  if (!suitePath || !state.logs[suitePath]) return;
  for (const entry of state.logs[suitePath]) {
    appendConsole(entry.line, entry.type);
  }
}

function renderLogSuiteSelect() {
  const options = [
    `<option value="">Select a suite to view logs</option>`,
    ...state.suites.map(
      (suite) => `<option value="${suite.path}">${suite.name}</option>`
    )
  ];
  els.logSuiteSelect.innerHTML = options.join("");
}

function formatDuration(seconds) {
  if (!seconds || Number.isNaN(Number(seconds))) return "—";
  const total = Math.round(Number(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function formatTimestamp(iso) {
  if (!iso) return "—";
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
  } catch {
    return "—";
  }
}

els.selectRoot.addEventListener("click", async () => {
  const dir = await ipcRenderer.invoke("select-root");
  if (!dir) return;
  state.rootDir = dir;
  els.rootPath.textContent = dir;
  addRecentRoot(dir);
  await scanRoot();
});

els.refreshRoot.addEventListener("click", scanRoot);
els.recentRoots.addEventListener("change", async (event) => {
  const dir = event.target.value;
  if (!dir) return;
  state.rootDir = dir;
  els.rootPath.textContent = dir;
  addRecentRoot(dir);
  await scanRoot();
});

els.clearConsole.addEventListener("click", () => {
  els.consoleOutput.textContent = "";
});

els.logSuiteSelect.addEventListener("change", (event) => {
  setSelectedLogSuite(event.target.value);
});

els.suiteList.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;
  const suitePath = target.getAttribute("data-path");
  const action = target.getAttribute("data-action");
  const groupName = target.getAttribute("data-group");

  if (action === "run") {
    const result = await ipcRenderer.invoke("run-suite", {
      suitePath,
      settings: state.settings
    });
    if (!result.ok) {
      appendConsole(`${result.error}\n`, "stderr");
      alert(result.error);
    }
  }

  if (action === "stop") {
    const result = await ipcRenderer.invoke("stop-suite", suitePath);
    if (!result.ok) {
      appendConsole(`${result.error}\n`, "stderr");
      alert(result.error);
    }
  }

  if (action === "open-report") {
    const result = await ipcRenderer.invoke("open-report-folder", suitePath);
    if (!result.ok) {
      appendConsole(`${result.error}\n`, "stderr");
      alert(result.error);
    }
  }

  if (action === "run-group" && groupName) {
    const decodedGroup = decodeURIComponent(groupName);
    const suites = getVisibleSuites().filter((suite) => {
      const dirPath = path.dirname(suite.path);
      const relDir = state.rootDir ? path.relative(state.rootDir, dirPath) : dirPath;
      const label = relDir && relDir !== "" ? relDir : ".";
      return label === decodedGroup;
    });
    startQueue(suites);
  }
});

els.tabSuites.addEventListener("click", () => setTab("suites"));
els.tabSettings.addEventListener("click", () => setTab("settings"));
els.suiteSearch.addEventListener("input", renderSuites);

els.saveSettings.addEventListener("click", () => {
  saveSettings();
  alert("Settings saved.");
});

els.runPreflight.addEventListener("click", async () => {
  saveSettings();
  setPreflightStatus("maven", "Running", "Checking Maven...");
  setPreflightStatus("java", "Running", "Checking Java...");
  const result = await ipcRenderer.invoke("preflight-check", {
    settings: state.settings
  });
  if (!result.ok) {
    setPreflightStatus("maven", "Failed", result.error || "Preflight failed.");
    setPreflightStatus("java", "Failed", result.error || "Preflight failed.");
    return;
  }

  if (result.maven.ok) {
    setPreflightStatus("maven", "Completed", result.maven.details);
  } else {
    setPreflightStatus("maven", "Failed", result.maven.details);
  }

  if (result.java.ok) {
    setPreflightStatus("java", "Completed", result.java.details);
  } else {
    setPreflightStatus("java", "Failed", result.java.details);
  }
});

els.runAll.addEventListener("click", () => {
  const suites = getVisibleSuites();
  startQueue(suites);
});

els.exportSummary.addEventListener("click", async () => {
  const suites = getVisibleSuites();
  const rows = suites
    .filter((suite) => state.statuses[suite.path] === "Completed")
    .map((suite) => {
      const summary = state.summaries[suite.path] || {};
      const meta = state.summaryMeta[suite.path] || {};
      return {
        name: suite.name,
        path: suite.path,
        tests: summary.tests ?? "",
        failures: summary.failures ?? "",
        errors: summary.errors ?? "",
        skipped: summary.skipped ?? "",
        timeSeconds: summary.time ?? "",
        completedAt: meta.completedAt ?? ""
      };
    });

  const result = await ipcRenderer.invoke("export-summary", {
    rootDir: state.rootDir,
    rows
  });
  if (!result.ok) {
    appendConsole(`${result.error}\n`, "stderr");
    alert(result.error);
  }
});

els.exportLog.addEventListener("click", async () => {
  const suitePath = state.selectedLogSuite;
  if (!suitePath) {
    alert("Select a suite to export its log.");
    return;
  }
  const entries = state.logs[suitePath] || [];
  if (!entries.length) {
    alert("No logs available for this suite yet.");
    return;
  }
  const result = await ipcRenderer.invoke("export-log", {
    suitePath,
    entries
  });
  if (!result.ok) {
    appendConsole(`${result.error}\n`, "stderr");
    alert(result.error);
  }
});

function startQueue(suites) {
  if (state.queueRunning) {
    appendConsole("A queue is already running. Please wait for it to finish.\n", "stderr");
    return;
  }
  if (!suites || suites.length === 0) return;
  state.runQueue = suites.map((suite) => suite.path);
  state.queueRunning = true;
  runNextInQueue();
}

async function runNextInQueue() {
  if (!state.queueRunning) return;
  const nextPath = state.runQueue.shift();
  if (!nextPath) {
    state.queueRunning = false;
    return;
  }

  const result = await ipcRenderer.invoke("run-suite", {
    suitePath: nextPath,
    settings: state.settings
  });
  if (!result.ok) {
    appendConsole(`${result.error}\n`, "stderr");
    state.statuses[nextPath] = "Failed";
    runNextInQueue();
  }
}

ipcRenderer.on("suite-output", (_event, payload) => {
  appendSuiteLog(payload.suitePath, payload.line, payload.type);
});

ipcRenderer.on("suite-status", (_event, payload) => {
  state.statuses[payload.suitePath] = payload.status;
  renderSuites();
  if (
    state.queueRunning &&
    (payload.status === "Completed" || payload.status === "Failed")
  ) {
    runNextInQueue();
  }
});

ipcRenderer.on("suite-summary", (_event, payload) => {
  state.summaries[payload.suitePath] = payload.summary;
  state.summaryMeta[payload.suitePath] = payload.meta || {};
  renderSuites();
});

loadSettings();
loadRecentRoots();
setTab("suites");
