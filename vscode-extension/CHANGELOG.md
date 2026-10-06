# Changelog

All notable changes to this project will be documented in this file.

## 0.1.7 - 2026-10-06

### Fixed
- Replaced the Activity Bar icon with a scalable, themeable SVG version of the checklist and pencil logo.

## 0.1.6 - 2026-10-05

### Fixed
- Stopping a debug suite now also terminates the process listening on its JDWP port if Surefire's forked JVM survives Maven process-tree cleanup.
- Unix suite stops now run Maven in a separate process group so the full process tree can be signaled.
- Cancelling the test category prompt no longer starts an unfiltered run.
- Maven Home is added to PATH using the current platform's path separator.
- Suite discovery now assigns files to the correct nested workspace root and waits for scans to finish before returning results.

## 0.1.3

### Added
- Root `CHANGELOG.md` for Marketplace-visible release notes.
- npm publish helper scripts for patch, minor, and major extension releases.

### Changed
- README now documents installation from the Visual Studio Marketplace instead of local `.vsix` installation.
- README usage guide is now focused on end users, with extension development steps kept in a separate section.
- README now documents folder-level suite actions in the TestNG Runner view.

### Fixed
- Cleaned up duplicated README content in the development section.

## 0.1.2

### Added
- Empty-state message in the TestNG Runner view when no folder is open in VS Code.
- Folder and subfolder actions in the TestNG Runner view now support running and debugging all TestNG suites under that node.

### Changed
- Folder actions are now functional instead of showing non-working hover icons for directories that contain TestNG suites.

### Fixed
- Folder `Stop` now stops all running suites under that folder, and folder `Open Log` now lets users choose a suite log to open.
- Folder-level batch run/debug resolves test category selection once for the whole batch instead of prompting once per suite.

## 0.1.1

### Added
- Initial suite discovery, run/stop, run-all, per-suite logs, settings panel, test category support, and debug support.

### Changed
- Debug run now waits for debugger readiness before attach, to improve reliability.

### Fixed
- Reduced debug attach handshake timeout issues by delaying attach until JDWP is available.
- Added a debug-port-in-use check before starting debug mode.
