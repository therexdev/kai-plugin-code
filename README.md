# Koinos Code plugin

The original Koinos Code workspace, installed separately in KAI Core. Its project and conversation rails, folder and GitHub screens, composer, plan review, edit diffs, command approvals, slash commands and model/tool pickers use the original application renderer and styles.

The plugin runs the original `CodeAgent`, `CodeProjects`, GitHub client and gateway handlers through publisher-pinned native brokers. It supports multi-file coding, new files, reviewed commands, project instructions, helper agents, plan-first runs, conversation history, project model pins, selected tools, GitHub connection/cloning, branches, commits, pushes and pull requests. Model-generated edits and commands still pause for approval. Native review is bound to the actual proposed operation; a plugin cannot substitute its own description for the operation being approved.

Existing projects, sessions and GitHub connection data stay at their original paths. Corrupt records and changes made outside Core stop writes instead of resetting saved data. Project tools and interface preferences are imported from the original desktop origin, then stored in persistent plugin storage. Code stays local: project context does not silently move to a network model.

The renderer has no Node access, direct filesystem access, arbitrary network requests or unrestricted IPC. Private Core/profile locations cannot be selected as coding projects. Closing or disabling the plugin cancels its active runs and pending approvals.

`code.execute` grants access to the original coding workspace and its separately reviewed filesystem, process and Git actions. Earlier bounded file-edit capabilities remain available for compatibility. `storage.read`/`storage.write` preserve interface preferences; `desktop.preferences` can read only the fixed, non-secret Code/interface preference keys.

Run `npm test` for renderer transport and protocol tests. Core's `plugin-code-workspace.test.js` and `plugin-code-original-engine.test.js` exercise route scoping, native review, lifetime cancellation, and a real original CodeAgent edit against generated project files. The native parity smoke exercises the original UI in the actual sandboxed plugin host. No user files, paid models or real GitHub publishing are used by these tests.

Original UI source baseline: `therexdev/kaiapp` commit `34d17faa0526213b8fc0ac7a65aa7f2c186c6547`, `ui/code-view.js`, the `view-code` section of `ui/index.html`, `ui/styles.css`, and `ui/product-experience.css`. The source renderer is retained; the new bridge changes only its transport and surrounding application window.
