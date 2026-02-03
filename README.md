# TestNG Runner

A clean, modern Windows desktop GUI for running TestNG automation suites without an IDE. Built with Electron, Tailwind CSS, and Node.js.

## Features
- Select a root folder containing multiple Maven projects
- Auto-scan for `testng.xml` files
- Run/Stop controls per suite with status indicator
- Live console streaming stdout/stderr
- Settings for Maven Home and Java Home
- Windows process tree termination via `taskkill`

## Requirements
- Windows 10/11
- Node.js 18+ (recommended)
- Java (JDK) installed
- Maven installed (or set Maven Home inside the app)

## Install
```bash
npm install
```

## Run (Development)
```bash
npm start
```

## Build a Windows EXE (Portable)
```bash
npm run dist
```

The EXE will be created under `dist/` with the name `TestNG-Runner-1.0.0.exe`.

## Settings
If Maven or Java are not in your system PATH, open the **Settings** tab:
- **Maven Home**: path to Maven install directory (example: `C:\Program Files\Apache\maven`)
- **Java Home**: path to JDK directory (example: `C:\Program Files\Java\jdk-17`)

## Notes
- The app looks for the nearest `pom.xml` above each `testng.xml` to set the Maven working directory.
- Stop kills the full process tree to ensure the JVM is terminated.

## Troubleshooting
**Maven not found**
- Ensure `mvn` is in PATH, or set Maven Home in Settings.

**Java not found**
- Set Java Home in Settings, or ensure JAVA_HOME is configured.
