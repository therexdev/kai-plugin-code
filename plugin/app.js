"use strict";
(() => {
  const $ = id => document.getElementById(id), api = (method, input) => window.kai.call(method, input);
  let grant = null, selected = null, proposal = null, directory = "", revision = 0, pending = false;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const notify = (message, error = false) => { $("notice").textContent = message; $("notice").hidden = false; $("notice").classList.toggle("error", error); };
  function status(message) { $("status").textContent = message; }
  async function run(fn) {
    if (pending) return; pending = true;
    document.querySelectorAll("button").forEach(b => { b.dataset.wasDisabled = String(b.disabled); b.disabled = true; });
    try { await fn(); } catch (error) { notify(error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ""), true); status("Action stopped · no automatic retry"); }
    finally { pending = false; document.querySelectorAll("button").forEach(b => { b.disabled = b.dataset.wasDisabled === "true"; delete b.dataset.wasDisabled; }); update(); }
  }
  function update() { $("reload").disabled = !selected; $("up").disabled = !grant || !directory; $("revoke").hidden = !grant; $("suggest").disabled = !selected || !$("model").value; $("apply").disabled = !proposal; }
  async function projects() {
    const result = await api("code.projects");
    $("projects").innerHTML = result.projects.length ? result.projects.map(p => `<button class="project ${grant?.project.id === p.id ? "selected" : ""}" data-project="${esc(p.id)}" ${p.missing ? "disabled" : ""}><strong>${esc(p.name)}</strong><small>${p.missing ? "Folder unavailable" : `${p.sessions} saved sessions`}</small></button>`).join("") : '<p class="muted">No projects yet. Open a folder to get started.</p>';
  }
  async function browse(relative = "") {
    if (!grant) return; const result = await api("code.browse", { handle: grant.handle, path: relative }); directory = result.path;
    $("directory").textContent = directory || grant.project.name;
    $("files").innerHTML = result.entries.length ? result.entries.map(f => `<button class="file ${selected?.path === f.path ? "selected" : ""}" data-file="${esc(f.path)}" data-kind="${f.kind}"><span class="file-icon">${f.kind === "directory" ? "▸" : "·"}</span><span>${esc(f.name)}</span></button>`).join("") : '<p class="muted">No supported files in this folder.</p>';
    if (result.truncated) $("files").insertAdjacentHTML("beforeend", '<p class="muted">Showing the first 500 entries.</p>'); update();
  }
  async function sessions() {
    if (!grant) { $("sessions").replaceChildren(); return; }
    const result = await api("code.sessions", { handle: grant.handle });
    $("sessions").innerHTML = result.sessions.length ? result.sessions.slice(0, 20).map(s => `<button class="project" data-session="${esc(s.id)}"><strong>${esc(s.title)}</strong><small>${s.turns} messages</small></button>`).join("") : '<p class="muted">Your coding suggestions will appear here.</p>';
  }
  function clearProposal() { proposal = null; $("proposal").hidden = true; $("diff").textContent = ""; $("result").textContent = ""; }
  async function openGrant(result) {
    if (result.cancelled) return; if (grant) await api("code.revoke", { handle: grant.handle });
    grant = result; selected = null; revision++; clearProposal(); $("empty").hidden = false; $("editor-area").hidden = true; $("history").hidden = true;
    $("filename").textContent = grant.project.name; status(`Project open · ${grant.project.name}`); await projects(); await browse(); await sessions(); update();
  }
  async function readFile(relative) {
    const r = await api("code.read", { handle: grant.handle, path: relative }); selected = r; revision++; clearProposal();
    $("filename").textContent = r.path; $("file-size").textContent = `${r.size.toLocaleString()} bytes`; $("editor").value = r.content;
    $("empty").hidden = true; $("editor-area").hidden = false; status("File loaded · nothing has been changed"); await browse(directory); update();
  }
  function showProposal(result) {
    proposal = result; $("proposal-title").textContent = result.path; $("summary").textContent = result.summary;
    $("diff").textContent = result.diff; $("result").textContent = result.content; $("proposal").hidden = false;
    $("diff").hidden = false; $("result").hidden = true; $("tab-diff").classList.add("active"); $("tab-file").classList.remove("active");
    status("Proposal ready · no file has been changed"); $("proposal").scrollIntoView({ block: "start", behavior: "auto" }); update();
  }
  $("choose").onclick = () => run(async () => openGrant(await api("code.choose")));
  $("projects").onclick = e => { const b = e.target.closest("[data-project]"); if (b) void run(async () => openGrant(await api("code.open", { projectId: b.dataset.project }))); };
  $("files").onclick = e => { const b = e.target.closest("[data-file]"); if (b) void run(() => b.dataset.kind === "directory" ? browse(b.dataset.file) : readFile(b.dataset.file)); };
  $("up").onclick = () => run(() => browse(directory.split("/").slice(0, -1).join("/")));
  $("reload").onclick = () => run(() => readFile(selected.path));
  $("editor").oninput = () => { revision++; clearProposal(); status("Draft edited · file on disk is unchanged"); };
  $("instruction").oninput = () => { revision++; };
  $("model").onchange = update;
  $("stage").onclick = () => run(async () => showProposal(await api("code.stage", { handle: grant.handle, path: selected.path, hash: selected.hash, content: $("editor").value })));
  $("suggest").onclick = () => run(async () => {
    if ($("editor").value !== selected.content) throw Error("Review and apply your manual edits, or reload the file, before asking AI for a change.");
    const expected = revision; status("Generating a local suggestion…");
    const result = await api("code.propose", { handle: grant.handle, path: selected.path, hash: selected.hash, model: $("model").value, instruction: $("instruction").value });
    if (revision !== expected) throw Error("Your draft or instruction changed. The returned suggestion was not applied.");
    showProposal(result); await sessions();
  });
  $("discard").onclick = () => { clearProposal(); status("Proposal discarded · no file has been changed"); update(); };
  $("apply").onclick = () => run(async () => {
    const result = await api("code.apply", { proposalId: proposal.id });
    if (!result.applied) { notify("Change kept as a proposal. Nothing was written."); return; }
    const file = result.path; await readFile(file); await sessions(); notify(`Applied your reviewed change to ${file}.`); status("Reviewed change saved");
  });
  $("tab-diff").onclick = () => { $("diff").hidden = false; $("result").hidden = true; $("tab-diff").classList.add("active"); $("tab-file").classList.remove("active"); };
  $("tab-file").onclick = () => { $("diff").hidden = true; $("result").hidden = false; $("tab-file").classList.add("active"); $("tab-diff").classList.remove("active"); };
  $("revoke").onclick = () => run(async () => { await api("code.revoke", { handle: grant.handle }); grant = null; selected = null; revision++; clearProposal(); $("editor").value = ""; $("editor-area").hidden = true; $("empty").hidden = false; $("history").hidden = true; $("files").replaceChildren(); $("directory").textContent = "No project open"; $("filename").textContent = "A clear view of your work"; await projects(); await sessions(); status("Project access closed"); });
  $("sessions").onclick = e => { const b = e.target.closest("[data-session]"); if (b) void run(async () => { const result = await api("code.session", { handle: grant.handle, sessionId: b.dataset.session }); $("history-title").textContent = result.title; $("turns").innerHTML = result.turns.map(t => `<div class="turn"><strong>${esc(t.role)}</strong><p>${esc(t.content)}</p></div>`).join(""); $("history").hidden = false; $("history").scrollIntoView({ block: "start" }); }); };
  $("close-history").onclick = () => { $("history").hidden = true; };
  void run(async () => { await projects(); const models = await api("models.list"); for (const m of models.filter(m => m.status === "ready")) { const option = document.createElement("option"); option.value = m.alias; option.textContent = m.label || m.alias; $("model").append(option); } if ($("model").options.length === 2) $("model").selectedIndex = 1; });
})();
