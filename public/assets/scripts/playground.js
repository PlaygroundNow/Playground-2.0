import Alpine from "https://esm.sh/alpinejs/builds/module.js";
import {
  Automerge,
  Repo,
  initializeWasm,
} from "https://esm.sh/@automerge/automerge-repo/slim?bundle-deps";
import { IndexedDBStorageAdapter } from "https://esm.sh/@automerge/automerge-repo-storage-indexeddb?bundle-deps";
import { WebSocketClientAdapter } from "https://esm.sh/@automerge/automerge-repo-network-websocket?bundle-deps";

import AlpineBlock from "./alpine-block.js";

await initializeWasm(
  fetch("https://esm.sh/@automerge/automerge/dist/automerge.wasm")
);

window.lock = false;
window.Automerge = Automerge;
window.Alpine = Alpine;

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
    world: new Automerge.ImmutableString(
      JSON.stringify({
        tagName: "world-block",
        props: [],
        children: [],
      })
    ),
  });
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

function defineBlock(tagName, template) {
  if (!customElements.get(tagName)) {
    class AlpineBlockSFC extends AlpineBlock {}
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
  "caregiver-form-block",
].forEach((block) => {
  fetch(`/blocks/@playground/${block}.html`)
    .then((res) => res.text())
    .then((sfc) => {
      defineBlock(block, sfc);
    });
});

const automergeSyncPlugin = ({ handle, path, codemirror, automerge }) => {
  const reconcileAnnotationType = codemirror.state.Annotation.define();
  const isReconcileTx = (tr) => !!tr.annotation(reconcileAnnotationType);

  const applyAmPatchesToCm = (view, target, patches) => {
    let selection = view.state.selection;
    for (const patch of patches) {
      const changeSpec = handlePatch(patch, target, view.state);
      if (changeSpec != null) {
        const changeSet = codemirror.state.ChangeSet.of(
          changeSpec,
          view.state.doc.length,
          "\n"
        );
        selection = selection.map(changeSet, 1);
        view.dispatch({
          changes: changeSet,
          annotations: reconcileAnnotationType.of({}),
        });
      }
    }
    view.dispatch({
      selection,
      annotations: reconcileAnnotationType.of({}),
    });
  };
  function handlePatch(patch, target, state) {
    if (patch.action === "insert") {
      return handleInsert(target, patch);
    } else if (patch.action === "splice") {
      return handleSplice(target, patch);
    } else if (patch.action === "del") {
      return handleDel(target, patch);
    } else if (patch.action === "put") {
      return handlePut(target, patch, state);
    } else {
      return null;
    }
  }
  function handleInsert(target, patch) {
    const index = charPath(target, patch.path);
    if (index == null) {
      return [];
    }
    const text = patch.values.map((v) => (v ? v.toString() : "")).join("");
    return [{ from: index, to: index, insert: text }];
  }
  function handleSplice(target, patch) {
    const index = charPath(target, patch.path);
    if (index == null) {
      return [];
    }
    return [{ from: index, insert: patch.value }];
  }
  function handleDel(target, patch) {
    const index = charPath(target, patch.path);
    if (index == null) {
      return [];
    }
    const length = patch.length || 1;
    return [{ from: index, to: index + length }];
  }
  function handlePut(target, patch, state) {
    const index = charPath(target, [...patch.path, 0]);
    if (index == null) {
      return [];
    }
    const length = state.doc.length;
    if (typeof patch.value !== "string") {
      return []; // TODO(dmaretskyi): How to handle non string values?
    }
    return [{ from: 0, to: length, insert: patch.value }];
  }

  // If the path of the patch is of the form [path, <index>] then we know this is
  // a path to a character within the sequence given by path
  function charPath(textPath, candidatePath) {
    if (candidatePath.length !== textPath.length + 1) return null;
    for (let i = 0; i < textPath.length; i++) {
      if (textPath[i] !== candidatePath[i]) return null;
    }
    const index = candidatePath[candidatePath.length - 1];
    if (typeof index === "number") return index;
    return null;
  }

  const applyCmTransactionsToAmHandle = (handle, path, transactions) => {
    const transactionsWithChanges = transactions.filter(
      (tr) => !isReconcileTx(tr) && !tr.changes.empty
    );
    if (transactionsWithChanges.length === 0) {
      return;
    }
    handle.change((doc) => {
      transactionsWithChanges.forEach((tr) => {
        tr.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
          // We are cloning the path as `am.splice` calls `.unshift` on it, modifying it in place,
          // causing the path to be broken on subsequent changes
          automerge.splice(
            doc,
            path.slice(),
            fromB,
            toA - fromA,
            inserted.toString()
          );
        });
      });
    });
    return automerge.getHeads(handle.doc());
  };

  if (!handle.isReady()) {
    throw new Error(
      "ensure the handle is ready before initializing the automergeSyncPlugin"
    );
  }
  return codemirror.view.ViewPlugin.fromClass(
    class {
      view;
      reconciledHeads = automerge.getHeads(handle.doc());
      isProcessingCmTransaction = false;
      constructor(view) {
        this.view = view;
        this.onChange = this.onChange.bind(this);
        handle.on("change", this.onChange);
      }
      update(update) {
        // start processing codemirror transaction
        // changes that are created through the transaction are ignored in the change listener on the handle
        this.isProcessingCmTransaction = true;
        const newHeads = applyCmTransactionsToAmHandle(
          handle,
          path,
          update.transactions
        );
        if (newHeads) {
          this.reconciledHeads = newHeads;
        }
        // finish processing transaction
        this.isProcessingCmTransaction = false;
      }
      onChange = () => {
        // ignore changes that where triggered while processing a codemirror transaction
        if (this.isProcessingCmTransaction) {
          return;
        }
        const currentHeads = automerge.getHeads(handle.doc());
        if (automerge.equals(currentHeads, this.reconciledHeads)) {
          return;
        }
        // get the diff between the reconciled heads and the new heads
        // and apply that to the codemirror doc
        const patches = automerge.diff(
          handle.doc(),
          this.reconciledHeads,
          currentHeads
        );
        applyAmPatchesToCm(this.view, path, patches);
        this.reconciledHeads = currentHeads;
      };
      destroy() {
        handle.off("change", this.onChange);
      }
    }
  );
};

window.automergeSyncPlugin = automergeSyncPlugin;
