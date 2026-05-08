// examples/plugins/showcase/server/index.ts
var STATUS_TAG = "<!-- plugin:acme.showcase -->";
var mod = {
  install(api) {
    api.plugin.log("Showcase plugin installed");
  },
  activate(api) {
    api.plugin.log("Showcase plugin activated");
    const events = api.cms.storage.collection("events");
    api.cms.routes.get("/status", "plugins.manage", async () => {
      const all = await events.list();
      const byEvent = {};
      for (const record of all) {
        const name = String(record.data.name || "unknown");
        byEvent[name] = (byEvent[name] || 0) + 1;
      }
      return {
        ok: true,
        plugin: api.plugin.id,
        total: all.length,
        byEvent
      };
    });
    api.cms.routes.post("/clear", "plugins.manage", async () => {
      const all = await events.list();
      await Promise.all(all.map((r) => events.delete(r.id)));
      return { ok: true, deleted: all.length };
    });
    api.cms.hooks.on("tracker.event", async (evt) => {
      if (evt.pluginId !== api.plugin.id && evt.pluginId !== "__implicit__")
        return;
      const prefix = api.cms.settings.get("eventLabelPrefix") ?? "";
      const storeOutbound = api.cms.settings.get("storeOutboundClicks") ?? true;
      if (evt.eventName === "link-click" && !storeOutbound)
        return;
      try {
        await events.create({
          name: prefix ? `${prefix}:${evt.eventName}` : evt.eventName,
          page: evt.pagePath || "",
          visitor: evt.visitorId || "",
          session: evt.sessionId || "",
          payload: JSON.stringify(evt.payload || {}),
          "received-at": evt.receivedAt
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        api.plugin.log("storage failed", message);
      }
    });
    api.cms.hooks.filter("publish.html", (html) => {
      if (typeof html !== "string")
        return html;
      return html.replace("</body>", `${STATUS_TAG}
</body>`);
    });
  },
  deactivate(api) {
    api.plugin.log("Showcase plugin deactivated");
  },
  async uninstall(api) {
    const events = api.cms.storage.collection("events");
    const all = await events.list();
    await Promise.all(all.map((r) => events.delete(r.id)));
    api.plugin.log(`Showcase plugin removed ${all.length} events`);
  }
};
var server_default = mod;
var install = mod.install;
var activate = mod.activate;
var deactivate = mod.deactivate;
var uninstall = mod.uninstall;
export {
  uninstall,
  install,
  server_default as default,
  deactivate,
  activate
};
