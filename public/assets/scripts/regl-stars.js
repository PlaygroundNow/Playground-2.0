/* regl-stars.js — lightweight animated SVG star background */

(function () {
  const DEFAULTS = {
    canvas: { el: null, w: 0, h: 0, pxratio: 1 },
    particles: {
      number: { value: 200, density: { enable: true, value_area: 800 } },
      color: { value: "#ffffff" },
      opacity: {
        value: 1,
        random: true,
      },
      size: {
        value: 2,
        random: true,
      },
      line_linked: { enable: false },
      move: { enable: false },
      array: [],
    },
    interactivity: {
      detect_on: "canvas",
      events: {
        onhover: { enable: false },
        onclick: { enable: false },
        resize: true,
      },
      modes: {},
      mouse: {},
    },
    retina_detect: true,
    fn: { interact: {}, modes: {}, vendors: {} },
    tmp: {},
  };

  const SVG_NS = "http://www.w3.org/2000/svg";

  function hexToRgb(hex) {
    const s = hex.replace(/^#/, "");
    const n =
      s.length === 3
        ? s
            .split("")
            .map((c) => c + c)
            .join("")
        : s;
    const m = /^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(n);
    if (!m) return { r: 255, g: 255, b: 255 };
    return {
      r: parseInt(m[1], 16),
      g: parseInt(m[2], 16),
      b: parseInt(m[3], 16),
    };
  }

  function deepExtend(dst, src) {
    for (const k in src) {
      const v = src[k];
      if (v && v.constructor === Object) {
        if (!dst[k]) dst[k] = {};
        deepExtend(dst[k], v);
      } else {
        dst[k] = v;
      }
    }
    return dst;
  }

  function clamp(x, a, b) {
    return Math.min(Math.max(x, a), b);
  }

  function pJS(tag_id, params) {
    const root = this?.getRootNode?.() ?? document;
    const container = root.getElementById(tag_id);
    if (!container)
      throw new Error(`particlesJS: container with id "${tag_id}" not found`);

    const prev = container.querySelector(".particles-js-svg-el");
    if (prev) prev.remove();

    const state = deepExtend(
      JSON.parse(JSON.stringify(DEFAULTS)),
      params || {}
    );

    const computedPosition = getComputedStyle(container).position;
    const forcedPosition = computedPosition === "static";
    if (forcedPosition) container.style.position = "relative";

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.classList.add("particles-js-svg-el");
    Object.assign(svg.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      display: "block",
      pointerEvents: "none",
      overflow: "visible",
      zIndex: "-1",
    });
    svg.setAttribute("preserveAspectRatio", "xMidYMid slice");
    svg.setAttribute("role", "presentation");
    container.appendChild(svg);
    state.canvas.el = svg;

    function retinaInit() {
      const rect = container.getBoundingClientRect();
      const cssW =
        rect.width || container.clientWidth || container.offsetWidth || 1;
      const cssH =
        rect.height || container.clientHeight || container.offsetHeight || 1;
      state.canvas.pxratio =
        state.retina_detect && window.devicePixelRatio > 1
          ? window.devicePixelRatio
          : 1;
      state.canvas.w = Math.max(1, Math.round(cssW * state.canvas.pxratio));
      state.canvas.h = Math.max(1, Math.round(cssH * state.canvas.pxratio));
      svg.setAttribute("viewBox", `0 0 ${state.canvas.w} ${state.canvas.h}`);
    }

    function computeTargetCount() {
      const particles = state.particles;
      if (!particles.number.density.enable)
        return Math.max(0, particles.number.value | 0);
      let area = (state.canvas.w * state.canvas.h) / 1000;
      if (state.canvas.pxratio > 1) area /= state.canvas.pxratio * 2;
      const desired = particles.number.value | 0;
      return Math.max(
        0,
        Math.round((area * desired) / particles.number.density.value_area)
      );
    }

    function rebuildStars(count) {
      const col = hexToRgb(state.particles.color.value || "#ffffff");
      const color = `rgb(${col.r}, ${col.g}, ${col.b})`;
      const sizeBase = (state.particles.size.value * state.canvas.pxratio) / 2;
      const allowRandomSize = !!state.particles.size.random;
      const allowRandomOpacity = !!state.particles.opacity.random;
      const opacityBase = clamp(state.particles.opacity.value, 0, 1);

      const frag = document.createDocumentFragment();
      for (let i = 0; i < count; i++) {
        const cx = Math.random() * state.canvas.w;
        const cy = Math.random() * state.canvas.h;
        const sizeMul = allowRandomSize ? 0.5 + Math.random() : 1;
        const radius = Math.max(0.2, sizeBase * sizeMul);
        const op =
          clamp(allowRandomOpacity ? Math.random() : 1, 0, 1) * opacityBase;

        const circle = document.createElementNS(SVG_NS, "circle");
        circle.setAttribute("cx", cx.toFixed(2));
        circle.setAttribute("cy", cy.toFixed(2));
        circle.setAttribute("r", radius.toFixed(2));
        circle.setAttribute("fill", color);
        circle.setAttribute("opacity", op.toFixed(3));

        const anim = document.createElementNS(SVG_NS, "animate");
        anim.setAttribute("attributeName", "opacity");
        const low = (0.2 + Math.random() * 0.4).toFixed(3);
        const high = op.toFixed(3);
        anim.setAttribute("values", `${low};${high};${low}`);
        anim.setAttribute("dur", `${(2 + Math.random() * 3).toFixed(2)}s`);
        anim.setAttribute("repeatCount", "indefinite");
        anim.setAttribute("begin", `${(Math.random() * 5).toFixed(2)}s`);
        circle.appendChild(anim);

        frag.appendChild(circle);
      }
      svg.replaceChildren(frag);
    }

    function refresh() {
      retinaInit();
      rebuildStars(computeTargetCount());
    }

    refresh();

    let resizeHandler = null;
    if (state.interactivity.events.resize) {
      resizeHandler = () => refresh();
      window.addEventListener("resize", resizeHandler, { passive: true });
    }

    return {
      destroy() {
        if (resizeHandler) {
          window.removeEventListener("resize", resizeHandler);
        }
        svg.remove();
        if (forcedPosition) container.style.position = "";
      },
      refresh,
      exportImg() {
        const serializer = new XMLSerializer();
        const clone = svg.cloneNode(true);
        const xml = serializer.serializeToString(clone);
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      },
    };
  }

  window.pJSDom = window.pJSDom || [];
  window.particlesJS = function (tag_id, params) {
    if (typeof tag_id !== "string") {
      params = tag_id;
      tag_id = "particles-js";
    }
    if (!tag_id) tag_id = "particles-js";
    const inst = pJS.call(this, tag_id, params);
    window.pJSDom.push(inst);
    return inst;
  };
  window.particlesJS.load = function (tag_id, url, cb) {
    fetch(url)
      .then((r) => r.json())
      .then((cfg) => {
        const inst = window.particlesJS.call(this, tag_id, cfg);
        if (cb) cb(inst);
      });
  };
})();
