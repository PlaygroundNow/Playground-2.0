#!/usr/bin/env -S deno run -A

/**
 * playground.ts
 * Usage: deno run -A playground.ts <automergeUrl>
 *
 * Writes: ./.playground-sync/<doc.name>/<key>.html
 * Watches: local *.html saves -> pushes into Automerge via updateText
 */

// std
import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

import {
  Automerge,
  Repo,
  initializeWasm,
} from "https://esm.sh/@automerge/automerge-repo@2.5.1/slim?bundle-deps";
import { NodeFSStorageAdapter } from "https://esm.sh/@automerge/automerge-repo-storage-nodefs";
import { WebSocketClientAdapter } from "https://esm.sh/@automerge/automerge-repo-network-websocket@2.5.1?bundle-deps";

await initializeWasm(
  fetch("https://esm.sh/@automerge/automerge@3.2.1/dist/automerge.wasm")
    .then((resp) => resp.arrayBuffer())
    .then((arr) => new Uint8Array(arr))
);

const docUrl = Deno.args[0];
if (!docUrl) {
  console.error("Usage: playground <automergeUrl>");
  Deno.exit(1);
}

async function findWithBackoff(id: any, maxRetries = 3, delay = 300) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await repo.find(id);
    } catch (e) {
      console.log(e);
      if (attempt === maxRetries) throw e;
      await new Promise((res) => setTimeout(res, delay * Math.pow(2, attempt)));
    }
    attempt++;
  }
  throw new Error(`Failed to find document with id: ${id}`);
}

const ws = new WebSocketClientAdapter("wss://sync.playground.now");

console.log(
  ws.socket
    ?.on("message", (data) => {
      console.log(data);
    })
    .on("error", (code, reason) => {
      console.log(code, reason);
    })
);

const repo = new Repo({
  storage: new NodeFSStorageAdapter(),
  network: [ws],
});

type DocShape = { name: string; [k: string]: any };

const baseDir = path.resolve(".playground-sync");

const handle = await findWithBackoff(docUrl);

function isTextKey(doc: DocShape, key: string) {
  return key !== "name" && typeof doc[key] === "string";
}

async function writeAll() {
  const doc = handle.doc() as DocShape;
  if (!doc?.name) throw new Error("Doc has no name");

  const folder = doc.name;
  const outDir = path.join(baseDir, folder);
  await ensureDir(outDir);

  for (const key of Object.keys(doc)) {
    if (!isTextKey(doc, key)) continue;
    await Deno.writeTextFile(path.join(outDir, `${key}.html`), doc[key] ?? "");
  }

  return outDir;
}

async function main() {
  const outDir = await writeAll();

  console.log(`Synced to: ${outDir}`);
  console.log("Watching for .html changes…");

  const watcher = Deno.watchFs(outDir, { recursive: false });

  for await (const ev of watcher) {
    if (ev.kind !== "modify" && ev.kind !== "create") continue;

    for (const filePath of ev.paths) {
      if (!filePath.endsWith(".html")) continue;

      const key = path.basename(filePath).replace(/\.html$/i, "");
      const newValue = await Deno.readTextFile(filePath);

      console.log(newValue);

      await handle.change((doc: any) => {
        Automerge.updateText(doc, [key], newValue);
      });
    }
  }
}

if (import.meta.main) main();
