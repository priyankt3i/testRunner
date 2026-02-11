# TestNG Runner VS Code Extension

Run TestNG suites directly from VS Code with a dedicated sidebar.

## Features
- Scan workspace for any XML that contains the TestNG `DOCTYPE` tag.
- Run or stop suites from the sidebar.
- Debug suites with breakpoints from the sidebar.
- Stream Maven output to a dedicated Output channel.
- Run all suites.
- Persist last run status (time and exit code).
- Per-suite log files.

## Settings
- `testngRunner.mavenHome`
- `testngRunner.javaHome`
- `testngRunner.testCategoryMode` (prompt, value, all)
- `testngRunner.testCategory`
- `testngRunner.headless` (default, true, false)
- `testngRunner.mavenArgs`
- `testngRunner.debugPort` (default: 5005)

## Quick Overview (What You Will Do)
1. Open the extension folder in VS Code.
2. Install dependencies.
3. Compile the extension.
4. Launch a test VS Code window (Extension Development Host).
5. Use the TestNG Runner sidebar to run suites.

## Step-by-Step (Detailed)
### 1) Open the Extension Folder
You need to open the `vscode-extension` folder by itself.
- In VS Code: `File` -> `Open Folder...`
- Select: `c:\Users\KPriyank\VSCode\testRunner\vscode-extension`

After this, the Explorer should show files like `package.json`, `src/extension.ts`, and `media/testng.svg`.

### 2) Install Dependencies
Open the VS Code terminal:
- `Terminal` -> `New Terminal`

Run:
```bash
npm install
```
This downloads the tools needed to build the extension.

### 3) Compile the Extension
Run:
```bash
npm run compile
```
This builds the extension into the `dist/` folder.

### 4) Launch the Extension in a Test VS Code Window
Press `F5` in VS Code.

This opens a new window called **Extension Development Host**.
That window is your test playground.

### 5) Open Your Project in the Test Window
In the **Extension Development Host** window:
- `File` -> `Open Folder...`
- Select: `c:\Users\KPriyank\VSCode\testRunner`

Now the extension can scan for TestNG XML files in your project.

### 6) Find the TestNG Runner Sidebar
On the left side Activity Bar, click the icon labeled **TestNG Runner**.
You should see a list of suites (each `testng.xml` file).

### 7) Run a Suite
In the TestNG Runner list:
- Click the **play** icon next to a suite, or
- Right-click a suite and choose **Run TestNG Suite**.

If `testngRunner.testCategoryMode` is set to `prompt`, you will be asked to pick a Test Category before running.

### 8) See the Output
Open the Output panel:
- `View` -> `Output`
- Choose **TestNG Runner** from the dropdown.

You will see Maven logs and test output here.

### 8b) Debug a Suite (Breakpoints)
In the TestNG Runner list:
- Click the **debug** icon next to a suite, or
- Right-click a suite and choose **Debug TestNG Suite**.

This runs Maven with Surefire in JDWP suspend mode and auto-attaches VS Code's Java debugger on `testngRunner.debugPort`. Because the JVM starts with `suspend=y`, execution waits for the debugger, so breakpoints can pause the test run.

### 9) Stop a Running Suite
Click the **stop** icon next to the running suite.

## Configure Maven and Java (Important If Not in PATH)
If Maven or Java are not in your Windows PATH, set them in VS Code settings.

In the **Extension Development Host** window:
- `File` -> `Preferences` -> `Settings`
- Search for: `TestNG Runner`
- Fill in:
  - **Maven Home** (example: `C:\Program Files\Apache\maven`)
  - **Java Home** (example: `C:\Program Files\Java\jdk-17`)

## Test Category and Headless Controls
- Use `testngRunner.headless` to force `-Dheadless=true|false` or leave default.
- Use `testngRunner.testCategoryMode`:
  - `prompt`: pick a Test Category from detected `@Test(groups=...)` values each run.
  - `value`: always use the saved `testngRunner.testCategory`.
  - `all`: run all tests without passing `-DtestCategory`.
- Use the command **TestNG Runner: Select Test Category** to pick and save a category from your codebase.

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

## Development Notes
Common commands:
```bash
npm run compile
npm run watch
```
Use `npm run watch` if you are actively changing the extension code.

## Where Are The Logs?
Each suite writes to its own log file.
The files are stored in VS Code's extension storage directory.
You can open them by right-clicking a suite and choosing **Open TestNG Suite Log**.


## For Debug mode you need Extension Pack for Java from Microsoft (VSCode extention installed)