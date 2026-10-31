"use strict";
// A transport adapter for the unchanged original workspace. Every operation
// crosses its named, publisher-pinned broker; no renderer network access exists.
const $ = id => document.getElementById(id);
const state = { alias: "" };
let pickable = [];
const esc2 = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const call = (method, input) => window.kai.call(method, input);
async function pluginResponse(feature, result, signal) {
  if (signal?.aborted) { if(result.streamId) await call(feature + ".cancel", {streamId: result.streamId}).catch(()=>{}); throw new DOMException("Stopped", "AbortError"); }
  if (!result.streamId) return new Response(typeof result.body === "string" ? result.body : JSON.stringify(result.body ?? {}), {status: result.status || 200, headers: result.headers || {"content-type":"application/json"}});
  let stopped = false, controller;
  const cancel = async () => { if (stopped) return; stopped = true; signal?.removeEventListener("abort", abort); await call(feature + ".cancel", {streamId:result.streamId}).catch(()=>{}); };
  const abort = () => { void cancel(); try { controller?.error(new DOMException("Stopped", "AbortError")); } catch {} };
  const body = new ReadableStream({
    start(c) { controller = c; signal?.addEventListener("abort", abort, {once:true}); if(signal?.aborted) abort(); },
    async pull(c) {
      try {
        // Keep satisfying this read across empty native polls. Returning with
        // no chunk can leave ReadableStream waiting forever for another pull.
        while (!stopped) {
          const next=await call(feature+".poll",{streamId:result.streamId});
          if(stopped)return;
          for(const text of next.chunks||[])c.enqueue(new TextEncoder().encode(text));
          if(next.error)throw Error(next.error);
          if(next.done){stopped=true;signal?.removeEventListener("abort",abort);c.close();return;}
          if(next.chunks?.length)return;
          await new Promise(resolve=>setTimeout(resolve,150));
        }
      } catch(error){if(!stopped){await cancel();c.error(error);}}
    },
    cancel
  });
  return new Response(body,{status:result.status||200,headers:result.headers||{"content-type":"text/event-stream"}});
}
async function* sseDeltas(body) {
  const decoder=new TextDecoder();let buffer="";
  for await(const chunk of body){buffer+=decoder.decode(chunk,{stream:true});let end;
    while((end=buffer.indexOf("\n\n"))>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);
      for(const line of frame.split("\n")){if(!line.startsWith("data: "))continue;const value=line.slice(6).trim();if(value==="[DONE]")return;
        try{const event=JSON.parse(value);if(event.error)throw Error(event.error.message||event.error);yield{content:event.choices?.[0]?.delta?.content||"",model:event.model||null};}catch(error){if(error.name!=="SyntaxError")throw error;}
      }
    }
  }
}

window.fetch = async (path, options = {}) => {
  if(typeof path!=="string"||!path.startsWith("/core/"))throw Error("Only Koinos Code workspace requests are supported");
  options.signal?.throwIfAborted();
  const body=options.body?JSON.parse(options.body):undefined;
  const result=await call("code.request",{path,method:options.method||"GET",body,stream:path==="/core/code/run"});
  if (path === "/core/models" && result.body && typeof result.body === "object") {
    const ready=(result.body.aliases||[]).filter(model=>model.status==="ready"), active=result.body.runtime?.activeAlias;
    state.alias=ready.some(model=>model.alias===active)?active:ready.some(model=>model.alias===state.alias)?state.alias:ready[0]?.alias||"";
  }
  return pluginResponse("code",result,options.signal);
};
window.koinosShell = { pickFolder: title => call("code.chooseFolder", {title}) };
