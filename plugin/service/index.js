"use strict";
const fs=require("node:fs"),path=require("node:path");
const {createTransport,execution}=require("./transport");
const {Router}=require("./router");
function create(api) {
 const dataDir=api.plugin.dataDir;fs.mkdirSync(dataDir,{recursive:true});
 const models={aliases:()=>api.models.list(),resolveAlias:alias=>{const model=api.models.list().find(row=>row.alias===alias);if(!model)throw Error("Unknown installed model");return model;}};
 const network={status:()=>api.network.status()},runtime={status:()=>api.runtime?.status?.()||{}};
 let toolList=[];
 const registry={list:()=>toolList,call:(name,args,options)=>api.services.call("kai.tools","call",{name,args,confirmed:options?.confirmed===true},{signal:options?.signal||execution.getStore()?.signal})};
 const code=new(require("./core/lib/code-agent").CodeAgent)({registry,chatFn:async({model,messages,maxTokens,signal})=>{
  const current=signal||execution.getStore()?.signal;current?.throwIfAborted();
  const result=await api.models.chat({model,messages,max_tokens:maxTokens,stream:false,kai_private_desktop:true},current);
  current?.throwIfAborted();return result.choices?.[0]?.message?.content||result.text||"";
 }});
 const file=path.join(dataDir,"code-projects.json");
 if(fs.existsSync(file)){const stat=fs.lstatSync(file);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>10*1024*1024)throw Error("Code projects storage needs recovery");const saved=JSON.parse(fs.readFileSync(file,"utf8"));if(!Array.isArray(saved))throw Error("Invalid Code projects storage");}
 code.projects=new(require("./core/lib/code-projects").CodeProjects)(dataDir);
 code.github=new(require("./core/lib/github").GitHub)(dataDir,api.secrets);
 let enabled=api.settings.get("workspace.enabled",true)!==false;
 code.switch={status:()=>({enabled}),configure:value=>{enabled=value.enabled===true;api.settings.set("workspace.enabled",enabled);return {enabled};}};
 code._pluginApprovals=new Map();const ask=code._ask.bind(code),approve=code.provideApproval.bind(code);
 code._ask=(runId,detail,trace)=>ask(runId,detail,entry=>{code._pluginApprovals.set(entry.approvalId,structuredClone(entry));trace(entry);});
 code.provideApproval=(id,allowed)=>{const result=approve(id,allowed);code._pluginApprovals.delete(id);return result;};
 const environment={models,runtime,settings:api.settings,gateway:{code,models,runtime,network}};
 const router=new Router({code,models,runtime,network,track:obj=>{const runId=obj.trace?.runId||obj.runId;if(runId)execution.getStore()?.record.runs.add(runId);}});
 const transport=createTransport({signal:api.signal,route:(req,res)=>router.route(req,res),onStop:record=>{for(const id of record.runs)code.stop(id);}});
 const electron=()=>require("electron");
 const ctx={dataDir,protectedPaths:api.paths?.protected||[],environment,get electron(){return electron();},getWindow:()=>electron().BrowserWindow.fromId(api.desktop.hostWindowId()),confirm:(title,detail)=>api.desktop.confirm(title,detail),
  ensure:async()=>environment.gateway,
  async request(_feature,input,signal){
   if(input.path==="/core/code/tools"||input.path==="/core/code/run"){
    try{const result=await api.services.call("kai.tools","list",{}, {signal});toolList=Array.isArray(result)?result:result.tools||[];}
    catch(error){if(input.path==="/core/code/run"&&input.body?.tools?.length)throw Error("Install and enable KAI Tools to use project tools. "+error.message);toolList=[];}
   }
   if(input.path==="/core/code/approve"&&input.body?.approved===true){const id=String(input.body.approvalId||""),detail=code._pluginApprovals.get(id);if(!detail||!code._pending.has(id))throw Error("Coding approval expired");if(!await api.desktop.confirm("Approve coding action?",JSON.stringify(detail,null,2)))throw Error("Coding action cancelled");signal?.throwIfAborted();if(!code._pending.has(id))throw Error("Coding approval expired");}
   return transport.request(input,signal);
  },poll:(_feature,id,signal)=>transport.poll(id,signal),cancel:(_feature,id)=>transport.cancel(id),release:async()=>{for(const id of code._runs.keys())code.stop(id);await transport.dispose();}
 };
 const workspace=require("./electron/plugin-services/code-workspace").create(ctx);
 let closed=false;
 const service={
  call(method,input={},signal){if(closed)throw Error("Code is stopped");api.signal?.throwIfAborted();signal?.throwIfAborted();if(method==="desktop.preferencesRead")return Object.fromEntries((input.keys||[]).map(key=>[key,api.settings.get("ui."+key,null)]).filter(([,value])=>value!==null));return workspace.call(method,input,signal);},
  async dispose(){closed=true;unprovide?.();await workspace.dispose();},
 };
 const unprovide=api.services.provide("kai.code",{methods:["projects"],call:()=>({projects:code.projects.list().map(({id,name,missing})=>({id,name,missing}))})});
 return service;
}
module.exports={create};
