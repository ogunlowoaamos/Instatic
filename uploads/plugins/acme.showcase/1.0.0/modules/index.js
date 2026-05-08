// src/core/plugin-sdk/capabilities.ts
var PLUGIN_CAPABILITIES = [
  {
    permission: "admin.navigation",
    label: "Add pages to the admin navigation",
    description: "Allows the plugin to add pages to the CMS admin sidebar and plugin page router.",
    risk: "low",
    surfaces: ["manifest", "admin"]
  },
  {
    permission: "cms.storage",
    label: "Read and write plugin backend storage",
    description: "Allows the plugin to read and write records in resources declared by its manifest.",
    risk: "medium",
    surfaces: ["admin", "editor", "server", "cms"]
  },
  {
    permission: "cms.routes",
    label: "Register backend CMS routes",
    description: "Allows the plugin server entrypoint to register authenticated backend routes.",
    risk: "high",
    surfaces: ["server", "cms"]
  },
  {
    permission: "cms.hooks",
    label: "Subscribe to CMS lifecycle events and filters",
    description: "Allows the plugin server entrypoint to listen to CMS events (publish, content changes, page updates) and to register filters that transform values before they leave the CMS.",
    risk: "high",
    surfaces: ["server", "cms"]
  },
  {
    permission: "editor.toolbar",
    label: "Add controls to the editor toolbar",
    description: "Allows the plugin editor entrypoint to add toolbar buttons.",
    risk: "medium",
    surfaces: ["editor"]
  },
  {
    permission: "editor.commands",
    label: "Register editor commands",
    description: "Allows the plugin editor entrypoint to register commands that can be invoked by editor UI.",
    risk: "medium",
    surfaces: ["editor"]
  },
  {
    permission: "editor.store.read",
    label: "Read editor state",
    description: "Allows the plugin to inspect the current editor store state.",
    risk: "medium",
    surfaces: ["editor"]
  },
  {
    permission: "editor.store.write",
    label: "Modify editor state",
    description: "Allows the plugin to mutate editor store state through a host transaction.",
    risk: "high",
    surfaces: ["editor"]
  },
  {
    permission: "editor.canvas",
    label: "Read and modify the editor canvas",
    description: "Reserved for canvas-level plugin APIs.",
    risk: "high",
    surfaces: ["editor"]
  },
  {
    permission: "editor.panels",
    label: "Add editor panels",
    description: "Reserved for plugins that add panels to the editor workspace.",
    risk: "medium",
    surfaces: ["editor"]
  },
  {
    permission: "modules.register",
    label: "Register page builder modules",
    description: "Allows the plugin to ship new modules that show up in the canvas module library.",
    risk: "high",
    surfaces: ["editor", "manifest"]
  },
  {
    permission: "loops.register",
    label: "Register loop entity sources",
    description: "Allows the plugin to register data sources for the base.loop module (e.g. external collections, custom queries).",
    risk: "medium",
    surfaces: ["editor", "server", "manifest"]
  },
  {
    permission: "visualComponents.register",
    label: "Install Visual Components / templates into the site",
    description: "Allows the plugin to ship Visual Components, page templates, and class packs that are imported into the user's site on activation.",
    risk: "medium",
    surfaces: ["admin", "manifest"]
  },
  {
    permission: "frontend.scripts",
    label: "Inject scripts into published pages",
    description: "Allows the plugin to ship a JavaScript file that is loaded on every published page (analytics, third-party widgets, custom runtimes).",
    risk: "high",
    surfaces: ["frontend", "manifest"]
  },
  {
    permission: "frontend.tracker",
    label: "Receive frontend analytics events",
    description: "Allows the plugin to receive structured tracker events from published pages and store them in plugin-owned storage.",
    risk: "medium",
    surfaces: ["frontend", "server", "manifest"]
  },
  {
    permission: "unstable.internals",
    label: "Use unstable internal APIs",
    description: "Reserved for trusted first-party plugins that need unstable host internals.",
    risk: "dangerous",
    surfaces: ["admin", "editor", "server", "cms"]
  }
];
var capabilityByPermission = new Map(PLUGIN_CAPABILITIES.map((capability) => [capability.permission, capability]));
// src/core/plugin-sdk/builders/defineModule.ts
function defineModule(config) {
  if (typeof config.id !== "string" || !config.id.includes(".")) {
    throw new Error(`[plugin-sdk] Module id "${config.id}" must be namespaced as "<pluginId>.<name>".`);
  }
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    category: config.category,
    version: config.version ?? "1.0.0",
    defaults: config.defaults,
    schema: config.schema,
    canHaveChildren: config.canHaveChildren,
    htmlTag: config.htmlTag,
    render: (props, children) => config.render({ props, children }),
    ...config.preview ? { preview: (props, children) => config.preview({ props, children }) } : {}
  };
}
// src/core/plugin-sdk/builders/controls.ts
var control = {
  text(label, options = {}) {
    return { type: "text", label, ...options };
  },
  textarea(label, options = {}) {
    return { type: "textarea", label, ...options };
  },
  number(label, options = {}) {
    return { type: "number", label, ...options };
  },
  color(label, options = {}) {
    return { type: "color", label, ...options };
  },
  select(label, optionsOrOptionsList) {
    const list = Array.isArray(optionsOrOptionsList) ? optionsOrOptionsList : optionsOrOptionsList.options;
    const description = Array.isArray(optionsOrOptionsList) ? undefined : optionsOrOptionsList.description;
    return { type: "select", label, options: list, ...description ? { description } : {} };
  },
  toggle(label, options = {}) {
    return { type: "toggle", label, ...options };
  },
  image(label, options = {}) {
    return { type: "image", label, ...options };
  },
  url(label, options = {}) {
    return { type: "url", label, ...options };
  }
};
// src/core/plugin-sdk/builders/html.ts
var HTML_ESCAPE_RE = /[&<>"']/g;
var HTML_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function escapeHtml(value) {
  return value.replace(HTML_ESCAPE_RE, (ch) => HTML_ESCAPE_MAP[ch]);
}
var RAW_BRAND = Symbol.for("@pagebuilder/plugin-sdk/raw");
function isRawHtml(value) {
  return Boolean(value) && typeof value === "object" && value[RAW_BRAND] === true;
}
function renderInterpolation(value) {
  if (value === null || value === undefined)
    return "";
  if (typeof value === "string")
    return escapeHtml(value);
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (isRawHtml(value))
    return value.value;
  if (Array.isArray(value))
    return value.map(renderInterpolation).join("");
  console.warn("[plugin-sdk:html] Unsupported interpolation type", typeof value, value);
  return escapeHtml(String(value));
}
function html(strings, ...values) {
  let out = "";
  for (let i = 0;i < strings.length; i++) {
    out += strings[i];
    if (i < values.length)
      out += renderInterpolation(values[i]);
  }
  return out;
}
// examples/plugins/showcase/modules/eventCounter.ts
var eventCounter_default = defineModule({
  id: "acme.showcase.event-counter",
  name: "Event Counter",
  description: "Renders a placeholder count badge — wired by the showcase frontend tracker bundle on the live page.",
  category: "Showcase",
  htmlTag: "div",
  defaults: {
    label: "Tracked events",
    eventName: "page-view"
  },
  schema: {
    label: control.text("Label"),
    eventName: control.text("Event to count")
  },
  render: ({ props }) => {
    const css = `
      .pb-showcase-counter{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:#111;color:#fff;font-family:ui-monospace,monospace;font-size:0.85rem;}
      .pb-showcase-counter span{color:#9ca3af;}
      .pb-showcase-counter strong{color:#fff;}
    `;
    return {
      html: html`
        <div class="pb-showcase-counter" data-pb-counter="${props.eventName}">
          <span>${props.label}</span>
          <strong data-pb-counter-value>0</strong>
        </div>
      `,
      css
    };
  }
});

// examples/plugins/showcase/modules/callout.ts
var callout_default = defineModule({
  id: "acme.showcase.callout",
  name: "Callout",
  description: "Boxed text with a tone color, perfect for tip/warning/info blocks.",
  category: "Showcase",
  htmlTag: "aside",
  defaults: {
    heading: "Heads up",
    body: "This is a Showcase callout — install the pack and add me from the module library.",
    tone: "info"
  },
  schema: {
    heading: control.text("Heading"),
    body: control.textarea("Body", { rows: 4 }),
    tone: control.select("Tone", [
      { label: "Info (blue)", value: "info" },
      { label: "Warning (amber)", value: "warning" },
      { label: "Danger (red)", value: "danger" },
      { label: "Success (green)", value: "success" }
    ])
  },
  render: ({ props }) => {
    const palette = {
      info: "#1d4ed8",
      warning: "#d97706",
      danger: "#dc2626",
      success: "#16a34a"
    };
    const css = `
      .pb-showcase-callout{border-radius:8px;padding:14px 18px;border:1px solid ${palette[props.tone]};background:rgba(0,0,0,0.04);font-family:inherit;line-height:1.5;}
      .pb-showcase-callout strong{display:block;margin-bottom:4px;font-size:0.95em;}
    `;
    return {
      html: html`
        <aside class="pb-showcase-callout pb-showcase-callout--${props.tone}">
          <strong>${props.heading}</strong>
          ${props.body}
        </aside>
      `,
      css
    };
  }
});

// examples/plugins/showcase/__modules-facade.ts
var __modules_facade_default = [eventCounter_default, callout_default];
export {
  __modules_facade_default as default
};
