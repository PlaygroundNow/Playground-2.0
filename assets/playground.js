import Alpine from "https://esm.sh/alpinejs/builds/module.js";
import {
  Automerge,
  Repo,
  initializeWasm,
} from "https://esm.sh/@automerge/automerge-repo/slim?bundle-deps";
import { IndexedDBStorageAdapter } from "https://esm.sh/@automerge/automerge-repo-storage-indexeddb?bundle-deps";
import { WebSocketClientAdapter } from "https://esm.sh/@automerge/automerge-repo-network-websocket?bundle-deps";

await initializeWasm(
  fetch("https://esm.sh/@automerge/automerge/dist/automerge.wasm")
);

window.lock = false;
window.Automerge = Automerge;
window.Alpine = Alpine;

// Then set up an automerge repo (loading with our annoying WASM hack)
const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [new WebSocketClientAdapter("ws://localhost:3030")],
});

window.repo = repo;
window.handle = null;
const docUrl = window.location.hash.slice(1);
if (docUrl) {
  handle = await repo.find(docUrl);
} else {
  handle = repo.create({});
  window.location.hash = handle.url;
}

handle.on("change", (evt) => {
  if (!window.lock) {
    Alpine.$data(document.body).doc = evt.doc;
  }
});

function applyProps(target, source) {
  for (const key of Object.keys(source)) {
    const value = source[key];
    if (Array.isArray(value)) {
      if (JSON.stringify(target[key]) === JSON.stringify(value)) continue;
      target[key] = value.map((item) =>
        typeof item === "object" && item !== null ? { ...item } : item
      );
    } else if (typeof value === "object" && value !== null) {
      if (!target[key] || typeof target[key] !== "object") target[key] = {};
      applyProps(target[key], value);
    } else {
      if (target[key] === value) continue;
      target[key] = value;
    }
  }
}

Alpine.data("playground", () => {
  return {
    doc: handle.doc(),
    init() {
      this.$watch("doc", (value, oldValue) => {
        if (!oldValue) return;
        if (window.lock === true) {
          window.lock = false;
          return;
        }
        const unproxied = { ...value };
        window.lock = true;
        handle.change((doc) => {
          applyProps(doc, unproxied);
        });
        window.lock = false;
      });

      handle.on("ephemeral-message", ({ message, senderId }) => {
        const { type, ...rest } = message;
        this.$dispatch(type, { ...rest, senderId });
      });
    },
  };
});

Alpine.start();

const blocks = [...document.querySelectorAll("*")]
  .filter((el) => el.tagName.toLowerCase().endsWith("-block"))
  .map((el) => el.tagName.toLowerCase());

[...blocks, "cursor-block"].forEach((block) => {
  fetch(`/assets/${block}.html`, {
    method: "GET",
    headers: { Accept: "text/html" },
  })
    .then((res) => res.text())
    .then((sfc) => {
      alpineBlockSFC(block, sfc);
    });
});
