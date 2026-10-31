"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const app=fs.readFileSync(path.join(__dirname,"../plugin/app.js"),"utf8"),flush=()=>new Promise(resolve=>setImmediate(resolve));
test("project removal waits for a styled review and Cancel leaves the project selected",async()=>{
 const elements=new Map(),requests=[],reviews=[];let resolveReview;
 const element=()=>({value:"",textContent:"",innerHTML:"",hidden:false,dataset:{},style:{},children:[],handlers:new Map(),addEventListener(name,fn){this.handlers.set(name,fn);},appendChild(child){this.children.push(child);return child;},append(){},querySelectorAll(){return[];},querySelector(){return element();},classList:{toggle(){},add(){},remove(){}},focus(){},setAttribute(){}});
 const get=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 const window={kai:{dialogs:{confirm(message){reviews.push(message);return new Promise(resolve=>{resolveReview=resolve;});}}}};
 const context=vm.createContext({window,document:{getElementById:get,createElement:element,querySelectorAll:()=>[]},fetch:async(url,options={})=>{requests.push({url,options});return{ok:true,json:async()=>({ok:true,projects:[]})};},console,setTimeout,clearTimeout,URL,TextDecoder,TextEncoder,localStorage:{getItem:()=>null},KaiI18n:{setText:(el,text)=>{el.textContent=text;},message:(s,...v)=>String.raw({raw:s},...v)}});
 // Expose renderer state only inside this test fixture; execute its real event handler.
 vm.runInContext(app.replace("window.KaiCode = { render };","window.KaiCode = { render }; window.fixtureState = kc;"),context);
 const state=window.fixtureState;state.projects=[{id:"project1",name:"My project"}];state.projectId="project1";
 const run=get("btn-kc-forget").handlers.get("click");
 const cancelled=run();await flush();assert.equal(reviews.length,1);assert.equal(requests.length,0);resolveReview(false);await cancelled;
 assert.equal(requests.length,0);assert.equal(state.projectId,"project1");
 const approved=run();await flush();assert.equal(requests.length,0);resolveReview(true);await approved;
 assert.equal(requests.filter(r=>r.options.method==="DELETE").length,1);assert.equal(requests[0].url,"/core/code/projects/project1");assert.equal(state.projectId,null);
});
