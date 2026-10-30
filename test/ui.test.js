"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const html = fs.readFileSync(path.join(__dirname, "../plugin/index.html"), "utf8"), source = fs.readFileSync(path.join(__dirname, "../plugin/app.js"), "utf8");
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
function fixture(overrides = {}) {
  const elements = new Map(), calls = [];
  function element(id) { return { id, textContent: "", innerHTML: "", value: "", dataset: {}, hidden: false, disabled: false, options: id === "model" ? [{}] : [],
    append(option) { this.options.push(option); }, set selectedIndex(index) { this.value = this.options[index]?.value || ""; }, classList: { add() {}, remove() {}, toggle() {} }, scrollIntoView() {}, replaceChildren() { this.innerHTML = ""; }, insertAdjacentHTML(_where, value) { this.innerHTML += value; } }; }
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, element(id));
  const defaults = {
    "code.projects": { projects: [{ id: "old", name: "Existing <script>project</script>", sessions: 1 }] },
    "models.list": [{ alias: "local", label: "Installed local model", status: "ready" }],
    "code.choose": { handle: "grant", project: { id: "old", name: "Project" } },
    "code.browse": { path: "", entries: [{ name: "app.js", path: "app.js", kind: "file" }] },
    "code.sessions": { sessions: [] }, "code.read": { path: "app.js", content: "old code", hash: "hash1", size: 8 },
    "code.stage": { id: "proposal", path: "app.js", summary: "Manual change", diff: "-old code\n+new code", content: "new code" },
    "code.propose": { id: "proposal", path: "app.js", summary: "AI change", diff: "-old code\n+new code", content: "new code" },
    "code.apply": { applied: true, path: "app.js" }, "code.revoke": { revoked: true },
  };
  const context = vm.createContext({ console, window: { kai: { async call(method, input) { calls.push({ method, input }); if (Object.hasOwn(overrides, method)) return typeof overrides[method] === "function" ? overrides[method](input) : overrides[method]; return defaults[method]; } } },
    document: { getElementById(id) { assert.ok(elements.has(id), `Missing UI element ${id}`); return elements.get(id); }, querySelectorAll() { return []; }, createElement: tag => element(tag) } });
  vm.runInContext(source, context); return { calls, defaults, $: id => elements.get(id), async click(id) { await elements.get(id).onclick(); await flush(); }, async openFile() { await this.click("choose"); elements.get("files").onclick({ target: { closest: () => ({ dataset: { file: "app.js", kind: "file" } }) } }); await flush(); } };
}
test("startup preserves saved projects and does not grant filesystem access", async () => { const f = fixture(); await flush(); assert.deepEqual(f.calls.map(c => c.method), ["code.projects", "models.list"]); assert.match(f.$("projects").innerHTML, /&lt;script&gt;/); assert.doesNotMatch(f.$("projects").innerHTML, /<script>/); });
test("native project selection precedes file browsing and reading", async () => { const f = fixture(); await flush(); await f.openFile(); const calls = f.calls.map(c => c.method); assert.ok(calls.indexOf("code.choose") < calls.indexOf("code.browse")); assert.equal(f.$("editor").value, "old code"); assert.equal(f.calls.find(c => c.method === "code.read").input.handle, "grant"); });
test("manual edits are staged before apply and exact proposal ID is used", async () => { const f = fixture(); await flush(); await f.openFile(); f.$("editor").value = "new code"; f.$("editor").oninput(); await f.click("stage"); assert.equal(f.calls.find(c => c.method === "code.stage").input.hash, "hash1"); assert.equal(f.$("proposal").hidden, false); assert.ok(!f.calls.some(c => c.method === "code.apply")); await f.click("apply"); assert.equal(f.calls.find(c => c.method === "code.apply").input.proposalId, "proposal"); assert.match(f.$("notice").textContent, /Applied/); });
test("declined apply never claims the file changed", async () => { const f = fixture({ "code.apply": { applied: false, reason: "declined" } }); await flush(); await f.openFile(); f.$("editor").value = "new code"; await f.click("stage"); await f.click("apply"); assert.match(f.$("notice").textContent, /Nothing was written/); });
test("AI does not silently discard an unsaved manual draft", async () => { const f = fixture(); await flush(); await f.openFile(); f.$("editor").value = "unsaved"; f.$("instruction").value = "change it"; await f.click("suggest"); assert.ok(!f.calls.some(c => c.method === "code.propose")); assert.match(f.$("notice").textContent, /manual edits/); });
test("changing the instruction while inference runs rejects the stale proposal", async () => {
  let resolve; const f = fixture({ "code.propose": () => new Promise(r => { resolve = r; }) }); await flush(); await f.openFile(); f.$("instruction").value = "first change"; const running = f.$("suggest").onclick(); await flush();
  f.$("instruction").value = "new change"; f.$("instruction").oninput(); resolve(f.defaults["code.propose"]); await running; await flush();
  assert.match(f.$("notice").textContent, /instruction changed/); assert.ok(!f.calls.some(c => c.method === "code.apply"));
});
test("closing a project clears code and revokes its handle", async () => { const f = fixture(); await flush(); await f.openFile(); await f.click("revoke"); assert.equal(f.calls.find(c => c.method === "code.revoke").input.handle, "grant"); assert.equal(f.$("editor").value, ""); assert.equal(f.$("editor-area").hidden, true); });
