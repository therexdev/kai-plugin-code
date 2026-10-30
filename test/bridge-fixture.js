"use strict";
const vm=require("node:vm"),fs=require("node:fs"),path=require("node:path");
module.exports=function fixture(source,responder){const calls=[];const window={kai:{call:async(method,input)=>{calls.push({method,input});return responder(method,input);}}};const context=vm.createContext({window,document:{getElementById:()=>null},Response,ReadableStream,TextEncoder,TextDecoder,DOMException,AbortController,console,setTimeout,clearTimeout});vm.runInContext(source,context);return{calls,window,context};};
