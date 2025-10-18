function toDashCase(str) {
  return str.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

export default class AlpineBlock extends HTMLElement {
  static observedAttributes = ["x", "y"];

  static tagName = "";

  static set template(newTemplate) {
    this._template = newTemplate;

    document.querySelectorAll(this.tagName.toLowerCase()).forEach((el) => {
      if (typeof el.reloadFromTemplate === "function") {
        el.reloadFromTemplate(newTemplate);
      }
    });
  }

  static get template() {
    return this._template;
  }

  #props = Object.fromEntries(
    Array.from(this.attributes).map((attr) => [attr.name, attr.value])
  );

  #propsProxy = new Proxy(this.#props, {
    get: (target, prop) => {
      return target[prop];
    },
    set: (target, prop, value) => {
      target[prop] = value;
      this.setAttribute(toDashCase(prop), value);
      return true;
    },
  });

  get props() {
    return this.#propsProxy;
  }

  constructor() {
    super();
    this.Alpine = window.Alpine ? window.Alpine : false;

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

    // Find root nodes (excluding <script> and <style>)
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

    this.attachShadow({ mode: "open" });

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
      if (Array.isArray(module.default?.mixins)) {
        for (const mixinSFC of module.default.mixins) {
          const mixinDoc = new DOMParser().parseFromString(
            mixinSFC,
            "text/html"
          );

          mixinDoc.querySelectorAll("template").forEach((tpl) => {
            templates.push(tpl);
          });
          mixinDoc.querySelectorAll("style").forEach((style) => {
            this.shadowRoot.appendChild(style.cloneNode(true));
          });
          const mixinScript = mixinDoc.querySelector("script");
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

      // Compose lifecycle methods: call all mixin inits, then main init
      if (typeof mergedExport.init === "function" || mixinInits.length > 0) {
        const mainInit = mergedExport.init;
        mergedExport.init = function (...args) {
          for (const fn of mixinInits) {
            if (typeof fn === "function") fn.apply(this, args);
          }
          if (typeof mainInit === "function") mainInit.apply(this, args);
        };
      }
      // Compose destroy methods: call all mixin destroys, then main destroy
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

      mergedExport.props = this.props;

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

    this.loadModule(newTemplate);
  }

  connectedCallback() {}

  connectedMoveCallback() {}

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this.rootContent) {
      if (this.Alpine.$data(this.rootContent).props) {
        this.Alpine.$data(this.rootContent).props[name] = newValue;
      }
    }
  }

  disconnectedCallback() {}
}
