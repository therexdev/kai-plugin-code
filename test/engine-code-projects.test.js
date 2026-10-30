"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

/*
 * Koinos Code projects + sessions (task #72): the store that turns a one-shot
 * command into a workspace. Unit tests cover the store's rules; the HTTP tests
 * drive the real stack and prove a run through a project becomes a session
 * whose earlier turns actually reach the model on the NEXT run.
 */

const { CodeProjects, validateDir } = require("../plugin/service/core/lib/code-projects");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("a project folder is validated the same way the agent validates its root", () => {
  const dir = tmp("kai-proj-");
  assert.strictEqual(validateDir(dir), fs.realpathSync.native ? path.resolve(dir) : path.resolve(dir));
  assert.throws(() => validateDir(""), /full path/);
  assert.throws(() => validateDir("/definitely/not/here"), /does not exist/);
  const file = path.join(dir, "f.txt");
  fs.writeFileSync(file, "x");
  assert.throws(() => validateDir(file), /file, not a folder/);
  // The most expensive typo available.
  assert.throws(() => validateDir(path.parse(dir).root), /filesystem root/);
});

test("adding the same folder twice returns the project you already have", () => {
  const store = new CodeProjects(tmp("kai-store-"));
  const dir = tmp("kai-p-");
  const a = store.add({ dir, name: "first" });
  const b = store.add({ dir, name: "second" });
  assert.strictEqual(a.id, b.id, "same folder is the same project");
  assert.strictEqual(store.list().length, 1);
  // Re-adding is how people re-find things; it must not be an error.
  assert.strictEqual(store.list()[0].name, "first");
});

test("a project defaults to its folder's name, and can be renamed", () => {
  const store = new CodeProjects(tmp("kai-store-"));
  const dir = tmp("kai-named-");
  const p = store.add({ dir });
  assert.strictEqual(p.name, path.basename(dir));
  assert.strictEqual(store.rename(p.id, "  My App  ").name, "My App");
  assert.throws(() => store.rename(p.id, "   "), /give the project a name/);
  assert.throws(() => store.rename("nope", "x"), /no such project/);
});

test("forgetting a project never touches the folder", () => {
  const store = new CodeProjects(tmp("kai-store-"));
  const dir = tmp("kai-keep-");
  fs.writeFileSync(path.join(dir, "work.txt"), "months of work");
  const p = store.add({ dir });
  assert.strictEqual(store.remove(p.id), true);
  assert.strictEqual(store.list().length, 0);
  assert.strictEqual(fs.readFileSync(path.join(dir, "work.txt"), "utf8"), "months of work");
  assert.strictEqual(store.remove(p.id), false, "removing twice is not an error");
});

test("a folder that moved is flagged, not silently dropped", () => {
  const store = new CodeProjects(tmp("kai-store-"));
  const dir = tmp("kai-gone-");
  const p = store.add({ dir });
  assert.strictEqual(store.list()[0].missing, false);
  fs.rmSync(dir, { recursive: true, force: true });
  const row = store.list()[0];
  assert.strictEqual(row.id, p.id, "still listed");
  assert.strictEqual(row.missing, true, "and honest about why it cannot be used");
});

test("sessions: titled by the first thing asked, newest first, bounded", () => {
  const store = new CodeProjects(tmp("kai-store-"));
  const p = store.add({ dir: tmp("kai-s-") });
  const s = store.newSession(p.id, {});
  assert.strictEqual(s.title, "New session");
  store.appendTurn(p.id, s.id, { role: "user", content: "add a --version flag" });
  store.appendTurn(p.id, s.id, { role: "assistant", content: "done" });
  const list = store.sessions(p.id);
  assert.strictEqual(list[0].title, "add a --version flag");
  assert.strictEqual(list[0].turns, 2);
  assert.throws(() => store.appendTurn(p.id, s.id, { role: "system", content: "x" }), /user or assistant/);
  assert.strictEqual(store.deleteSession(p.id, s.id), true);
  assert.strictEqual(store.sessions(p.id).length, 0);
});

test("history is bounded by BOTH turn count and characters", () => {
  const store = new CodeProjects(tmp("kai-store-"));
  const p = store.add({ dir: tmp("kai-h-") });
  const s = store.newSession(p.id, {});
  for (let i = 0; i < 30; i++) {
    store.appendTurn(p.id, s.id, { role: "user", content: `ask ${i}` });
    store.appendTurn(p.id, s.id, { role: "assistant", content: "y".repeat(500) });
  }
  const h = store.history(p.id, s.id, { maxTurns: 6, maxChars: 800 });
  assert.ok(h.length <= 6, "turn cap holds");
  const chars = h.reduce((n, m) => n + m.content.length, 0);
  assert.ok(chars <= 800, `char cap holds, got ${chars}`);
  // The MOST RECENT turns are what survive — an old thread must not crowd out
  // what was just said.
  assert.match(h[h.length - 1].content, /^y+$/);
  // A session that does not exist is empty, not a throw: history is context,
  // and missing context must never take down a run.
  assert.deepStrictEqual(store.history(p.id, "nope"), []);
});

test("the store survives a restart", () => {
  const dataDir = tmp("kai-store-");
  const dir = tmp("kai-persist-");
  const a = new CodeProjects(dataDir);
  const p = a.add({ dir, name: "keeps" });
  const s = a.newSession(p.id, {});
  a.appendTurn(p.id, s.id, { role: "user", content: "remember me" });

  const b = new CodeProjects(dataDir);
  assert.strictEqual(b.list().length, 1);
  assert.strictEqual(b.list()[0].name, "keeps");
  assert.strictEqual(b.sessions(p.id)[0].title, "remember me");
  assert.deepStrictEqual(b.history(p.id, s.id), [{ role: "user", content: "remember me" }]);
});

