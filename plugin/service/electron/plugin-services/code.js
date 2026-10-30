"use strict";
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
// Code-owned project grant validation.
const blockedPart = name => [".git", ".ssh", ".aws", ".azure", ".config", "node_modules", "__pycache__", ".npmrc", ".pypirc", "id_rsa", "id_ed25519", "wallet.json", "companion-hub.json", "account.cfg"].includes(name.toLowerCase()) || /^\.env(?:\.|$)/i.test(name) && !/^\.env\.(example|sample|template)$/i.test(name) || /\.(pem|key|p12|pfx|keystore)$/i.test(name);
const within = (root, target) => target === root || target.startsWith(root + path.sep);
function projectRoot(raw, dataDir, protectedRoots = []) {
  const dir = fs.realpathSync(raw), st = fs.lstatSync(dir);
  if (!st.isDirectory() || dir === path.parse(dir).root || dir === os.homedir()) throw Error("Choose a specific project folder, not your home folder or entire drive");
  if (dir.split(path.sep).some(blockedPart)) throw Error("Private credential folders cannot be coding projects");
  const sensitive = [path.resolve(dataDir), path.dirname(path.resolve(dataDir)), ...protectedRoots.filter(root => typeof root === "string").map(root => path.resolve(root))].map(p => { try { return fs.realpathSync(p); } catch { return p; } });
  if (sensitive.some(p => within(p, dir) || within(dir, p))) throw Error("KAI profile and private account folders cannot be coding projects");
  return { dir, dev: st.dev, ino: st.ino };
}
module.exports={projectRoot};
