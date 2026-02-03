const { ipcRenderer } = require("electron");
const path = require("path");

const state = {
  rootDir: null,
  suites: [],
  statuses: {},
  settings: {
    mavenHome: "",
    javaHome: ""
  }
};

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
  mavenHome: document.getElementById("mavenHome"),
  javaHome: document.getElementById("javaHome"),
  saveSettings: document.getElementById("saveSettings")
};

function loadSettings() {
  const saved = JSON.parse(localStorage.getItem("settings") || "{}");
  state.settings.mavenHome = saved.mavenHome || "";
  state.settings.javaHome = saved.javaHome || "";
  els.mavenHome.value = state.settings.mavenHome;
  els.javaHome.value = state.settings.javaHome;
}

function saveSettings() {
  state.settings.mavenHome = els.mavenHome.value.trim();
  state.settings.javaHome = els.javaHome.value.trim();
  localStorage.setItem("settings", JSON.stringify(state.settings));
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

function renderSuites() {
  const query = (els.suiteSearch.value || "").trim().toLowerCase();
  const visibleSuites = query
    ? state.suites.filter((suite) => {
        const relDir = state.rootDir
          ? path.relative(state.rootDir, path.dirname(suite.path))
          : path.dirname(suite.path);
        return (
          suite.name.toLowerCase().includes(query) ||
          relDir.toLowerCase().includes(query) ||
          suite.path.toLowerCase().includes(query)
        );
      })
    : state.suites;

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

      const items = groupSuites
        .map((suite) => {
          const status = state.statuses[suite.path] || "Idle";
          return `
            <div class="suite-card">
              <div class="suite-info">
                <div class="suite-title" title="${suite.name}">${suite.name}</div>
                <div class="suite-path" title="${suite.path}">${suite.path}</div>
              </div>
              <div class="suite-actions">
                <span class="status ${status.toLowerCase()}">${status}</span>
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
          <div class="suite-group-title">${groupLabel}</div>
          <div class="suite-group-items">${items}</div>
        </div>
      `;
    })
    .join("");

  if (window.lucide) window.lucide.createIcons();
}

async function scanRoot() {
  if (!state.rootDir) return;
  const suites = await ipcRenderer.invoke("scan-root", state.rootDir);
  state.suites = suites;
  state.statuses = {};
  renderSuites();
}

function appendConsole(line, type) {
  const span = document.createElement("span");
  span.className = type === "stderr" ? "text-rose-300" : "text-slate-200";
  span.textContent = line;
  els.consoleOutput.appendChild(span);
  els.consoleOutput.scrollTop = els.consoleOutput.scrollHeight;
}

els.selectRoot.addEventListener("click", async () => {
  const dir = await ipcRenderer.invoke("select-root");
  if (!dir) return;
  state.rootDir = dir;
  els.rootPath.textContent = dir;
  await scanRoot();
});

els.refreshRoot.addEventListener("click", scanRoot);

els.clearConsole.addEventListener("click", () => {
  els.consoleOutput.textContent = "";
});

els.suiteList.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-action]");
  if (!target) return;
  const suitePath = target.getAttribute("data-path");
  const action = target.getAttribute("data-action");

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
});

els.tabSuites.addEventListener("click", () => setTab("suites"));
els.tabSettings.addEventListener("click", () => setTab("settings"));
els.suiteSearch.addEventListener("input", renderSuites);

els.saveSettings.addEventListener("click", () => {
  saveSettings();
  alert("Settings saved.");
});

ipcRenderer.on("suite-output", (_event, payload) => {
  appendConsole(payload.line, payload.type);
});

ipcRenderer.on("suite-status", (_event, payload) => {
  state.statuses[payload.suitePath] = payload.status;
  renderSuites();
});

loadSettings();
setTab("suites");
