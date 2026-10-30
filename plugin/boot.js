"use strict";
(async () => {
  const keys = ["kai-code-tools", "kai-code-dir", "kai-interface-language"], originalSet = Storage.prototype.setItem;
  let saved = await call("storage.get", {key:"workspace-preferences"});
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = await call("desktop.preferencesRead", {keys});
  const preferences = Object.fromEntries(keys.filter(key => typeof saved?.[key] === "string").map(key => [key,saved[key]]));
  for (const [key,value] of Object.entries(preferences)) originalSet.call(localStorage,key,value);
  let pending = Promise.resolve();
  Storage.prototype.setItem = function(key,value) {
    originalSet.call(this,key,value);
    if (this === localStorage && keys.includes(key)) { preferences[key]=String(value);const snapshot={...preferences};pending=pending.catch(()=>{}).then(()=>call("storage.set",{key:"workspace-preferences",value:snapshot})).catch(error=>{const el=document.getElementById("kc-status");if(el)el.textContent="Could not save workspace preference: "+error.message;}); }
  };
  if (preferences["kai-interface-language"]) KaiI18n.setLanguage(preferences["kai-interface-language"]);
  await call("storage.set", {key:"workspace-preferences",value:preferences});
  await window.KaiCode.render();
})().catch(error => {const el=document.getElementById("kc-start-error");el.textContent=error.message;el.hidden=false;});
