// examples/plugins/showcase/editor/index.ts
var mod = {
  activate(api) {
    api.editor.commands.register({
      id: "acme.showcase.ping",
      label: "Showcase Ping",
      run: () => ({ message: "Showcase command fired" })
    });
    api.editor.toolbar.addButton({
      id: "acme.showcase.ping",
      label: "Showcase",
      command: "acme.showcase.ping"
    });
  }
};
var editor_default = mod;
var activate = mod.activate;
export {
  editor_default as default,
  activate
};
