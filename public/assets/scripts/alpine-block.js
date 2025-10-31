window.alpineCache = {};

function toCamelCase(str) {
  return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

export default class AlpineBlock extends HTMLElement {
  static tagName = "";
  static pkg = "";

  static set template(newTemplate) {
    const skip = !this._template;
    this._template = newTemplate;

    if (skip) return;

    function reloadAllBlocks(root) {
      const elements = root.querySelectorAll(this.tagName.toLowerCase());
      elements.forEach((el) => {
        if (typeof el.reloadFromTemplate === "function") {
          el.reloadFromTemplate(newTemplate);
        }
      });
      // Recursively search shadowRoots of elements ending with -block
      root.querySelectorAll("*").forEach((el) => {
        if (
          el.tagName &&
          el.tagName.toLowerCase().endsWith("-block") &&
          el.shadowRoot
        ) {
          reloadAllBlocks.call(this, el.shadowRoot);
        }
      });
    }
    reloadAllBlocks.call(this, document);
  }

  static get template() {
    return this._template;
  }

  mixins = [];

  constructor() {
    super();
    this.pkg = this.constructor.pkg;
    this.Alpine = window.Alpine ? window.Alpine : false;

    this.attachShadow({ mode: "open" });

    this.observer = new MutationObserver((mutationRecords) => {
      mutationRecords.forEach((record) => {
        const name = record.attributeName;

        if (name.startsWith("@") || name.startsWith(":")) return;

        const value = this.getAttribute(record.attributeName);
        const props =
          this.rootContent && this.Alpine.$data(this.rootContent).props;

        if (!props) return;

        if (props[toCamelCase(name)] === value) return;

        this.Alpine.nextTick(() => {
          props[toCamelCase(name)] = value;
        });
      });
    }).observe(this, { attributes: true });

    this.loadModule(this.constructor.template);
  }

  parseHTML(html) {
    return document.createRange().createContextualFragment(html);
  }

  firstCommentJSON(fragment) {
    for (const n of fragment.childNodes) {
      if (n.nodeType === Node.COMMENT_NODE) {
        try {
          return JSON.parse(n.data);
        } catch {}
      }
    }
    return {};
  }

  async loadModule(template) {
    const frag = this.parseHTML(template);

    const scripts = frag.querySelectorAll("script");
    const styles = frag.querySelectorAll("style");

    if (scripts.length !== 1)
      throw new Error("SFC must contain exactly one <script>.");

    // root nodes (exclude script/style/template + empty text)
    this.rootNodes = Array.from(frag.childNodes).filter(
      (node) =>
        !(
          node.nodeType === Node.ELEMENT_NODE &&
          (node.tagName === "SCRIPT" ||
            node.tagName === "STYLE" ||
            node.tagName === "TEMPLATE")
        ) &&
        !(node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "")
    );
    if (this.rootNodes.length !== 1)
      throw new Error(
        "SFC must contain exactly one root node (excluding <script> and <style>)."
      );

    // adopt styles
    styles.forEach((style) =>
      this.shadowRoot.appendChild(style.cloneNode(true))
    );

    let mergedExport;
    if (window.alpineCache[this.constructor.tagName]) {
      mergedExport = window.alpineCache[this.constructor.tagName];
    } else {
      const module = await import(
        `/blocks/${this.constructor.pkg}/${this.constructor.tagName}.js`
      );
      mergedExport = { ...(module.default || {}) };
    }

    const mixinInits = [];
    const mixinDestroys = [];
    const mainKeys = new Set(Object.keys(mergedExport));
    const templates = [];
    const linkTags = []; // kept for parity if you need it
    this.mixins ||= [];

    if (Array.isArray(mergedExport?.mixins)) {
      for (const mixinSFC of mergedExport.mixins) {
        const mixFrag = this.parseHTML(mixinSFC);
        const { pkg } = this.firstCommentJSON(mixFrag);
        if (pkg) this.mixins.push(pkg);

        // <link>
        mixFrag.querySelectorAll("link").forEach((link) => {
          document.head.appendChild(link.cloneNode(true));
        });

        // <template> / <style>
        mixFrag
          .querySelectorAll("template")
          .forEach((tpl) => templates.push(tpl));
        mixFrag.querySelectorAll("style").forEach((style) => {
          this.shadowRoot.appendChild(style.cloneNode(true));
        });

        // non-module scripts -> shadowRoot (keep behavior)
        const allMixinScripts = mixFrag.querySelectorAll("script");
        Array.from(allMixinScripts)
          .filter((s) => s.type !== "module")
          .forEach((s) => this.shadowRoot.prepend(s.cloneNode(true)));

        // module export merge
        if (!window.alpineCache[this.constructor.tagName]) {
          const mixinScript = Array.from(allMixinScripts).find(
            (s) => s.type === "module"
          );
          if (mixinScript && pkg) {
            const mixinModule = await import(`/blocks/${pkg}.js`);
            const mixinExport = { ...(mixinModule.default || {}) };

            for (const key of Object.keys(mixinExport)) {
              if (key === "init") mixinInits.push(mixinExport.init);
              else if (key === "destroy")
                mixinDestroys.push(mixinExport.destroy);
              else if (key === "mixins")
                (mergedExport.mixins ||= []).push(...mixinExport.mixins);
              else if (!mainKeys.has(key)) {
                mergedExport[key] = mixinExport[key];
                mainKeys.add(key);
              }
              // else: ignore override
            }
          }
        }
      }
    }

    // compose init/destroy
    if (!window.alpineCache[this.constructor.tagName]) {
      if (typeof mergedExport.init === "function" || mixinInits.length) {
        const mainInit = mergedExport.init;
        mergedExport.init = function (...args) {
          for (const fn of mixinInits)
            if (typeof fn === "function") fn.apply(this, args);
          if (typeof mainInit === "function") mainInit.apply(this, args);
        };
      }
      if (typeof mergedExport.destroy === "function" || mixinDestroys.length) {
        const mainDestroy = mergedExport.destroy;
        mergedExport.destroy = function (...args) {
          for (const fn of mixinDestroys)
            if (typeof fn === "function") fn.apply(this, args);
          if (typeof mainDestroy === "function") mainDestroy.apply(this, args);
        };
      }

      window.alpineCache[this.constructor.tagName] = { ...mergedExport };
    }

    // root content + pull in any top-level <template> not already inside root
    this.rootContent = this.rootNodes[0].cloneNode(true);
    frag.querySelectorAll("template").forEach((tpl) => {
      if (!this.rootNodes[0].contains(tpl))
        this.rootContent.appendChild(tpl.cloneNode(true));
    });
    templates.forEach((tpl) =>
      this.rootContent.appendChild(tpl.cloneNode(true))
    );

    this.rootContent.setAttribute("x-data", "block");
    this.shadowRoot.appendChild(this.rootContent);

    const toDashCase = (s) => s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
    const toCamelCase = (s) =>
      s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    const self = this;
    mergedExport.props = new Proxy(
      {},
      {
        set(target, prop, value) {
          target[prop] = value;
          if (!String(prop).startsWith("@") && !String(prop).startsWith(":")) {
            self.setAttribute(toDashCase(prop), value);
          }
          return true;
        },
        get(target, prop) {
          return target[prop];
        },
      }
    );

    Array.from(this.attributes).forEach((attr) => {
      if (!attr.name.startsWith("@") && !attr.name.startsWith(":")) {
        mergedExport.props[toCamelCase(attr.name)] = attr.value;
      }
    });
    this.props = mergedExport.props;

    if (window.Alpine) {
      Alpine.data("block", () => ({ ...mergedExport }));
      Alpine.initTree(this.shadowRoot);
    }
  }

  reloadFromTemplate(newTemplate) {
    if (this.shadowRoot) {
      this.shadowRoot.replaceChildren();
      //this.attachShadow({ mode: open });
    }

    document
      .querySelectorAll(`[data-block="${this.tagName.toLowerCase()}"]`)
      .forEach((el) => el.remove());

    this.loadModule(newTemplate);
  }

  needsSync(docEntry) {
    if (docEntry.tagName !== this.tagName.toLowerCase()) return true;

    if (docEntry.parentId && docEntry.parentId !== this.parentElement.id)
      return true;

    const domProps = new Set();
    for (const attr of this.attributes) {
      if (
        attr.name === "id" ||
        attr.name.startsWith(":") ||
        attr.name.startsWith("@")
      )
        continue;
      domProps.add(attr.name);
      if (docEntry.props[attr.name] !== attr.value) return true;
    }

    for (const key of Object.keys(docEntry.props)) {
      if (!domProps.has(key)) return true;
    }

    return false;
  }

  syncToDoc(action) {
    handle.change((doc) => {
      const idx = doc.world.findIndex((n) => n.id === this.id);

      if (action === "remove") {
        if (idx !== -1) {
          const toDelete = new Set([this.id]);
          for (const n of doc.world) {
            if (n.parentId && toDelete.has(n.parentId)) {
              toDelete.add(n.id);
            }
          }
          for (let i = doc.world.length - 1; i >= 0; i--) {
            if (toDelete.has(doc.world[i].id)) {
              doc.world.splice(i, 1);
            }
          }
        }
      } else {
        // Add or update
        let i = idx;
        if (i === -1) {
          doc.world.push({
            id: this.id,
            tagName: this.tagName.toLowerCase(),
            props: {},
          });
          i = doc.world.length - 1;
        }

        const entry = doc.world[i];
        entry.tagName = this.tagName.toLowerCase();

        // Sync props
        const seen = new Set();
        for (const attr of this.attributes) {
          if (
            attr.name === "id" ||
            attr.name.startsWith(":") ||
            attr.name.startsWith("@")
          )
            continue;
          if (entry.props[attr.name] !== attr.value) {
            entry.props[attr.name] = attr.value;
          }
          seen.add(attr.name);
        }

        // Only on removeAttribute??
        /* for (const key of Object.keys(entry.props)) {
          if (!seen.has(key)) {
            console.log("delete", key);
            delete entry.props[key];
          }
        } */

        // Set parent
        const parent = this.parentElement;
        const pid =
          this.tagName === "WORLD-BLOCK"
            ? null
            : parent?.constructor?.name === "AlpineBlockSFC" &&
              parent.tagName !== "WORLD-BLOCK"
            ? (parent.id ||= "pg" + crypto.randomUUID().replace(/-/g, ""))
            : null;

        if (pid) entry.parentId = pid;
        else delete entry.parentId;
      }
    });
  }

  setAttribute(name, value, syncing = false) {
    super.setAttribute(name, value);

    if (
      !syncing &&
      name !== "id" &&
      !name.startsWith(":") &&
      !name.startsWith("@")
    ) {
      const entry = handle.doc().world.find((n) => n.id === this.id);
      if (entry && this.needsSync(entry)) {
        this.syncToDoc("update");
      }
    }
  }

  removeAttribute(name, syncing = false) {
    super.removeAttribute(name);

    if (
      !syncing &&
      name !== "id" &&
      !name.startsWith(":") &&
      !name.startsWith("@")
    ) {
      const entry = handle.doc().world.find((n) => n.id === this.id);
      if (entry && this.needsSync(entry)) {
        this.syncToDoc("update");
      }
    }
  }

  connectedCallback() {
    if (this.constructor.tagName === "world-block") return;
    if (!this.closest("world-block")) return;
    if (this.getRootNode() instanceof ShadowRoot) return;

    this.id ||= "pg" + crypto.randomUUID().replace(/-/g, "");

    const existing = handle.doc().world.find((n) => n.id === this.id);

    if (!existing) {
      this.syncToDoc("add");
    } else {
      if (this.needsSync(existing)) {
        this.syncToDoc("update");
      }
    }
  }

  connectedMoveCallback() {}

  attributeChangedCallback() {}

  disconnectedCallback() {
    this.observer?.disconnect();

    const exists = handle.doc().world.find((n) => n.id === this.id);

    if (exists) {
      this.syncToDoc("remove");
    }
  }
}
