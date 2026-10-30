# Koinos Code — Foundation plugin

Version 0.3.0 requires KAI Foundation 0.7.0 (plugin API 3).

The installed package owns the coding engine, project and conversation storage, Git/GitHub client, command and edit review, slash commands, helper agents, and complete coding interface. Core supplies local model inference, installation/lifecycle, OS secret encryption, and native review through its documented API. There is no dependency on Core's old CodeAgent or HTTP gateway feature routes.

Code keeps source-code inference local. Project tools are optional: install KAI Tools to lend selected tools to a project. Those calls use the declared `kai.tools` service; Code never opens Tools' account or configuration files. Missing Tools does not prevent ordinary coding. GitHub tokens are encrypted with the OS storage API in Code's own data directory.

The interface retains projects, sessions, model pins, planning, multi-file changes, command review, GitHub cloning, branches, commits, pushes and pull requests. A proposed file change or command requires approval before execution. Closing the app view leaves the service available while KAI runs; disabling, updating or quitting revokes the service and cancels its work.

**Trust:** this is a native plugin. Installing it explicitly trusts its code with full computer and application access. The rendered interface is sandboxed, but native code is not. Native review and project checks are product safeguards, not an OS security boundary against a malicious plugin.

Saved data belongs to this plugin's Foundation data directory. This version does not migrate or delete the original application's projects, sessions, connected accounts, or wallet files.

## Public integration

The manifest declares `kai.code` with a `projects` method returning project IDs, display names and missing-folder status. It consumes `kai.tools` (`list`, `call`) when a project chooses extra tools. No remote rental endpoint is exposed.

The native entry is `plugin/service/index.js`, exporting `create(api)`. Its renderer calls `code.request`, `code.poll`, `code.cancel`, and `code.chooseFolder`. The familiar `/core/code/...` strings are plugin-internal operation names; they are not requests to the Core server.

## Building and verification

No npm runtime dependencies are required. `npm test` exercises the original renderer protocol and the actual installed-engine code with generated temporary projects, including a real reviewed file write, session persistence, cancellation, and rejection of network models for private source.

Package this repository's `plugin` directory with the Foundation packer, then run `node scripts/verify-package.js`. Signing keys must stay outside the repository. Package signing does not mean that KAI has audited the publisher.

The preserved interface originated at `therexdev/kaiapp` commit `34d17faa0526213b8fc0ac7a65aa7f2c186c6547`; native engines were extracted from Core 0.6.3 and are now maintained here. Native Windows/macOS dialogs, live GitHub publishing and real model inference require separate integration verification.

## Foundation package publication

Requires KAI Core **0.7.0 or later**, manifest schema 2/API 3 and native API v1. Source lives in `plugin/`, including its service and all runtime dependencies. Runtime installation never runs npm or dependency hooks.

Before signing, install any author dependencies with `npm ci --ignore-scripts` when this repository has a lockfile, run `npm run build --if-present`, then `node scripts/verify-package.js --source` and `npm test`. The source-only check uses a temporary in-memory test signature; it does not claim a publisher release was signed.

Pack the complete plugin using Core's `scripts/core/pack-plugin.js`, keeping the publisher private key outside every repository. Place the new immutable signed asset at `dist/<repository-name>-<manifest-version>.kaiplugin`, then run `node scripts/verify-package.js`. The release verifier checks the actual publisher signature and exact source/assets/dependency contents against the same package rules as Core. Its standalone format snapshot and SHA-256 provenance are under `scripts/package-format-v3*`; it never imports or executes submitted plugin code.

CI tests source on `foundation-v1`, pull requests and `main` on Windows, macOS and Linux. It checks any signed asset present for the current version. Publication runs only from `main`, only when that exact signed asset exists, and only after every check passes. Existing release assets must match byte-for-byte and are never overwritten. Branch builds cannot publish releases. Native device/integration checks remain necessary before a release; unit tests do not replace them.
