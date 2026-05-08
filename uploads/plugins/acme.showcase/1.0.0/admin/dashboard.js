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
// src/core/plugin-sdk/builders/html.ts
var RAW_BRAND = Symbol.for("@pagebuilder/plugin-sdk/raw");
// src/core/plugin-sdk/builders/adminApp.ts
function definePluginAdminApp(render) {
  return render;
}
// examples/plugins/showcase/admin/dashboard.ts
var dashboard_default = definePluginAdminApp(({ ui, h: h2, hooks, api }) => {
  const [status, setStatus] = hooks.useState(null);
  const [error, setError] = hooks.useState(null);
  const [loading, setLoading] = hooks.useState(true);
  const refresh = hooks.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.cms.routes.fetch("status");
      const body = await res.json();
      setStatus(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load status");
    } finally {
      setLoading(false);
    }
  }, []);
  hooks.useEffect(() => {
    refresh();
  }, [refresh]);
  const clearAll = hooks.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await api.cms.routes.fetch("clear", { method: "POST" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear");
      setLoading(false);
    }
  }, [refresh]);
  return h2(ui.Stack, { gap: 16 }, [
    h2(ui.Heading, { level: 2, key: "h" }, "Showcase"),
    h2(ui.Text, { variant: "muted", key: "t" }, "Open a published page in another tab; events fire automatically and appear here in real time."),
    error ? h2(ui.Alert, { tone: "danger", title: "Error", key: "e" }, error) : null,
    h2(ui.Card, { padding: 16, key: "c" }, h2(ui.Stack, { gap: 12 }, [
      h2(ui.Heading, { level: 3, key: "sh" }, "Tracker status"),
      loading ? h2(ui.Text, { variant: "muted", key: "l" }, "Loading...") : h2(ui.Code, { key: "p" }, JSON.stringify(status, null, 2)),
      h2(ui.Stack, { direction: "row", gap: 8, key: "r" }, [
        h2(ui.Button, {
          variant: "secondary",
          size: "sm",
          onClick: () => void refresh(),
          disabled: loading,
          key: "rb"
        }, "Refresh"),
        h2(ui.Button, {
          variant: "destructive",
          size: "sm",
          onClick: () => void clearAll(),
          disabled: loading || !status || status.total === 0,
          key: "cb"
        }, "Clear events")
      ])
    ]))
  ]);
});
export {
  dashboard_default as default
};
