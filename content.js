(() => {
  if (window.__nyoxColorVisionMapperLoaded) return;
  window.__nyoxColorVisionMapperLoaded = true;

  const FILTER_ID = "__nyox_color_vision_mapper_filter_fast";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const DEFAULTS = {enabled: true, strength: 100, type: "deuteranopia"};

  // Standard hardware-accelerated color blindness matrices
  const MATRICES = {
    deuteranopia: [
      0.625, 0.375, 0, 0, 0,
      0.7, 0.3, 0, 0, 0,
      0, 0.3, 0.7, 0, 0,
      0, 0, 0, 1, 0
    ],
    protanopia: [
      0.567, 0.433, 0, 0, 0,
      0.558, 0.442, 0, 0, 0,
      0, 0.242, 0.758, 0, 0,
      0, 0, 0, 1, 0
    ],
    tritanopia: [
      0.95, 0.05, 0, 0, 0,
      0, 0.433, 0.567, 0, 0,
      0, 0.475, 0.525, 0, 0,
      0, 0, 0, 1, 0
    ],
    achromatopsia: [
      0.299, 0.587, 0.114, 0, 0,
      0.299, 0.587, 0.114, 0, 0,
      0.299, 0.587, 0.114, 0, 0,
      0, 0, 0, 1, 0
    ],
    // Custom "Friend-calibrated" shift approximated as a global affine matrix
    custom: [
      -0.2099, 0.1957, 0.4253, 0, 0.1513,
       0.2964, 0.6942, -0.0340, 0, -0.0002,
       0.0203, 0.1625, 0.9974, 0, -0.0592,
       0, 0, 0, 1, 0
    ]
  };

  const IDENTITY = [
    1, 0, 0, 0, 0,
    0, 1, 0, 0, 0,
    0, 0, 1, 0, 0,
    0, 0, 0, 1, 0
  ];

  let current = { ...DEFAULTS };
  let originalInlineFilter = null;
  let rootElement = null;
  let svgElement = null;
  let matrixElement = null;

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
      matrixElement = null;
    }

    if (svgElement && svgElement.isConnected) return true;

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("id", `${FILTER_ID}_container`);
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;";

    const defs = document.createElementNS(SVG_NS, "defs");
    const filter = document.createElementNS(SVG_NS, "filter");
    filter.setAttribute("id", FILTER_ID);
    filter.setAttribute("color-interpolation-filters", "sRGB");

    // Single, highly performant matrix filter
    const matrix = document.createElementNS(SVG_NS, "feColorMatrix");
    matrix.setAttribute("id", `${FILTER_ID}_matrix`);
    matrix.setAttribute("type", "matrix");
    matrix.setAttribute("in", "SourceGraphic");
    matrix.setAttribute("values", IDENTITY.join(" "));

    filter.appendChild(matrix);
    defs.appendChild(filter);
    svg.appendChild(defs);
    root.appendChild(svg);

    svgElement = svg;
    matrixElement = matrix;
    return true;
  }

  function updateFilter() {
    if (!matrixElement) return;

    const target = MATRICES[current.type] || MATRICES.deuteranopia;
    const amt = Math.max(0, Math.min(100, Number(current.strength))) / 100;

    // Linearly interpolate between the identity matrix and the target matrix
    const currentMatrix = IDENTITY.map((val, i) => {
      return val + (target[i] - val) * amt;
    });

    matrixElement.setAttribute("values", currentMatrix.join(" "));
  }

  function applySettings() {
    if (!document.documentElement) return;

    const enabled = Boolean(current.enabled) && Number(current.strength) > 0;

    if (!enabled) {
      if (rootElement && rootElement === document.documentElement && originalInlineFilter) {
        if (originalInlineFilter.value) {
          rootElement.style.setProperty("filter", originalInlineFilter.value, originalInlineFilter.priority);
        } else {
          rootElement.style.removeProperty("filter");
        }
      }
      return;
    }

    if (!ensureFilter()) return;

    updateFilter();
    rootElement.style.setProperty("filter", `url("#${FILTER_ID}")`, "important");
  }

  function setSettings(settings) {
    if (typeof settings.enabled === "boolean") current.enabled = settings.enabled;
    if (Number.isFinite(Number(settings.strength))) {
      current.strength = Math.max(0, Math.min(100, Number(settings.strength)));
    }
    if (typeof settings.type === "string" && MATRICES[settings.type]) {
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
