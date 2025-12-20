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

import { Repo, initializeWasm } from "npm:@automerge/automerge-repo@2.5.1/slim";
import { WebSocketClientAdapter } from "npm:@automerge/automerge-repo-network-websocket@2.5.1";
import { NodeFSStorageAdapter } from "npm:@automerge/automerge-repo-storage-nodefs@2.5.1";

await initializeWasm(
  fetch("https://esm.sh/@automerge/automerge@3.2.1/dist/automerge.wasm")
    .then((resp) => resp.arrayBuffer())
    .then((arr) => new Uint8Array(arr))
);

const worldUrl = Deno.args[0];
if (!worldUrl) {
  console.error("Usage: playground <worldAutomergeUrl> <packageAutomergeUrl>");
  Deno.exit(1);
}
const docUrl = Deno.args[1];
if (!docUrl) {
  console.error("Usage: playground <worldAutomergeUrl> <packageAutomergeUrl>");
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

const repo = new Repo({
  storage: new NodeFSStorageAdapter(),
  network: [new WebSocketClientAdapter("wss://sync.playground.now")],
});

type DocShape = { name: string; [k: string]: any };

const baseDir = path.resolve(".playground-sync");

const worldHandle = await findWithBackoff(worldUrl.trim());
const handle = await findWithBackoff(docUrl.trim());

const folder = (handle.doc() as any).name;
const outDir = path.join(baseDir, folder);
await ensureDir(outDir);

handle.on("change", (evt) => {
  // re-pull latest doc contents and rewrite files when doc changes from other peers
  //writeAll(evt.doc).catch(console.error);
});

function isTextKey(doc: DocShape, key: string) {
  return key !== "name" && typeof doc[key] === "string";
}

async function writeAll(doc: any) {
  for (const key of Object.keys(doc)) {
    if (!isTextKey(doc, key)) continue;
    await Deno.writeTextFile(path.join(outDir, `${key}.html`), doc[key] ?? "");
  }
}

async function main() {
  await writeAll(handle.doc());

  console.log(`Synced to: ${outDir}`);
  console.log("Watching for .html changes…");

  const watcher = Deno.watchFs(outDir, { recursive: false });

  for await (const ev of watcher) {
    if (ev.kind !== "modify" && ev.kind !== "create") continue;

    for (const filePath of ev.paths) {
      if (!filePath.endsWith(".html")) continue;

      const key = path.basename(filePath).replace(/\.html$/i, "");
      const newValue = await Deno.readTextFile(filePath);

      await handle.change((doc: any) => {
        doc[key] = newValue;
      });

      setTimeout(() => {
        worldHandle.broadcast({
          type: "peer-updated-file",
          pkgId: docUrl,
          pkg: (handle.doc() as any).name,
          tag: key,
        });
      }, 100);
    }
  }
}

if (import.meta.main) main();
