(() => {
  if (window.__nyoxColorVisionMapperLoaded) return;
  window.__nyoxColorVisionMapperLoaded = true;

  const FILTER_ID = "__nyox_color_vision_mapper_filter_fast";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const DEFAULTS = { enabled: true, strength: 100, type: "custom" };

  // RGB rows (3x5) of each transform. The 4th row (the selective mask)
  // is appended at runtime so intensity can scale it for free.
  const MATRIX_RGB = {
    // Friend-calibrated one-way mapping (left swatches -> right swatches)
    custom: [
      -0.2099, 0.1957, 0.4253, 0, 0.1513,
       0.2964, 0.6942, -0.0340, 0, -0.0002,
       0.0203, 0.1625, 0.9974, 0, -0.0592
    ],
    deuteranopia: [0.625, 0.375, 0, 0, 0, 0.7, 0.3, 0, 0, 0, 0, 0.3, 0.7, 0, 0],
    protanopia:   [0.567, 0.433, 0, 0, 0, 0.558, 0.442, 0, 0, 0, 0, 0.242, 0.758, 0, 0],
    tritanopia:   [0.95, 0.05, 0, 0, 0, 0, 0.433, 0.567, 0, 0, 0, 0.475, 0.525, 0, 0],
    achromatopsia:[0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114, 0, 0, 0.299, 0.587, 0.114, 0, 0]
  };
  const WHITE_RGB = [0,0,0,0,1, 0,0,0,0,1, 0,0,0,0,1];

  let current = { ...DEFAULTS };
  let originalInlineFilter = null;
  let rootElement = null;
  let svgElement = null;
  let tMatrix = null;
  let mwMatrix = null;
  let rootObserver = null;
  let healPending = false;

  // "Redness" mask: >0 only for red-dominated hues (red/orange/yellow/
  // brown/pink/purple/magenta). Exactly 0 or negative for greens, blues
  // and neutrals, so those pixels are never modified. Strength scales it.
  function maskRow(scale) {
    return current.type === "custom"
      ? [6 * scale, -3 * scale, -3 * scale, 0, 0]
      : [0, 0, 0, 0, scale]; // global modes (true CVD simulation)
  }

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, String(value));
    }
    return element;
  }

  function attachObserver(root) {
    if (rootObserver) rootObserver.disconnect();
    rootObserver = new MutationObserver(scheduleHeal);
    rootObserver.observe(root, {
      attributes: true,
      attributeFilter: ["style"],
      childList: true
    });
  }

  function ensureFilter() {
    const root = document.documentElement;
    if (!root) return false;

    if (rootElement !== root) {
      rootElement = root;
      originalInlineFilter = {
        value: root.style.getPropertyValue("filter"),
        priority: root.style.getPropertyPriority("filter")
      };
      svgElement = null;
      tMatrix = null;
      mwMatrix = null;
      attachObserver(root);
    }

    if (svgElement && svgElement.isConnected && tMatrix && tMatrix.isConnected) return true;

    const svg = createSvgElement("svg", {
      id: FILTER_ID + "_container",
      "aria-hidden": "true",
      focusable: "false"
    });
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;";

    const defs = createSvgElement("defs");
    const filter = createSvgElement("filter", {
      id: FILTER_ID,
      "color-interpolation-filters": "sRGB"
    });

    // 1) transformed colors, alpha = mask
    tMatrix = createSvgElement("feColorMatrix", { in: "SourceGraphic", type: "matrix", result: "cb_t" });
    filter.appendChild(tMatrix);
    // 2) re-multiply by the page alpha so translucent pixels keep their opacity
    filter.appendChild(createSvgElement("feComposite", { in: "cb_t", in2: "SourceGraphic", operator: "in", result: "cb_t2" }));
    // 3) white layer, alpha = mask
    mwMatrix = createSvgElement("feColorMatrix", { in: "SourceGraphic", type: "matrix", result: "cb_mw" });
    filter.appendChild(mwMatrix);
    // 4) (1 - mask) * original
    filter.appendChild(createSvgElement("feComposite", { in: "SourceGraphic", in2: "cb_mw", operator: "arithmetic", k1: -1, k2: 1, k3: 0, k4: 0, result: "cb_s2" }));
    // 5) mask * transformed + (1 - mask) * original
    filter.appendChild(createSvgElement("feComposite", { in: "cb_t2", in2: "cb_s2", operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0 }));

    defs.appendChild(filter);
    svg.appendChild(defs);
    root.appendChild(svg);
    svgElement = svg;
    return true;
  }

  function updateFilter() {
    if (!tMatrix || !mwMatrix) return;
    const s = Math.max(0, Math.min(100, Number(current.strength))) / 100;
    const rgb = MATRIX_RGB[current.type] || MATRIX_RGB.custom;
    const mask = maskRow(s);
    tMatrix.setAttribute("values", rgb.concat(mask).join(" "));
    mwMatrix.setAttribute("values", WHITE_RGB.concat(mask).join(" "));
  }

  function applySettings() {
    const root = document.documentElement;
    if (!root) return;

    const enabled = Boolean(current.enabled) && Number(current.strength) > 0;
    if (!enabled) {
      if (rootElement && rootElement === root && originalInlineFilter) {
        if (originalInlineFilter.value) {
          root.style.setProperty("filter", originalInlineFilter.value, originalInlineFilter.priority);
        } else {
          root.style.removeProperty("filter");
        }
      }
      return;
    }

    if (!ensureFilter()) return;
    updateFilter();
    root.style.setProperty("filter", `url("#${FILTER_ID}")`, "important");
  }

  // Self-healing: some SPAs (Discord, etc.) rewrite the <html> style
  // attribute or prune injected nodes after boot. Re-apply within 1 frame.
  function scheduleHeal() {
    if (healPending) return;
    healPending = true;
    requestAnimationFrame(() => {
      healPending = false;
      heal();
    });
  }

  function heal() {
    const root = document.documentElement;
    if (!root) return;
    if (!(Boolean(current.enabled) && Number(current.strength) > 0)) return;

    if (rootElement !== root) { applySettings(); return; }

    if (!svgElement || !svgElement.isConnected || !tMatrix || !tMatrix.isConnected) {
      svgElement = null;
      tMatrix = null;
      mwMatrix = null;
      if (!ensureFilter()) return;
      updateFilter();
    }

    const applied = root.style.getPropertyValue("filter");
    if (applied.indexOf(FILTER_ID) === -1) {
      root.style.setProperty("filter", `url("#${FILTER_ID}")`, "important");
    }
  }

  function setSettings(settings) {
    if (typeof settings.enabled === "boolean") current.enabled = settings.enabled;
    if (Number.isFinite(Number(settings.strength))) {
      current.strength = Math.max(0, Math.min(100, Number(settings.strength)));
    }
    if (typeof settings.type === "string" && MATRIX_RGB[settings.type]) {
      current.type = settings.type;
    }
    applySettings();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message && message.type === "color-vision-mapper:set-settings") {
      setSettings(message.settings || {});
    }
  });

  function initialize() {
    chrome.storage.local.get(DEFAULTS, (settings) => {
      setSettings(settings || DEFAULTS);
    });
    // Catch full <html> replacement
    new MutationObserver(() => {
      if (document.documentElement && document.documentElement !== rootElement) scheduleHeal();
    }).observe(document, { childList: true });
  }

  if (document.documentElement) {
    initialize();
  } else {
    const observer = new MutationObserver(() => {
      if (document.documentElement) {
        observer.disconnect();
        initialize();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  }
})();
