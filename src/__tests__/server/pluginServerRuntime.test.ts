import { beforeEach, describe, expect, it } from 'bun:test'
import {
  activateServerPlugin,
  handleServerPluginRuntimeRequest,
  runServerPluginLifecycleHook,
  serverPluginRuntime,
} from '../../../server/cms/serverPluginRuntime'
import type { PluginManifest } from '@core/plugin-sdk'
import { createFakeDb } from './dbTestFake'

// Plugin runtime tests do not exercise DB queries — the db arg is threaded
// through for lifecycle hooks but none of the tested hooks use it.
const fakeDb = createFakeDb(async (sql) => {
  throw new Error(`Unexpected DB call in plugin runtime test: ${sql}`)
})

const workflowManifest: PluginManifest = {
  id: 'acme.workflow',
  name: 'Workflow Tools',
  version: '1.0.0',
  apiVersion: 1,
  permissions: ['cms.routes', 'cms.storage'],
  grantedPermissions: ['cms.routes', 'cms.storage'],
  resources: [],
  adminPages: [],
}

beforeEach(() => {
  serverPluginRuntime.reset()
})

describe('server plugin runtime SDK', () => {
  it('lets trusted server plugin code register authenticated backend routes', async () => {
    await activateServerPlugin(workflowManifest, {
      activate(api) {
        api.cms.routes.get('/approvals', async () => ({
          approvals: [{ pageId: 'page_home', status: 'approved' }],
        }))
      },
    }, fakeDb)

    const res = await handleServerPluginRuntimeRequest(
      new Request('http://localhost/api/cms/plugins/acme.workflow/runtime/approvals'),
      fakeDb,
    )

    expect(res?.status).toBe(200)
    expect(await res?.json()).toEqual({
      approvals: [{ pageId: 'page_home', status: 'approved' }],
    })
  })

  it('blocks backend route registration without the cms.routes permission grant', async () => {
    await expect(activateServerPlugin({
      ...workflowManifest,
      grantedPermissions: ['cms.storage'],
    }, {
      activate(api) {
        api.cms.routes.get('/approvals', async () => ({ ok: true }))
      },
    }, fakeDb)).rejects.toThrow('requires permission "cms.routes"')
  })

  it('uses the shared permission guard error format', async () => {
    await expect(activateServerPlugin({
      ...workflowManifest,
      grantedPermissions: [],
    }, {
      activate(api) {
        api.cms.routes.get('/blocked', () => ({ ok: true }))
      },
    }, fakeDb)).rejects.toThrow('Plugin "acme.workflow" requires permission "cms.routes"')
  })

  it('runs optional lifecycle hooks with plugin metadata and logging helpers', async () => {
    const calls: string[] = []
    const mod = {
      install(api) {
        calls.push(`${api.plugin.id}:${api.plugin.version}:${api.plugin.permissions.join(',')}`)
        api.plugin.log('installed')
      },
    }

    await runServerPluginLifecycleHook(workflowManifest, mod, fakeDb, 'install')

    expect(calls).toEqual(['acme.workflow:1.0.0:cms.routes,cms.storage'])
  })
})
