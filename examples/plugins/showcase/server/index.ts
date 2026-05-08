/**
 * Showcase plugin — server entrypoint.
 *
 * Demonstrates four major server surfaces:
 *   1. Storage  — CRUD over plugin-owned `events` records
 *   2. Routes   — `/status` aggregates event counts
 *   3. Hooks    — listens to `tracker.event` and persists each event
 *   4. Filters  — appends a marker to every published page so the filter
 *                 pipeline is observable from the published HTML
 */
import type { ServerPluginApi, ServerPluginModule } from '@core/plugin-sdk'

const STATUS_TAG = '<!-- plugin:acme.showcase -->'

const mod: ServerPluginModule = {
  install(api: ServerPluginApi) {
    api.plugin.log('Showcase plugin installed')
  },

  activate(api: ServerPluginApi) {
    api.plugin.log('Showcase plugin activated')

    const events = api.cms.storage.collection('events')

    api.cms.routes.get('/status', 'plugins.manage', async () => {
      const all = await events.list()
      const byEvent: Record<string, number> = {}
      for (const record of all) {
        const name = String(record.data.name || 'unknown')
        byEvent[name] = (byEvent[name] || 0) + 1
      }
      return {
        ok: true,
        plugin: api.plugin.id,
        total: all.length,
        byEvent,
      }
    })

    api.cms.routes.post('/clear', 'plugins.manage', async () => {
      const all = await events.list()
      await Promise.all(all.map((r) => events.delete(r.id)))
      return { ok: true, deleted: all.length }
    })

    api.cms.hooks.on('tracker.event', async (evt) => {
      if (evt.pluginId !== api.plugin.id && evt.pluginId !== '__implicit__') return
      try {
        await events.create({
          name: evt.eventName,
          page: evt.pagePath || '',
          visitor: evt.visitorId || '',
          session: evt.sessionId || '',
          payload: JSON.stringify(evt.payload || {}),
          'received-at': evt.receivedAt,
        })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        api.plugin.log('storage failed', message)
      }
    })

    api.cms.hooks.filter('publish.html', (html) => {
      if (typeof html !== 'string') return html
      return html.replace('</body>', `${STATUS_TAG}\n</body>`)
    })
  },

  deactivate(api: ServerPluginApi) {
    api.plugin.log('Showcase plugin deactivated')
  },

  async uninstall(api: ServerPluginApi) {
    const events = api.cms.storage.collection('events')
    const all = await events.list()
    await Promise.all(all.map((r) => events.delete(r.id)))
    api.plugin.log(`Showcase plugin removed ${all.length} events`)
  },
}

export default mod
export const install = mod.install!
export const activate = mod.activate!
export const deactivate = mod.deactivate!
export const uninstall = mod.uninstall!
