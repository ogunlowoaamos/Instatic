import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { IncomingMessage, ServerResponse } from 'node:http'

const CMS_DEV_SERVER_ORIGIN = 'http://localhost:3001'
const FILE_EXTENSION_RE = /\.[a-zA-Z0-9]+$/

function isEditorAppPath(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/index.html' ||
    pathname.startsWith('/@') ||
    pathname.startsWith('/__vite') ||
    pathname.startsWith('/src/') ||
    pathname.startsWith('/node_modules/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/uploads/')
  )
}

function shouldProxyPublicSiteRequest(req: IncomingMessage): boolean {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false
  if (!req.url) return false

  const { pathname } = new URL(req.url, CMS_DEV_SERVER_ORIGIN)
  if (isEditorAppPath(pathname)) return false

  // Bun server namespaces — explicitly proxied even though they carry a file
  // extension. The fallthrough rule below rejects anything with `.<ext>` to
  // avoid swallowing requests for editor static assets, which means we have
  // to opt in any backend route whose URL ends with `.something`.
  //   /_pb/assets/  → runtime script bundles (esbuild output)
  //   /_pb/css/     → per-site published CSS bundle (reset / framework / style)
  if (pathname.startsWith('/_pb/assets/')) return true
  if (pathname.startsWith('/_pb/css/')) return true

  return pathname === '/' || !FILE_EXTENSION_RE.test(pathname)
}

async function proxyPublicSiteRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const target = new URL(req.url ?? '/', CMS_DEV_SERVER_ORIGIN)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value) continue
    if (['connection', 'host', 'content-length'].includes(key.toLowerCase())) continue
    headers.set(key, Array.isArray(value) ? value.join(', ') : value)
  }

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      redirect: 'manual',
    })
  } catch {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('CMS development server is not reachable')
    return
  }

  const responseHeaders: Record<string, string> = {}
  upstream.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })
  res.writeHead(upstream.status, responseHeaders)

  if (req.method === 'HEAD' || !upstream.body) {
    res.end()
    return
  }

  const body = Buffer.from(await upstream.arrayBuffer())
  res.end(body)
}

function publicSiteDevProxyPlugin(): Plugin {
  return {
    name: 'page-builder-public-site-dev-proxy',
    apply: 'serve',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!shouldProxyPublicSiteRequest(req)) {
          next()
          return
        }

        void proxyPublicSiteRequest(req, res).catch((err) => {
          next(err)
        })
      })
    },
  }
}

// Stable vendor chunk groups for long-term browser caching. Vendor code
// rarely changes, so isolating it from the app code means returning users
// re-download only the (small) app chunks when we ship a new build.
//
// Notes:
//   - We deliberately do NOT chunk @codemirror / @lezer / codemirror — they
//     are already isolated via React.lazy() in CodeMirrorEditor.tsx.
//   - We deliberately do NOT chunk pixel-art-icons — it tree-shakes through
//     deep imports, and forcing a vendor chunk would pull every icon in.
function vendorChunkName(moduleId: string): string | null {
  if (!moduleId.includes('node_modules')) return null
  if (moduleId.includes('node_modules/react-dom') || /node_modules\/react(\/|\\)/.test(moduleId)) {
    return 'react-vendor'
  }
  if (moduleId.includes('node_modules/@dnd-kit') || moduleId.includes('node_modules/@use-gesture')) {
    return 'dnd-vendor'
  }
  if (moduleId.includes('node_modules/@sinclair/typebox')) return 'validation-vendor'
  if (moduleId.includes('node_modules/dompurify') || moduleId.includes('node_modules/immer')) {
    return 'state-vendor'
  }
  return null
}

// React Compiler is intentionally NOT enabled for now.
//
// We trialled it in this session and hit two issues with this codebase:
//  1) `compilationMode: 'all'` compiled the router's utility functions and
//     inserted `useMemoCache` hook calls into non-component code, breaking
//     Rules-of-Hooks at module-level helpers passed to `useSyncExternalStore`.
//  2) Even with `compilationMode: 'infer'`, the compiler's memo cache
//     occasionally retained references to immer draft sub-objects across
//     renders. After the next `produce()` call revoked those proxies,
//     selectors like `selectLayoutState` (useEditorLayoutPersistence) and
//     `selectRightSidebarExpanded` (store.ts) hit
//     `Cannot perform 'get' on a proxy that has been revoked`.
//
// The codebase is heavy on Zustand+Immer drafts, so the second issue is the
// blocker. Re-evaluate once the React Compiler has a documented strategy
// for handling immer drafts (or once we move state away from immer drafts).

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    publicSiteDevProxyPlugin(),
    react(),
  ],
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@modules': path.resolve(__dirname, 'src/modules'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@admin': path.resolve(__dirname, 'src/admin'),
      '@site': path.resolve(__dirname, 'src/admin/pages/site'),
      '@content': path.resolve(__dirname, 'src/admin/pages/content'),
      '@plugins': path.resolve(__dirname, 'src/admin/pages/plugins'),
      '@users': path.resolve(__dirname, 'src/admin/pages/users'),
      // pixel-art-icons resolves through node_modules (link: dep during local
      // dev, registry version once published). No alias needed.
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: vendorChunkName }],
        },
      },
    },
  },
  server: {
    proxy: {
      '/admin/api/cms': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // /api/agent (streaming NDJSON) and /api/agent/tool-result (browser
      // bridge response) both belong to the CMS backend — `server/router.ts`
      // is the single source of truth. The `ws: false` is the default; we
      // do not need WebSocket upgrades for the agent.
      '/api/agent': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Public-site runtime endpoints — frontend tracker POSTs, loop
      // pagination GETs, runtime asset / CSS bundles. Must be in this
      // explicit `proxy:` map (not just the GET-only middleware) because
      // the tracker uses POST and the GET-only `publicSiteDevProxyPlugin`
      // would otherwise drop those requests.
      '/_pb': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
