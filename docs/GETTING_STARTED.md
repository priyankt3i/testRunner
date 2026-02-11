# TestNG Runner VS Code Extension - Getting Started

This guide is for end users who want to run TestNG suites from VS Code with a simpler interface.

## 1. Install the Extension

### Option A: Install from Marketplace (recommended)
1. Open VS Code.
2. Open Extensions (`Ctrl+Shift+X`).
3. Search: `KumarPriyank.testng-runner-vscode`.
4. Click `Install`.

Marketplace URL:
`https://marketplace.visualstudio.com/items?itemName=KumarPriyank.testng-runner-vscode`

### Option B: Install from a `.vsix` file
1. Open VS Code.
2. Open Command Palette (`Ctrl+Shift+P`).
3. Run command: `Extensions: Install from VSIX...`.
4. Pick your `.vsix` file.

## 2. Build `.vsix` From Source (for maintainers)
1. Open terminal in project root.
2. Install dependencies:
```bash
npm install
```
3. Create VSIX package:
```bash
npx @vscode/vsce package
```
4. Use the generated file:
- `testng-runner-vscode-<version>.vsix` (name may vary by package config)

## 3. Prerequisites on User Machine
- Windows 10/11
- Java JDK installed
- Maven installed, or Maven path configured in extension settings

## 4. First-Time Setup
1. Open the extension UI in VS Code.
2. Configure Maven and Java paths in extension settings if they are not already in system `PATH`.
3. Run the preflight check if available.
4. Confirm Maven and Java checks pass.

## 5. Typical User Flow
1. Select automation root folder.
2. Let extension scan subfolders for TestNG suite XML files.
3. Use search to filter suites by name or path.
4. Run one suite, run a folder group, or run all visible suites.
5. Monitor live logs.
6. Stop a running suite when required.
7. Review summary and export CSV/logs if needed.

## 6. Reports and Logs
- Open per-suite report folder after run.
- View per-suite logs inside extension UI.
- Export per-suite logs to file.
- Export completed run summaries to CSV.

## 7. Troubleshooting

### Maven not found
- Ensure Maven is installed.
- Ensure `mvn` is available in `PATH`, or set Maven path in extension settings.

### Java not found
- Ensure JDK is installed.
- Ensure `JAVA_HOME`/`PATH` is correct, or set Java path in extension settings.

### Suites not detected
- Verify selected root folder is correct.
- Verify suite XML is TestNG type and valid.

### Stop does not appear immediate
- Process tree shutdown can take a few seconds on Windows.
- Check status and logs in the extension panel.

## 8. Support
- Name: Kumar Priyank
- Email: `kumarpriyank@outlook.com`
- GitHub: `https://github.com/priyankt3i`
- LinkedIn: `https://www.linkedin.com/in/priyankt3i`
