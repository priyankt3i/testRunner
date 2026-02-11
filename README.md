# TestNG Runner VS Code Extension

Run TestNG suites from a simple VS Code UI without requiring users to work inside Java IDE workflows.

## Marketplace
- Install directly from Visual Studio Marketplace:
`https://marketplace.visualstudio.com/items?itemName=KumarPriyank.testng-runner-vscode`

## End User Guide
- Full step-by-step guide: `docs/GETTING_STARTED.md`

## Installation Options

### Option 1: Marketplace (recommended)
1. Open VS Code.
2. Open Extensions view (`Ctrl+Shift+X`).
3. Search for `KumarPriyank.testng-runner-vscode`.
4. Click `Install`.

### Option 2: Install from `.vsix`
1. Build `.vsix` from source (see below).
2. In VS Code, run command: `Extensions: Install from VSIX...`.
3. Select the generated `.vsix` file.

## Build `.vsix` From Source
1. Install dependencies:
```bash
npm install
```
2. Package extension:
```bash
npx @vscode/vsce package
```
3. Output:
- A file like `testng-runner-vscode-<version>.vsix` in the project root.

## Runtime Requirements
- Windows 10/11
- Java JDK installed
- Maven installed (or Maven path configured in extension settings)

## Support
- Name: Kumar Priyank
- Email: `kumarpriyank@outlook.com`
- GitHub: `https://github.com/priyankt3i`
- LinkedIn: `https://www.linkedin.com/in/priyankt3i`
