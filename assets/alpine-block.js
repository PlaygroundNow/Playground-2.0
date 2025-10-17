function toDashCase(str) {
  return str.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

export default class AlpineBlock extends HTMLElement {
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
  get props() {
    return new Proxy(this.#props, {
      get: (target, prop) => {
        return this.getAttribute(toDashCase(prop));
      },
      set: (target, prop, value) => {
        this.setAttribute(toDashCase(prop), value);
        return true;
      },
    });
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
          (node.tagName === "SCRIPT" || node.tagName === "STYLE")
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

      let mergedExport = module.default || {};
      if (Array.isArray(module.default?.mixins)) {
        for (const mixinSFC of module.default.mixins) {
          const mixinDoc = new DOMParser().parseFromString(
            mixinSFC,
            "text/html"
          );
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
              mergedExport = Object.assign(
                {},
                mixinModule.default || {},
                mergedExport
              );
            } finally {
              URL.revokeObjectURL(mixinUrl);
            }
          }
        }
      }

      const rootContent = this.rootNodes[0].cloneNode(true);
      rootContent.setAttribute("x-data", "block");
      this.shadowRoot.appendChild(rootContent);

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

  attributeChangedCallback() {}

  disconnectedCallback() {}
}
