/**
 * Showcase plugin — editor entrypoint.
 *
 * Adds a toolbar button. The plugin's bundle has zero React imports;
 * the editor SDK is a tiny imperative API.
 */
import type { EditorPluginApi, EditorPluginModule } from '@core/plugin-sdk'

const mod: EditorPluginModule = {
  activate(api: EditorPluginApi) {
    api.editor.commands.register({
      id: 'acme.showcase.ping',
      label: 'Showcase Ping',
      run: () => ({ message: 'Showcase command fired' }),
    })

    api.editor.toolbar.addButton({
      id: 'acme.showcase.ping',
      label: 'Showcase',
      command: 'acme.showcase.ping',
    })
  },
}

export default mod
export const activate = mod.activate!
