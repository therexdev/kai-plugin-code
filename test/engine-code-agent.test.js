"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

/*
 * Koinos Code in the app (task #60 v3): the CLI's coding agent hosted by
 * Core, permission gates routed to approval cards. Unit tests drive the
 * runner with a scripted chatFn; the HTTP test runs the REAL stack
 * (createCore + scripted fake llama) and answers an approval card while
 * the SSE response is open.
 */

const { CodeAgent } = require("../plugin/service/core/lib/code-agent");

function tmpProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kai-codeagent-"));
}

/** chatFn that shifts scripted replies and records every request. */
function scriptedChat(replies) {
  const calls = [];
  return {
    calls,
    chatFn: async ({ model, messages }) => {
      calls.push({ model, messages });
      return replies.length ? replies.shift() : '{"answer": true}';
    },
  };
}

test("run validation: missing dir, non-dir, filesystem root, empty task", async () => {
  const agent = new CodeAgent({ chatFn: async () => "" });
  await assert.rejects(() => agent.run({ dir: "/nope/never/here", task: "x" }), /does not exist/);
  const dir = tmpProject();
  const file = path.join(dir, "f.txt");
  fs.writeFileSync(file, "x");
  await assert.rejects(() => agent.run({ dir: file, task: "x" }), /not a directory/);
  await assert.rejects(() => agent.run({ dir: path.parse(dir).root, task: "x" }), /filesystem root/);
  await assert.rejects(() => agent.run({ dir, task: "  " }), /give the agent a task/);
});

test("a write pauses on an approval card; approve -> the file lands; the card carries the diff", async () => {
  const dir = tmpProject();
  const { chatFn } = scriptedChat([
    '{"tool": "write_file", "args": {"path": "note.txt", "content": "hello panel\\n"}}',
    "Created the note.",
  ]);
  const agent = new CodeAgent({ chatFn });
  const traces = [];
  const done = agent.run({
    dir,
    task: "make a note",
    onTrace: (e) => {
      traces.push(e);
      if (e.type === "approval-request") {
        assert.strictEqual(e.kind, "edit");
        assert.strictEqual(e.path, "note.txt");
        assert.match(e.diff, /\+ hello panel/);
        assert.strictEqual(agent.provideApproval(e.approvalId, true), true);
      }
    },
  });
  const r = await done;
  assert.strictEqual(r.reason, "answered");
  assert.strictEqual(r.answer, "Created the note.");
  assert.strictEqual(fs.readFileSync(path.join(dir, "note.txt"), "utf8"), "hello panel\n");
  assert.ok(traces.some((e) => e.type === "start" && e.runId), "start event named the run");
  assert.ok(traces.some((e) => e.type === "tool" && e.name === "write_file"), "tool trace streamed");
});

test("decline leaves the disk untouched and the model is told honestly", async () => {
  const dir = tmpProject();
  const { calls, chatFn } = scriptedChat([
    '{"tool": "write_file", "args": {"path": "no.txt", "content": "nope"}}',
    "Understood, not writing.",
  ]);
  const agent = new CodeAgent({ chatFn });
  const r = await agent.run({
    dir,
    task: "try a write",
    onTrace: (e) => {
      if (e.type === "approval-request") agent.provideApproval(e.approvalId, false);
    },
  });
  assert.strictEqual(r.answer, "Understood, not writing.");
  assert.strictEqual(fs.existsSync(path.join(dir, "no.txt")), false);
  const obsTurn = JSON.stringify(calls[1].messages);
  assert.match(obsTurn, /declined this in the app/, "the refusal became the observation");
});

test("an unanswered card times out as a decline — the run continues, nothing written", async () => {
  const dir = tmpProject();
  const { calls, chatFn } = scriptedChat([
    '{"tool": "write_file", "args": {"path": "slow.txt", "content": "zzz"}}',
    "Gave up on the write.",
  ]);
  const agent = new CodeAgent({ chatFn, approvalTimeoutMs: 40 });
  const r = await agent.run({ dir, task: "write something" });
  assert.strictEqual(r.reason, "answered");
  assert.strictEqual(fs.existsSync(path.join(dir, "slow.txt")), false);
  assert.match(JSON.stringify(calls[1].messages), /approval timed out/);
});

test("stop while blocked on a card ends the run; the stale card answers 404-style false", async () => {
  const dir = tmpProject();
  const { chatFn } = scriptedChat(['{"tool": "run_cmd", "args": {"cmd": "echo hi"}}']);
  const agent = new CodeAgent({ chatFn });
  let staleId = null;
  const done = agent.run({
    dir,
    task: "run a command",
    onTrace: (e) => {
      if (e.type === "approval-request") {
        staleId = e.approvalId;
        assert.strictEqual(e.kind, "command");
        assert.strictEqual(agent.stop(e.runId), true);
      }
    },
  });
  const r = await done;
  assert.strictEqual(r.reason, "stopped");
  assert.strictEqual(agent.provideApproval(staleId, true), false, "the card died with the run");
});

test("an approved command runs in the project directory", async () => {
  const dir = tmpProject();
  const { calls, chatFn } = scriptedChat([
    '{"tool": "run_cmd", "args": {"cmd": "echo made > marker.txt"}}',
    "Marker created.",
  ]);
  const agent = new CodeAgent({ chatFn });
  const r = await agent.run({
    dir,
    task: "make a marker",
    onTrace: (e) => {
      if (e.type === "approval-request") agent.provideApproval(e.approvalId, true);
    },
  });
  assert.strictEqual(r.answer, "Marker created.");
  assert.strictEqual(fs.existsSync(path.join(dir, "marker.txt")), true);
  assert.match(JSON.stringify(calls[1].messages), /exit 0/);
});

test("KOINOS.md project notes ride the system prompt here too", async () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, "KOINOS.md"), "PANEL-RULE-MARKER: prefer small diffs.");
  const { calls, chatFn } = scriptedChat(["Noted."]);
  const agent = new CodeAgent({ chatFn });
  await agent.run({ dir, task: "what are the rules?" });
  assert.match(calls[0].messages[0].content, /PANEL-RULE-MARKER/);
  assert.match(calls[0].messages[0].content, /Project notes from KOINOS\.md/);
});

