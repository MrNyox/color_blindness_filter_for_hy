(() => {
  // Avoid duplicate listeners if the popup injects this file into an already-open tab.
  if (window.__nyoxColorVisionMapperLoaded) return;
  window.__nyoxColorVisionMapperLoaded = true;

  const FILTER_ID = "__nyox_color_vision_mapper_filter_8f31c";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const DEFAULTS = { enabled: true, strength: 100 };

  // Each pair means: colors near LEFT should move toward RIGHT.
  // RIGHT-side reference colors are deliberately not transformed.
  const PAIRS = [
    { left: [151, 32, 147], right: [64, 63, 143] },
    { left: [255, 38, 2], right: [1, 104, 3] },
    { left: [255, 147, 2], right: [0, 173, 6] },
    { left: [255, 253, 1], right: [36, 254, 39] },
    { left: [172, 122, 66], right: [69, 132, 70] },
    { left: [255, 64, 255], right: [109, 111, 254] }
  ];

  // Gaussian radius in RGB channel values. This gives nearby shades a soft
  // transition instead of abruptly changing only the exact sampled pixels.
  const MASK_SIGMA = 22;

  let current = { ...DEFAULTS };
  let originalInlineFilter = null;
  let rootElement = null;
  let svgElement = null;
  let strengthFunctions = [];

  function matrixString(rows) {
    return rows.flat().join(" ");
  }

  function channelToAlphaMatrix(channel) {
    const alphaRow = [0, 0, 0, 0, 0];
    alphaRow[channel] = 1;
    return matrixString([
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
      alphaRow
    ]);
  }

  function translationMatrix(delta) {
    return matrixString([
      [1, 0, 0, 0, delta[0] / 255],
      [0, 1, 0, 0, delta[1] / 255],
      [0, 0, 1, 0, delta[2] / 255],
      [0, 0, 0, 1, 0]
    ]);
  }

  function gaussianTable(center, strengthScale) {
    const values = [];
    for (let value = 0; value <= 255; value += 1) {
      const distance = (value - center) / MASK_SIGMA;
      const closeness = Math.exp(-0.5 * distance * distance);
      values.push((closeness * strengthScale).toFixed(7));
    }
    return values.join(" ");
  }

  function createSvgElement(name, attributes = {}) {
    const element = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, String(value));
    }
    return element;
  }

  function appendMatrix(filter, input, result, values) {
    return filter.appendChild(createSvgElement("feColorMatrix", {
      in: input,
      type: "matrix",
      values,
      result
    }));
  }

  function appendComposite(filter, input, input2, result, attributes = {}) {
    return filter.appendChild(createSvgElement("feComposite", {
      in: input,
      in2: input2,
      operator: "arithmetic",
      k1: 1,
      k2: 0,
      k3: 0,
      k4: 0,
      result,
      ...attributes
    }));
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
      strengthFunctions = [];
    }

    if (svgElement && svgElement.isConnected) return true;

    // Rebuild cleanly if the page removed our hidden SVG filter element.
    strengthFunctions = [];

    const svg = createSvgElement("svg", {
      id: FILTER_ID + "_container",
      "aria-hidden": "true",
      focusable: "false"
    });
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;";

    const defs = createSvgElement("defs");
    const filter = createSvgElement("filter", {
      id: FILTER_ID,
      "color-interpolation-filters": "sRGB",
      x: "-5%",
      y: "-5%",
      width: "110%",
      height: "110%"
    });

    // Each color gets its own local mask and translation. Masks are calculated
    // from the original page pixels, so one pair cannot redirect another pair.
    let currentResult = "SourceGraphic";

    PAIRS.forEach((pair, index) => {
      const prefix = `pair${index}`;
      const close = createSvgElement("feComponentTransfer", {
        in: "SourceGraphic",
        result: `${prefix}_close`
      });

      const strengthScale = Math.cbrt(Math.max(0, Math.min(100, current.strength)) / 100);
      ["R", "G", "B"].forEach((channel, channelIndex) => {
        const func = createSvgElement("feFunc" + channel, {
          type: "table",
          tableValues: gaussianTable(pair.left[channelIndex], strengthScale)
        });
        close.appendChild(func);
        strengthFunctions.push({ element: func, center: pair.left[channelIndex] });
      });
      filter.appendChild(close);

      const redAlpha = appendMatrix(
        filter,
        `${prefix}_close`,
        `${prefix}_red_alpha`,
        channelToAlphaMatrix(0)
      );
      const greenAlpha = appendMatrix(
        filter,
        `${prefix}_close`,
        `${prefix}_green_alpha`,
        channelToAlphaMatrix(1)
      );
      const blueAlpha = appendMatrix(
        filter,
        `${prefix}_close`,
        `${prefix}_blue_alpha`,
        channelToAlphaMatrix(2)
      );

      appendComposite(filter, redAlpha.getAttribute("result"), greenAlpha.getAttribute("result"), `${prefix}_rg`);
      appendComposite(filter, `${prefix}_rg`, blueAlpha.getAttribute("result"), `${prefix}_rgb`);

      // Turn the combined alpha into a white layer with that opacity. Keeping
      // RGB white is important: premultiplied-alpha compositing then blends
      // the converted pixels by exactly the mask amount.
      appendMatrix(
        filter,
        `${prefix}_rgb`,
        `${prefix}_mask`,
        matrixString([
          [0, 0, 0, 0, 1],
          [0, 0, 0, 0, 1],
          [0, 0, 0, 0, 1],
          [0, 0, 0, 1, 0]
        ])
      );

      // The inverse mask is also white, with opacity 1 - mask.
      appendMatrix(
        filter,
        `${prefix}_mask`,
        `${prefix}_inverse`,
        matrixString([
          [0, 0, 0, 0, 1],
          [0, 0, 0, 0, 1],
          [0, 0, 0, 0, 1],
          [0, 0, 0, -1, 1]
        ])
      );

      const delta = pair.right.map((value, channel) => value - pair.left[channel]);
      appendMatrix(
        filter,
        currentResult,
        `${prefix}_translated`,
        translationMatrix(delta)
      );

      appendComposite(filter, `${prefix}_translated`, `${prefix}_mask`, `${prefix}_new_part`);
      appendComposite(filter, currentResult, `${prefix}_inverse`, `${prefix}_old_part`);

      filter.appendChild(createSvgElement("feComposite", {
        in: `${prefix}_new_part`,
        in2: `${prefix}_old_part`,
        operator: "arithmetic",
        k1: 0,
        k2: 1,
        k3: 1,
        k4: 0,
        result: `${prefix}_output`
      }));

      currentResult = `${prefix}_output`;
    });

    svg.appendChild(defs);
    defs.appendChild(filter);
    root.appendChild(svg);

    svgElement = svg;
    return true;
  }

  function updateStrength(strengthPercent) {
    const amount = Math.max(0, Math.min(100, Number(strengthPercent))) / 100;
    const strengthScale = Math.cbrt(amount);

    for (const item of strengthFunctions) {
      item.element.setAttribute("tableValues", gaussianTable(item.center, strengthScale));
    }
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
    updateStrength(current.strength);
    rootElement.style.setProperty("filter", `url("#${FILTER_ID}")`, "important");
  }

  function setSettings(settings) {
    if (typeof settings.enabled === "boolean") current.enabled = settings.enabled;
    if (Number.isFinite(Number(settings.strength))) {
      current.strength = Math.max(0, Math.min(100, Number(settings.strength)));
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
