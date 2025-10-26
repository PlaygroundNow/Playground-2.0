import Alpine from "https://esm.sh/alpinejs@3.15.0/builds/module.js";
import {
  Automerge,
  Repo,
  initializeWasm,
} from "https://esm.sh/@automerge/automerge-repo@2.4.0/slim?bundle-deps";
import { IndexedDBStorageAdapter } from "https://esm.sh/@automerge/automerge-repo-storage-indexeddb@2.4.0?bundle-deps";
import { WebSocketClientAdapter } from "https://esm.sh/@automerge/automerge-repo-network-websocket@2.4.0?bundle-deps";

import AlpineBlock from "./alpine-block.js";
import Observer from "./observer.js";
import automergeSyncPlugin from "./automerge-sync-plugin.js";

await initializeWasm(
  fetch("https://esm.sh/@automerge/automerge@3.1.2/dist/automerge.wasm")
);

window.lock = false;
window.Automerge = Automerge;
window.Alpine = Alpine;
window.automergeSyncPlugin = automergeSyncPlugin;

const isProd = location.hostname.endsWith("playground.now");

const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [
    new WebSocketClientAdapter(
      isProd ? "wss://sync.automerge.org" : "ws://localhost:3030"
    ),
  ],
});

window.repo = repo;
window.handle = null;
const docUrl = window.location.hash.slice(1);
if (docUrl) {
  handle = await repo.find(docUrl);
} else {
  handle = repo.create({
    world: JSON.stringify({
      tagName: "world-block",
      props: [],
      children: [],
    }),
  });
  window.location.hash = handle.url;
}

function createObserved(doc) {
  return new Observer(
    structuredClone(doc),
    (evt) => {
      if (window.lock === true) {
        window.lock = false;
        return;
      }

      window.lock = true;
      handle.change((doc) => {
        const { action, object, name, oldValue } = evt || {};
        const keyPath = (evt.keyPath || evt.keypath || "").split(".").slice(1); // drop OBSERVED-*
        if (!keyPath.length) return;

        setByPath(doc, keyPath, object[name]);
      });
      window.lock = false;
    },
    { ignoreSameValueReassign: true }
  );
}

handle.on("change", (evt) => {
  if (!window.lock) {
    Alpine.$data(document.body).doc = createObserved(evt.doc);
  }
});

Alpine.magic("world", (el) => {
  return Alpine.$data(
    document.querySelector("world-block").shadowRoot.querySelector("div")
  );
});

Alpine.magic("props", (el) => {
  const host = el.getRootNode().host;
  return host.props;
});

Alpine.magic("host", (el) => {
  return el.getRootNode().host;
});

Alpine.magic("broadcast", () => (type, data) => {
  handle.broadcast({
    type: "peer-" + type,
    ...data,
  });
});

function setByPath(obj, path, value) {
  let current = obj;
  const lastKey = path.at(-1);

  for (let key of path.slice(0, -1)) {
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }

    current = current[key];
  }

  current[lastKey] = value;
}

Alpine.data("playground", () => {
  return {
    doc: createObserved(handle.doc()),
    init() {
      handle.on("ephemeral-message", ({ message, senderId }) => {
        const { type, ...rest } = message;
        this.$dispatch(type, { ...rest, senderId });
      });
    },
  };
});

Alpine.start();

function defineBlock(pkg, tagName, template) {
  if (!customElements.get(tagName)) {
    class AlpineBlockSFC extends AlpineBlock {}
    AlpineBlockSFC.pkg = pkg;
    AlpineBlockSFC.tagName = tagName;
    AlpineBlockSFC.template = template;
    customElements.define(tagName, AlpineBlockSFC);
  } else {
    customElements.get(tagName).template = template;
  }
}

[
  "world-block",
  "navbar-block",
  "cursor-block",
  "spotlight-button-block",
  "spotlight-block",
  "minimap-block",
  "window-block",
  "library-block",
  "menu-block",
  "block-editor-block",
  "code-block",
  "welcome-block",
].forEach((block) => {
  fetch(`/blocks/@playground/${block}.html`)
    .then((res) => res.text())
    .then((sfc) => {
      defineBlock("@playground", block, sfc);
    });
});

["caregiver-form-block", "referrals-list-block"].forEach((block) => {
  fetch(`/blocks/@carehub/${block}.html`)
    .then((res) => res.text())
    .then((sfc) => {
      defineBlock("@carehub", block, sfc);
    });
});
