// After the static build (npm run build:pages): Next writes each page's small "prefetch" files in folders
// (out/login/__next.login/__PAGE__.txt), but the browser asks for them by one flat name with dots
// (out/login/__next.login.__PAGE__.txt). A plain file host (Cloudflare Pages) then answers 404 and the
// console fills with errors. This copies every such file to the flat name the browser uses.
import fs from "node:fs";
import path from "node:path";

const out = path.resolve(process.argv[2] ?? "out");
let copied = 0;

/** Every file under a __next.* folder, as its path parts below that folder. */
function filesUnder(dir, parts = []) {
  const list = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) list.push(...filesUnder(p, [...parts, e.name]));
    else list.push({ file: p, parts: [...parts, e.name] });
  }
  return list;
}

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const p = path.join(dir, e.name);
    if (e.name.startsWith("__next.")) {
      for (const f of filesUnder(p)) {
        const flat = path.join(dir, [e.name, ...f.parts].join("."));
        if (!fs.existsSync(flat)) {
          fs.copyFileSync(f.file, flat);
          copied++;
        }
      }
    } else walk(p);
  }
}

if (!fs.existsSync(out)) {
  console.error(`flatten-segments: ${out} not found`);
  process.exit(1);
}
walk(out);
console.log(`flatten-segments: ${copied} prefetch files copied to their flat names`);
