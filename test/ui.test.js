"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),fixture=require("./bridge-fixture");
const root=path.join(__dirname,"../plugin"),source=fs.readFileSync(path.join(root,"bridge.js"),"utf8"),html=fs.readFileSync(path.join(root,"index.html"),"utf8"),app=fs.readFileSync(path.join(root,"app.js"),"utf8");
test("full original workspace has project, conversation, Git, approval and model controls",()=>{for(const id of ["kc-projects","kc-sessions","btn-kc-pick","btn-kc-clone","btn-kc-gh","btn-kc-branch","btn-kc-commit","btn-kc-push","btn-kc-pr","kc-plan","kc-model","kc-tools-list","kc-cmd-hints","btn-kc-stop"])assert.ok(html.includes(`id="${id}"`),id);assert.match(app,/function approvalCard/);assert.match(app,/function planCard/);assert.match(app,/function loadTranscript/);assert.match(app,/function loadCommands/);});
test("original requests go only through the named Code broker",async()=>{const f=fixture(source,async(method,input)=>{assert.equal(method,"code.request");return{status:200,body:{ok:true,projects:[]}};});const response=await f.window.fetch("/core/code/projects");assert.deepEqual(await response.json(),{ok:true,projects:[]});assert.equal(f.calls[0].input.path,"/core/code/projects");await assert.rejects(f.window.fetch("https://example.com/core/code/projects"),/Only Koinos Code/);assert.equal(f.calls.length,1);});
test("streaming run events and approval payloads preserve the original protocol",async()=>{let polled=false;const f=fixture(source,async(method,input)=>{if(method==="code.request")return{status:200,streamId:"run1"};if(method==="code.poll"){polled=true;return{chunks:['data: {"trace":{"type":"approval-request","approvalId":"review1"}}\n\n'],done:true};}throw Error(method);});const response=await f.window.fetch("/core/code/run",{method:"POST",body:JSON.stringify({projectId:"p",task:"Change file",mode:"plan"})});assert.match(await response.text(),/approval-request/);assert.ok(polled);assert.equal(f.calls[0].input.stream,true);assert.equal(f.calls[0].input.body.mode,"plan");});
test("cancelling the response cancels the owned native stream",async()=>{const f=fixture(source,async(method)=>method==="code.request"?{status:200,streamId:"run1"}:method==="code.poll"?{chunks:[],done:false}:{cancelled:true});const response=await f.window.fetch("/core/code/run",{method:"POST",body:"{}"});await response.body.cancel();assert.ok(f.calls.some(c=>c.method==="code.cancel"&&c.input.streamId==="run1"));});
test("workspace settings survive disposable plugin renderer sessions",()=>{const boot=fs.readFileSync(path.join(root,"boot.js"),"utf8");assert.match(boot,/storage\.get/);assert.match(boot,/storage\.set/);assert.match(boot,/desktop\.preferencesRead/);assert.match(boot,/kai-code-tools/);});

test("a delayed plan continues polling through empty responses and completes", {timeout:4000}, async()=>{
 let polls=0;
 const f=fixture(source,async method=>method==="code.request"?{status:200,streamId:"delayed-plan"}:method==="code.poll"?
  (++polls<=3?{chunks:[],done:false}:{chunks:['data: {"done":true,"reason":"planned","answer":"1. Add index.html"}\n\n'],done:true}):{stopped:true});
 const abort=new AbortController();
 try{const response=await f.window.fetch("/core/code/run",{method:"POST",body:"{}",signal:abort.signal});assert.match(await response.text(),/Add index.html/);assert.equal(polls,4);}finally{abort.abort();}
});
test("Stop cancels a plan while its model has not produced any output", {timeout:4000},async()=>{
 const f=fixture(source,async method=>method==="code.request"?{status:200,streamId:"waiting-plan"}:method==="code.poll"?{chunks:[],done:false}:{stopped:true});
 const abort=new AbortController(),response=await f.window.fetch("/core/code/run",{method:"POST",body:"{}",signal:abort.signal});
 const reading=response.text();await new Promise(resolve=>setTimeout(resolve,200));abort.abort();
 await assert.rejects(reading,/Stopped/);assert.equal(f.calls.filter(c=>c.method==="code.cancel").length,1);
 const count=f.calls.length;await new Promise(resolve=>setTimeout(resolve,200));assert.equal(f.calls.length,count);
});
test("a native failure after empty polls is surfaced and cancels its stream",{timeout:4000},async()=>{
 let polls=0;const f=fixture(source,async method=>method==="code.request"?{status:200,streamId:"failed"}:method==="code.poll"?++polls<3?{chunks:[],done:false}:{chunks:[],error:"Model unavailable",done:true}:{stopped:true});
 const response=await f.window.fetch("/core/code/run",{method:"POST",body:"{}"});await assert.rejects(response.text(),/Model unavailable/);
 assert.ok(f.calls.some(c=>c.method==="code.cancel"));
});
