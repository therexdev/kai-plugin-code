# Koinos Code plugin

A local coding workspace for **KAI Core 0.2.0 or later**. Install the signed `kai.code` release package through Core's plugin catalog or package installer.

## Available in 0.1.0

- Open a project with the native folder picker, or explicitly grant session access to a saved project.
- Reuse the existing KAI `code-projects.json` registry and view earlier coding sessions without moving project files.
- Browse a project and preview UTF-8 text files up to 256 KB.
- Edit a file manually and stage a review, or ask an installed local model to propose a complete replacement for one selected file.
- Inspect the changed lines and complete proposed result before applying.
- Apply only after native confirmation. Core checks the original file's SHA-256 and identity again after review; changed files are never overwritten silently.
- Revoke access or close the plugin to end its project grants.

The plugin does not run shell commands, execute generated code, access private accounts, use Brain, create/delete files, or automatically change multiple files. AI proposals support source files up to 12,000 characters; reviewed manual replacements support files up to 16,000 characters. The complete change is shown in the native review. Files remain on disk until explicit approval.

## Permissions

| Permission | Purpose |
| --- | --- |
| `models.read` | List installed local models |
| `code.read` | Native project selection, granted file reads, saved coding sessions |
| `code.assist` | Generate a local suggestion for the selected file |
| `code.write` | Stage a replacement and request native approval to apply it |

These are first-party broker capabilities supplied by Core. The sandboxed UI cannot access the filesystem directly. Symlinks, hard links, private KAI profile folders, common credential files and unrestricted paths are rejected. No workflow/network host receives these capabilities.

## Development

This repository contains the renderer in `plugin/`: `index.html`, `app.js`, `style.css`, and `manifest.json`. The native service lives in `kai-core/electron/plugin-services/code.js`. Core owns publisher verification, plugin isolation and permissions.

Use Core's `plugin:pack` script with an Ed25519 publisher key to create a `.kaiplugin` package. Never commit the private signing key. Official releases must be signed by the publisher pinned in Core; a self-signed package cannot claim these privileged first-party capabilities.
