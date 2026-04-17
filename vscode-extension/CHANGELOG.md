# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added
- Empty-state message in the TestNG Runner view when no folder is open in VS Code.
- Folder and subfolder actions in the TestNG Runner view now support running and debugging all TestNG suites under that node.

### Changed
- README now documents installation from the Visual Studio Marketplace instead of local `.vsix` installation.
- README usage guide is now focused on end users, with extension development steps kept in a separate section.
- Folder actions are now functional instead of showing non-working hover icons for directories that contain TestNG suites.

### Fixed
- Cleaned up duplicated README content in the development section.
- Folder `Stop` now stops all running suites under that folder, and folder `Open Log` now lets users choose a suite log to open.

## 0.1.1

### Added
- Initial suite discovery, run/stop, run-all, per-suite logs, settings panel, and test category support.
- Debug suite command/button in the sidebar context menu (`Debug TestNG Suite`).
- New setting: `testngRunner.debugPort` to control debugger attach port.
- Debug mode support for breakpoints by starting Surefire with JDWP `suspend=y`.

### Changed
- Debug run now waits for debugger readiness before attach, to improve reliability.

### Fixed
- Reduced debug attach handshake timeout issues by delaying attach until JDWP is available.
- Added a debug-port-in-use check before starting debug mode.
