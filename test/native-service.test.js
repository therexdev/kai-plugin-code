"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),fixture=require("./native-fixture"),{create}=require("../plugin/service");
test("Code owns projects, sessions, plan execution and native-reviewed edits without Core modules",async()=>{
 const replies=['{"tool":"write_file","args":{"path":"note.txt","content":"owned by code"}}','Created the note.'];const f=fixture("code",{chat:async()=>({choices:[{message:{content:replies.shift()||"Done."}}]})}),s=create(f.api);const projectDir=path.join(f.root,"project");fs.mkdirSync(projectDir);
 try{const added=await f.request(s,"/core/code/projects",{dir:projectDir});assert.equal(added.status,200);const id=added.body.project.id;
 const run=await f.request(s,"/core/code/run",{projectId:id,model:"local",task:"Create note"});assert.ok(run.streamId);
 const text=await fixture.drain(s,"code",run.streamId,async frame=>{if(frame.trace?.type==="approval-request"){assert.equal(fs.existsSync(path.join(projectDir,"note.txt")),false);const r=await f.request(s,"/core/code/approve",{approvalId:frame.trace.approvalId,approved:true});assert.equal(r.body.ok,true);}});
 assert.match(text,/Created the note/);assert.equal(fs.readFileSync(path.join(projectDir,"note.txt"),"utf8"),"owned by code");assert.ok(f.reviews.some(r=>r.title==="Approve coding action?"));
 const list=await f.request(s,`/core/code/projects/${id}/sessions`);assert.equal(list.body.sessions.length,1);assert.ok(fs.existsSync(path.join(f.dataDir,"code-projects.json")));assert.ok(!fs.existsSync(path.join(f.root,"code-projects.json")));
 }finally{await s.dispose();f.cleanup();}
});
test("Code cannot run a project with a network model or an uninstalled optional tool provider",async()=>{const f=fixture("code"),s=create(f.api),dir=path.join(f.root,"project");fs.mkdirSync(dir);try{const id=(await f.request(s,"/core/code/projects",{dir})).body.project.id;await assert.rejects(f.request(s,"/core/code/run",{projectId:id,model:"koinos-network:x",task:"Read source"}),/installed local model/);await assert.rejects(f.request(s,"/core/code/run",{projectId:id,model:"local",task:"Read source",tools:["x"]}),/Install and enable KAI Tools/);}finally{await s.dispose();f.cleanup();}});
test("Code preserves unreadable storage and refuses startup instead of recreating it",()=>{const f=fixture("code"),file=path.join(f.dataDir,"code-projects.json");fs.writeFileSync(file,"broken");assert.throws(()=>create(f.api));assert.equal(fs.readFileSync(file,"utf8"),"broken");f.cleanup();});
test("disabling Code revokes all subsequent renderer calls",async()=>{const f=fixture("code"),s=create(f.api);await s.dispose();await assert.rejects(Promise.resolve().then(()=>f.request(s,"/core/code/projects")),/stopped/);f.cleanup();});
test("Core-declared private profile roots cannot be selected as coding projects",async()=>{const f=fixture("code"),privateRoot=path.join(f.root,"foundation-profile"),wallet=path.join(privateRoot,"wallet");fs.mkdirSync(wallet,{recursive:true});f.api.paths={protected:[privateRoot]};const s=create(f.api);try{await assert.rejects(f.request(s,"/core/code/projects",{dir:wallet}),/profile and private/);await assert.rejects(f.request(s,"/core/code/projects",{dir:privateRoot}),/profile and private/);assert.equal(f.reviews.length,0);}finally{await s.dispose();f.cleanup();}});

test("the real Code service and renderer bridge finish a delayed plan after empty polls",{timeout:6000},async()=>{
 const bridgeFixture=require("./bridge-fixture"),source=fs.readFileSync(path.join(__dirname,"../plugin/bridge.js"),"utf8");
 const f=fixture("code",{chat:async()=>{await new Promise(resolve=>setTimeout(resolve,650));return {choices:[{message:{content:"1. Add index.html with a calculator."}}]};}}),s=create(f.api),dir=path.join(f.root,"project");fs.mkdirSync(dir);
 const bridge=bridgeFixture(source,(method,input)=>s.call(method,input));
 try{
  const project=(await f.request(s,"/core/code/projects",{dir})).body.project;
  const response=await bridge.window.fetch("/core/code/run",{method:"POST",body:JSON.stringify({projectId:project.id,model:"local",task:"Write a calculator application in HTML",mode:"plan"})});
  const text=await response.text();assert.match(text,/Preparing the plan/);assert.match(text,/Add index.html/);assert.match(text,/"reason":"planned"/);
  assert.ok(bridge.calls.filter(c=>c.method==="code.poll").length>=4);
  assert.deepEqual(fs.readdirSync(dir),[],"planning must not write project files");
 }finally{await s.dispose();f.cleanup();}
});
