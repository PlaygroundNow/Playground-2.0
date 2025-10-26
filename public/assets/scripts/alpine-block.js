function toDashCase(str) {
  return str.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

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

  async loadModule(template) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(template, "text/html");

    const scripts = doc.querySelectorAll("script");
    const styles = doc.querySelectorAll("style");

    if (scripts.length !== 1) {
      throw new Error("SFC must contain exactly one <script>.");
    }

    this.rootNodes = Array.from(doc.body.childNodes).filter(
      (node) =>
        !(
          node.nodeType === Node.ELEMENT_NODE &&
          (node.tagName === "SCRIPT" ||
            node.tagName === "STYLE" ||
            node.tagName === "TEMPLATE")
        ) &&
        !(node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "")
    );

    if (this.rootNodes.length !== 1) {
      throw new Error(
        "SFC must contain exactly one root node (excluding <script> and <style>)."
      );
    }

    styles.forEach((style) => {
      this.shadowRoot.appendChild(style.cloneNode(true));
    });

    const script = scripts[0];
    try {
      const blob = new Blob([script.textContent], {
        type: "text/javascript",
      });
      const url = URL.createObjectURL(blob);
      const module = await import(url);
      URL.revokeObjectURL(url);

      const mergedExport = module.default || {};
      const mixinInits = [];
      const mixinDestroys = [];
      const mainKeys = new Set(Object.keys(mergedExport));
      const templates = [];
      const linkTags = [];
      if (Array.isArray(module.default?.mixins)) {
        for (const mixinSFC of module.default.mixins) {
          const mixinDoc = new DOMParser().parseFromString(
            mixinSFC,
            "text/html"
          );

          const { pkg } = JSON.parse(mixinDoc.firstChild.data);
          this.mixins.push(pkg);

          mixinDoc.querySelectorAll("link").forEach((link) => {
            document.head.appendChild(link.cloneNode(true));
          });
          mixinDoc.querySelectorAll("template").forEach((tpl) => {
            templates.push(tpl);
          });
          mixinDoc.querySelectorAll("style").forEach((style) => {
            this.shadowRoot.appendChild(style.cloneNode(true));
          });
          const allMixinScripts = mixinDoc.querySelectorAll("script");
          Array.from(allMixinScripts)
            .filter((script) => script.type !== "module")
            .forEach((s) => {
              this.shadowRoot.prepend(s.cloneNode(true));
            });
          const mixinScript = mixinDoc.querySelector('script[type="module"]');
          if (mixinScript) {
            const mixinBlob = new Blob([mixinScript.textContent], {
              type: "text/javascript",
            });
            const mixinUrl = URL.createObjectURL(mixinBlob);
            try {
              const mixinModule = await import(mixinUrl);
              const mixinExport = mixinModule.default || {};
              for (const key of Object.keys(mixinExport)) {
                if (key === "init") {
                  mixinInits.push(mixinExport.init);
                } else if (key === "destroy") {
                  mixinDestroys.push(mixinExport.destroy);
                } else if (key === "mixins") {
                  mergedExport.mixins.push(...mixinExport.mixins);
                } else if (mainKeys.has(key)) {
                  /* throw new Error(
                    `Mixin is attempting to override already defined key: ${key}`
                  ); */
                } else {
                  mergedExport[key] = mixinExport[key];
                  mainKeys.add(key);
                }
              }
            } finally {
              URL.revokeObjectURL(mixinUrl);
            }
          }
        }
      }

      if (typeof mergedExport.init === "function" || mixinInits.length > 0) {
        const mainInit = mergedExport.init;
        mergedExport.init = function (...args) {
          for (const fn of mixinInits) {
            if (typeof fn === "function") fn.apply(this, args);
          }
          if (typeof mainInit === "function") mainInit.apply(this, args);
        };
      }
      if (
        typeof mergedExport.destroy === "function" ||
        mixinDestroys.length > 0
      ) {
        const mainDestroy = mergedExport.destroy;
        mergedExport.destroy = function (...args) {
          for (const fn of mixinDestroys) {
            if (typeof fn === "function") fn.apply(this, args);
          }
          if (typeof mainDestroy === "function") mainDestroy.apply(this, args);
        };
      }

      this.rootContent = this.rootNodes[0].cloneNode(true);

      // Move <template> nodes that are not already inside the root node into the root node
      doc.querySelectorAll("template").forEach((tpl) => {
        if (!this.rootNodes[0].contains(tpl)) {
          this.rootContent.appendChild(tpl.cloneNode(true));
        }
      });

      templates.forEach((tpl) => {
        this.rootContent.appendChild(tpl.cloneNode(true));
      });

      this.rootContent.setAttribute("x-data", "block");
      this.shadowRoot.appendChild(this.rootContent);

      const self = this;
      mergedExport.props = new Proxy(
        {},
        {
          set(target, prop, value) {
            target[prop] = value;
            if (!prop.startsWith("@") && !prop.startsWith(":")) {
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

      if (Alpine) {
        Alpine.data("block", () => mergedExport);
        Alpine.initTree(this.shadowRoot);
      }
    } catch (e) {
      console.error(`Error importing SFC module ${name}:`, e);
    }
  }

  reloadFromTemplate(newTemplate) {
    if (this.shadowRoot) {
      this.shadowRoot.replaceChildren();
    }

    document
      .querySelectorAll(`[data-block="${this.tagName.toLowerCase()}"]`)
      .forEach((el) => el.remove());

    this.loadModule(newTemplate);
  }

  connectedCallback() {}

  connectedMoveCallback() {}

  attributeChangedCallback() {}

  disconnectedCallback() {}
}
