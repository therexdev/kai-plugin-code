"use strict";
// Feature-owned request handlers. No listener or Core gateway is created.
const FORWARDED_HEADERS = ["forwarded", "x-forwarded-for", "x-forwarded-host"];
class Router {
 constructor(services) { Object.assign(this,services); }
 async _readBody(req) { const chunks=[]; let bytes=0; for await(const c of req) {bytes+=c.length;if(bytes>4*1024*1024)throw Error("Request is too large");chunks.push(c);}return Buffer.concat(chunks); }
 _json(res,status,body) {res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(body));}
 async route(req,res) {
 const url=new URL(req.url,"http://plugin.invalid"), path=url.pathname;
 if(path==="/core/models"&&req.method==="GET")return this._json(res,200,{ok:true,aliases:this.models.aliases(),runtime:this.runtime.status()});
 if(path==="/core/network"&&req.method==="GET")return this._json(res,200,this.network.status());
    if (this.code && this.code.switch && path === "/core/code-switch") {
      if (req.method === "GET") return this._json(res, 200, { ok: true, ...this.code.switch.status() });
      if (req.method === "POST") {
        try {
          const b = JSON.parse((await this._readBody(req)).toString("utf8") || "{}");
          return this._json(res, 200, { ok: true, ...this.code.switch.configure({ enabled: b.enabled === true }) });
        } catch (e) {
          return this._json(res, 400, { ok: false, error: String(e.message) });
        }
      }
    }
    if (this.code && path.startsWith("/core/code/")) {
      // Koinos Code has its own switch now (task #72): it is its own sidebar
      // item, and its capability is a different question from the developer
      // tools' multi-agent surfaces. The switch seeds itself from dev.tools on
      // first read, so existing users keep what they already had.
      if (!(this.code.switch && this.code.switch.status().enabled)) {
        return this._json(res, 403, { ok: false, error: "Koinos Code is switched off (Settings → Koinos Code)." });
      }
      // This surface is the widest in the product: it writes files ANYWHERE
      // the caller names and runs shell commands as this user — unlike teams'
      // run_code, which is sandboxed to the app workspace. Core binds loopback
      // only, so the sole way a non-local caller reaches here is a reverse
      // proxy the operator put in front (the A40 headless shape). _sameSite
      // deliberately trusts header-less callers, and a proxy commonly strips
      // origin/sec-fetch-site — so for THIS surface a forwarded request must
      // carry the core token. Desktop users never see this: nothing forwards.
      if (!this.coreToken && FORWARDED_HEADERS.some((h) => req.headers[h])) {
        return this._json(res, 403, {
          ok: false,
          error:
            "Koinos Code refuses proxied requests unless KAI_CORE_TOKEN is set. This endpoint writes files and runs commands anywhere on the machine, so a forwarded caller must prove itself.",
        });
      }
      /*
       * Projects and sessions. Every one of these sits BEHIND the same switch
       * and the same forwarded-header refusal as /core/code/run above — a
       * caller who can add a project chooses where the agent may write, which
       * is exactly as powerful as starting a run.
       */
      const P = this.code.projects;
      // Folder navigation for "Select a folder". Directories only — it never
      // lists files, so it cannot be used to discover document names.
      if (path === "/core/code/browse" && req.method === "POST") {
        try {
          const b = JSON.parse((await this._readBody(req)).toString("utf8") || "{}");
          return this._json(res, 200, { ok: true, ...require("./core/lib/code-projects").browseDir(b.dir) });
        } catch (e) {
          return this._json(res, 400, { ok: false, error: String(e.message) });
        }
      }
      // Which registry tools this machine could lend the coding agent right
      // now. Privacy filtering is the registry's own — egress tools simply are
      // not in the list in Local-Only.
      // A project's own slash commands, for the composer's list.
      if (path === "/core/code/commands" && req.method === "POST") {
        try {
          const b = JSON.parse((await this._readBody(req)).toString("utf8") || "{}");
          const p = this.code.projects.get(String(b.projectId || ""));
          const list = require("./core/lib/code-commands")
            .listCommands(p.path)
            .map((c) => ({ name: c.name, description: c.description }));
          return this._json(res, 200, { ok: true, commands: list, dir: require("./core/lib/code-commands").DIR });
        } catch (e) {
          return this._json(res, 400, { ok: false, error: String(e.message) });
        }
      }
      if (path === "/core/code/tools" && req.method === "GET") {
        let list = [];
        try {
          list = (this.code.registry ? this.code.registry.list() : []).map((t) => ({
            name: t.name,
            description: t.description,
            sensitive: t.sensitive === true,
            egress: t.egress === true,
          }));
        } catch {
          list = [];
        }
        return this._json(res, 200, { ok: true, tools: list, max: require("./core/lib/code-agent").MAX_EXTRA_TOOLS });
      }
      if (path === "/core/code/projects" && req.method === "GET") {
        return this._json(res, 200, { ok: true, projects: P.list() });
      }
      if (path === "/core/code/projects" && req.method === "POST") {
        try {
          const b = JSON.parse((await this._readBody(req)).toString("utf8") || "{}");
          return this._json(res, 200, { ok: true, project: P.add({ dir: b.dir, name: b.name, origin: b.origin || null }) });
        } catch (e) {
          return this._json(res, 400, { ok: false, error: String(e.message) });
        }
      }
      if (path.startsWith("/core/code/projects/")) {
        const rest = path.slice("/core/code/projects/".length).split("/");
        const projectId = decodeURIComponent(rest[0] || "");
        try {
          if (rest.length === 1 && req.method === "DELETE") {
            // Forgets the project. The FOLDER is never touched — removing a
            // project from the list must never be a way to lose work.
            return this._json(res, 200, { ok: true, removed: P.remove(projectId) });
          }
          if (rest.length === 1 && req.method === "PATCH") {
            const b = JSON.parse((await this._readBody(req)).toString("utf8") || "{}");
            let project = P.get(projectId);
            if (b.name !== undefined) project = P.rename(projectId, b.name);
            // "" is a real value here — it means "follow the app default" —
            // so presence, not truthiness, decides whether to set it.
            if (b.model !== undefined) project = P.setModel(projectId, b.model);
            return this._json(res, 200, { ok: true, project });
          }
          if (rest[1] === "sessions" && rest.length === 2 && req.method === "GET") {
            return this._json(res, 200, { ok: true, sessions: P.sessions(projectId) });
          }
          if (rest[1] === "sessions" && rest.length === 2 && req.method === "POST") {
            const b = JSON.parse((await this._readBody(req)).toString("utf8") || "{}");
            return this._json(res, 200, { ok: true, session: P.newSession(projectId, { title: b.title }) });
          }
          if (rest[1] === "sessions" && rest.length === 3 && req.method === "GET") {
            return this._json(res, 200, { ok: true, session: P.session(projectId, decodeURIComponent(rest[2])) });
          }
          if (rest[1] === "sessions" && rest.length === 3 && req.method === "DELETE") {
            return this._json(res, 200, { ok: true, removed: P.deleteSession(projectId, decodeURIComponent(rest[2])) });
          }
        } catch (e) {
          return this._json(res, 400, { ok: false, error: String(e.message) });
        }
        return this._json(res, 404, { ok: false, error: "no such Koinos Code route" });
      }
      /*
       * GitHub. Behind the same switch and the same forwarded-header refusal
       * as everything else here — this surface holds a credential and can push
       * to someone's repositories.
       */
      if (path.startsWith("/core/code/github")) {
        const GH = this.code.github;
        const readBody = async () => JSON.parse((await this._readBody(req)).toString("utf8") || "{}");
        // Resolve a projectId to its folder: every repo action names a project
        // the user added, never a raw path from the request.
        const dirOf = async (b) => this.code.projects.get(String(b.projectId || "")).path;
        try {
          if (path === "/core/code/github" && req.method === "GET") {
            return this._json(res, 200, { ok: true, ...GH.status(), git: await require("./core/lib/git").available() });
          }
          if (path === "/core/code/github/connect" && req.method === "POST") {
            return this._json(res, 200, { ok: true, ...(await GH.connect((await readBody()).token)) });
          }
          if (path === "/core/code/github/disconnect" && req.method === "POST") {
            return this._json(res, 200, { ok: true, ...GH.disconnect() });
          }
          if (path === "/core/code/github/repos" && req.method === "GET") {
            return this._json(res, 200, { ok: true, repos: await GH.repos({}) });
          }
          if (path === "/core/code/github/clone" && req.method === "POST") {
            const b = await readBody();
            const out = await GH.clone({ repo: b.repo, parentDir: b.parentDir });
            // A clone that is not added as a project would be a folder nobody
            // can reach from the UI — so it becomes one, with its origin.
            const project = this.code.projects.add({ dir: out.dir, name: b.name || "", origin: out.repo });
            return this._json(res, 200, { ok: true, ...out, project });
          }
          if (path === "/core/code/github/status" && req.method === "POST") {
            return this._json(res, 200, { ok: true, status: await GH.status_(await dirOf(await readBody())) });
          }
          if (path === "/core/code/github/branch" && req.method === "POST") {
            const b = await readBody();
            return this._json(res, 200, { ok: true, status: await GH.branch(await dirOf(b), b.name) });
          }
          if (path === "/core/code/github/commit" && req.method === "POST") {
            const b = await readBody();
            return this._json(res, 200, { ok: true, status: await GH.commit(await dirOf(b), b.message) });
          }
          if (path === "/core/code/github/push" && req.method === "POST") {
            return this._json(res, 200, { ok: true, ...(await GH.push(await dirOf(await readBody()))) });
          }
          if (path === "/core/code/github/pr" && req.method === "POST") {
            const b = await readBody();
            return this._json(res, 200, { ok: true, pr: await GH.pullRequest(await dirOf(b), { title: b.title, body: b.body, base: b.base }) });
          }
        } catch (e) {
          return this._json(res, 400, { ok: false, error: String(e.message) });
        }
        return this._json(res, 404, { ok: false, error: "no such Koinos Code GitHub route" });
      }
      if (path === "/core/code/approve" && req.method === "POST") {
        let body;
        try {
          body = JSON.parse((await this._readBody(req)).toString("utf8") || "{}");
        } catch {
          return this._json(res, 400, { ok: false, error: "Body must be JSON" });
        }
        const took = this.code.provideApproval(String(body.approvalId || ""), body.approved === true);
        return this._json(res, took ? 200 : 404, took ? { ok: true } : { ok: false, error: "no such pending approval — it may have timed out" });
      }
      if (path === "/core/code/stop" && req.method === "POST") {
        let body;
        try {
          body = JSON.parse((await this._readBody(req)).toString("utf8") || "{}");
        } catch {
          return this._json(res, 400, { ok: false, error: "Body must be JSON" });
        }
        return this._json(res, 200, { ok: true, stopped: this.code.stop(String(body.runId || "")) });
      }
      if (path === "/core/code/run" && req.method === "POST") {
        let body;
        try {
          body = JSON.parse((await this._readBody(req)).toString("utf8") || "{}");
        } catch {
          return this._json(res, 400, { ok: false, error: "Body must be JSON" });
        }
        /*
         * A run can name a PROJECT and a SESSION instead of a raw path. That
         * is what turns this from a command into a workspace: the directory
         * comes from the project, and the session's earlier turns ride along
         * so "now do the same to the other file" means something. A bare `dir`
         * still works exactly as before — the CLI and any existing script that
         * predates projects keep running unchanged.
         */
        let dir = String(body.dir || "");
        let project = null;
        let sessionId = String(body.sessionId || "");
        let history = [];
        let staleModel = ""; // a pinned model that is no longer installed
        try {
          if (body.projectId) {
            project = this.code.projects.get(String(body.projectId));
            dir = project.path;
            // No session named: start one, so every run through a project is
            // part of a thread rather than falling out of the history.
            if (!sessionId) sessionId = this.code.projects.newSession(project.id, {}).id;
            history = this.code.projects.history(project.id, sessionId);
            /*
             * A project may pin its own model. An explicit model in the
             * request still wins — the picker in the composer is the live
             * choice — and a pin that no longer resolves is IGNORED rather
             * than fatal: models get deleted, and a project must not become
             * unopenable because one did. An alias the caller named on this
             * request is a different matter and still fails loudly.
             */
            if (!String(body.model || "").trim() && project.model) {
              try {
                this.models.resolveAlias(project.model);
                body.model = project.model;
              } catch {
                staleModel = project.model;
                // Fall back to whatever the app is actually serving, so the
                // project still opens and works while the pin is stale.
                const live = this.runtime?.status?.().activeAlias;
                if (live) body.model = live;
              }
            }
          }
        } catch (e) {
          return this._json(res, 400, { ok: false, error: String(e.message) });
        }

        /*
         * Slash commands expand BEFORE the stream opens, so an unknown command
         * is an ordinary 400 the caller can read — not an error buried in an
         * SSE frame. A command is a prompt template and nothing more: it
         * changes what is asked, never what is permitted.
         */
        let task = String(body.task || "");
        let commandName = null;
        {
          const expanded = require("./core/lib/code-commands").expand(dir, task);
          if (expanded) {
            if (expanded.error) return this._json(res, 400, { ok: false, error: expanded.error });
            commandName = expanded.name;
            task = expanded.task;
          }
        }

        // SSE with approval-request events: the run PAUSES on every write
        // and command until /core/code/approve answers that card.
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
        const send = (obj) => { this.track?.(obj); return res.write(`data: ${JSON.stringify(obj)}\n\n`); };
        if (commandName) send({ trace: { type: "note", text: `/${commandName}` } });
        if (staleModel) send({ trace: { type: "note", text: `${staleModel} is not installed — using the app's model instead` } });
        if (project && sessionId) send({ session: { projectId: project.id, sessionId } });
        try {
          const r = await this.code.run({
            dir,
            task,
            model: String(body.model || ""),
            maxSteps: body.maxSteps,
            history,
            // "plan" reads and proposes; "act" (the default) does the work.
            mode: body.mode === "plan" ? "plan" : "act",
            plan: String(body.plan || ""),
            tools: Array.isArray(body.tools) ? body.tools : [],
            onTrace: (e) => send({ trace: e }),
          });
          // Record the exchange AFTER it happens, and never let a bookkeeping
          // failure swallow a result the person is waiting for.
          if (project && sessionId && r.reason !== "planned") {
            try {
              this.code.projects.appendTurn(project.id, sessionId, { role: "user", content: task });
              if (r.answer) this.code.projects.appendTurn(project.id, sessionId, { role: "assistant", content: r.answer });
              this.code.projects.touch(project.id);
            } catch {
              /* the run stands even if the session could not be written */
            }
          }
          send({ done: true, answer: r.answer, steps: r.steps, reason: r.reason, projectId: project?.id || null, sessionId: sessionId || null });
        } catch (e) {
          send({ done: true, error: String(e.message) });
        }
        return res.end();
      }
      return this._json(res, 404, { ok: false, error: "unknown /core/code route" });
    }


 return this._json(res,404,{ok:false,error:"Unknown plugin operation"});
 }
}
module.exports={Router};
