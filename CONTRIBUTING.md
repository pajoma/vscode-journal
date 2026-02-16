# Contributing to VSCode-Journal
Thank you so much for your interest in contributing! All types of contributions are encouraged and valued. 

## About the Project
I have been writing notes every day for over 10 years and still use this extension all the time. In the beginning only with Notepad and other text editors. When the first version of Visual Studio Code came out, I saw an opportunity to get to know Typescript better and started developing this extension.  That's why I mainly focus on ideas and extensions that help me in my daily work.

The source code reflects this journey. A bit bumpy at the beginning (and still today for sure, all this javascript stuff makes me doubt myself often enough), but it got a bit better with the years. 

## How to contribute

There are several ways to contribute.

* If you find any issues, weird behaviour or plain error, don't hesitate to [open an issue](https://github.com/pajoma/vscode-journal/issues/new). I try to react timely, but don't count on it. 
* [Start a discussion](https://github.com/pajoma/vscode-journal/discussions/new) if you have question or feature requests. Or see if there are any other unanswered questions you might be able to answer. 
* Leave a review on the [marketplace](https://marketplace.visualstudio.com/items?itemName=pajoma.vscode-journal&ssr=false#review-details) and keep me motivated ;)
* Let me buy a beer by [sponsoring](https://github.com/sponsors/pajoma) my work here

If you plan to contribute with updates to the source, follow these steps

* Outline your idea in the discussions. 
* Talk to me on [Gitter](https://gitter.im/dictyo) for further questions. 
* Create a fork, do your thing, and create a pull request. Please write tests if possible. 

## Prerequisites

* [Node.js](https://nodejs.org/) v20 or later (includes npm)
* [Visual Studio Code](https://code.visualstudio.com/) v1.94 or later

## Building the Extension

1. **Clone the repository** and install dependencies:

   ```bash
   git clone https://github.com/pajoma/vscode-journal.git
   cd vscode-journal
   npm install
   ```

2. **Compile the extension** (bundles `src/extension.ts` → `dist/extension.js` via esbuild):

   ```bash
   npm run compile
   ```

3. **Watch mode** — recompiles automatically on file changes:

   ```bash
   npm run watch
   ```

4. **Production build** (minified, no source maps):

   ```bash
   npm run package
   ```

5. **Lint** the source code:

   ```bash
   npm run lint
   ```

## Running the Extension in VS Code

Open the project folder in VS Code. The recommended workflow:

1. Press **F5** (or select **Run → Start Debugging**).  
   This launches the **"Run Extension"** configuration, which:
   - Runs `npm run watch` as a pre-launch task (auto-rebuilds on changes)
   - Opens a new VS Code window (Extension Development Host) with the extension loaded
   - Uses `test/ws_manual/` as the workspace folder

2. To run **without a workspace**, select the **"Run Extension without Workspace"** launch configuration from the debug dropdown.

3. Make changes to the source code — esbuild will rebuild automatically. Reload the Extension Development Host window (`Ctrl+R` / `Cmd+R`) to pick up changes.

## Running Tests

Tests are executed inside a VS Code Extension Host using [`@vscode/test-cli`](https://github.com/nicolo-ribaudo/vscode-test-cli).

* **From the terminal** (runs the full pretest + test pipeline):

  ```bash
  npm test
  ```

  This will compile tests (`tsc` → `out/`), compile the extension (`esbuild` → `dist/`), lint, and then run the test suite.

* **From VS Code**: select the **"Extension Tests"** launch configuration and press **F5**. This compiles both the extension and tests in watch mode, then runs the tests in the Extension Development Host.

* **Compile tests only** (without running them):

  ```bash
  npm run compile-tests
  ```

## Project Structure

```
src/
├── extension.ts        # Extension entry point (activate/deactivate)
├── ext/                # VS Code integration (config, startup, dialogues)
├── actions/            # Business logic (reader, writer, inject, parser)
├── model/              # Data types and interfaces
├── provider/           # Commands, code actions, features
├── util/               # Utilities (controller, logger, dates, paths, strings)
└── test/               # Test suites
```

Key build files:
- `esbuild.mjs` — Build script (replaces webpack)
- `eslint.config.mjs` — ESLint flat config
- `.vscode-test.mjs` — Test runner configuration
- `tsconfig.json` — TypeScript compiler options

## Code of conduct

Just be decent. 
