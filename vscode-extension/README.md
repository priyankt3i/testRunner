# TestNG Runner VS Code Extension

Run TestNG suites directly from VS Code with a dedicated sidebar.

## Interactive AI Documentation

[NotebookLM link](https://notebooklm.google.com/notebook/020a3e6a-ed2f-4563-8090-b7f049202241)

## Features
- Scan workspace for any XML that contains the TestNG `DOCTYPE` tag.
- Run or stop suites from the sidebar.
- Debug suites with breakpoints from the sidebar.
- Stream Maven output to a dedicated Output channel.
- Run all suites.
- Persist last run status (time and exit code).
- Per-suite log files.

## How To Use In VS Code
### 1) Install the extension
Install the packaged `.vsix` in VS Code:
- Open `Extensions`
- Click the `...` menu
- Select `Install from VSIX...`
- Choose `testng-runner-vscode-0.1.1.vsix`

### 2) Open your Java/TestNG project
Open the project that contains:
- a `pom.xml`
- one or more TestNG suite XML files

The extension only shows XML files that contain the TestNG `DOCTYPE` declaration, for example:

```xml
<!DOCTYPE suite SYSTEM "https://testng.org/testng-1.0.dtd">
```

### 3) Open the TestNG Runner view
In the Activity Bar, click **TestNG Runner**.

The sidebar shows TestNG suite files grouped by workspace folder and directory. If a suite has been run before, its last run time and exit code appear next to it.

### 4) Configure Java and Maven if needed
If `mvn` and `java` are already available on your system `PATH`, you can skip this step.

Otherwise open VS Code settings and search for `TestNG Runner`, then set:
- `testngRunner.mavenHome`
- `testngRunner.javaHome`

Examples:
- `C:\Program Files\Apache\maven`
- `C:\Program Files\Java\jdk-17`

The status bar shows whether Maven and Java are currently resolved.

### 5) Run a suite
Use any of these entry points from the TestNG Runner view:
- Click the inline **Run TestNG Suite** icon next to a suite
- Right-click a suite and choose **Run TestNG Suite**
- Click **Run All TestNG Suites** in the view title to run every discovered suite

The extension finds the nearest `pom.xml` above the selected suite and runs Maven from that directory.

### 6) Watch logs and output
Runtime output is written to:
- the shared **TestNG Runner** Output channel
- a suite-specific output channel
- a per-suite log file

To open the log file for a suite:
- Right-click the suite
- Select **Open TestNG Suite Log**

### 7) Stop a running suite
Click the inline **Stop TestNG Suite** icon for the running suite, or use the suite context menu.

### 8) Debug a suite with breakpoints
To debug instead of run:
- Click the inline **Debug TestNG Suite** icon
- Or right-click a suite and choose **Debug TestNG Suite**

The extension starts Surefire with JDWP enabled and tries to auto-attach the VS Code Java debugger on `testngRunner.debugPort` (default `5005`).

Debug prerequisite:
- Install **Extension Pack for Java** by Microsoft

### 9) Use test category selection
The extension can detect TestNG groups from `@Test(groups = ...)` in Java files.

Relevant settings:
- `testngRunner.testCategoryMode = prompt`
  Prompts you to choose a detected group each time you run a suite.
- `testngRunner.testCategoryMode = value`
  Always uses the saved `testngRunner.testCategory`.
- `testngRunner.testCategoryMode = all`
  Runs without passing `-DtestCategory`.

You can also run the command **TestNG Runner: Select Test Category** to choose and save a category from the current workspace.

### 10) Control headless mode and extra Maven arguments
Use these settings when your test framework needs them:
- `testngRunner.headless`
  Passes `-Dheadless=true` or `-Dheadless=false`
- `testngRunner.mavenArgs`
  Appends extra Maven arguments such as `-Denv=qa`

## Troubleshooting
### No suites found
- Make sure your project has one or more TestNG XML files with the TestNG `DOCTYPE` tag.
- Click the refresh icon in the TestNG Runner sidebar.

### Maven not found
- Either install Maven and add to PATH
- Or set **Maven Home** in settings

### Java not found
- Either install JDK and set JAVA_HOME
- Or set **Java Home** in settings

## Development
If you are working on the extension itself, use the steps below.

## Settings
- `testngRunner.mavenHome`
- `testngRunner.javaHome`
- `testngRunner.testCategoryMode` (prompt, value, all)
- `testngRunner.testCategory`
- `testngRunner.headless` (default, true, false)
- `testngRunner.mavenArgs`
- `testngRunner.debugPort` (default: 5005)

### Codebase | Build and run the extension locally
```bash
npm install
npm run compile
```

Press `F5` to launch an **Extension Development Host** window, then open a test workspace there and use the **TestNG Runner** view.

### Common commands
```bash
npm run compile
npm run watch
```
Use `npm run watch` if you are actively changing the extension code.

## Where Are The Logs?
Each suite writes to its own log file.
The files are stored in VS Code's extension storage directory.
You can open them by right-clicking a suite and choosing **Open TestNG Suite Log**.

## Change Log
Keep this section updated whenever the extension changes (features added, changed, fixed, or removed).

### Unreleased
#### Added
- Debug suite command/button in the sidebar context menu (`Debug TestNG Suite`).
- New setting: `testngRunner.debugPort` to control debugger attach port.
- Debug mode support for breakpoints by starting Surefire with JDWP `suspend=y`.

#### Changed
- Debug run now waits for debugger readiness before attach, to improve reliability.

#### Fixed
- Reduced debug attach handshake timeout issues by delaying attach until JDWP is available.
- Added a debug-port-in-use check before starting debug mode.

#### Removed
- None.

### 0.1.1
#### Added
- Initial suite discovery, run/stop, run-all, per-suite logs, settings panel, and test category support.

#### Changed
- None.

#### Fixed
- None.

#### Removed
- None.
