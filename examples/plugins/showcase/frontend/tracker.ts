/**
 * Showcase plugin — frontend bundle.
 *
 * Loaded on every published page (frontend.scripts permission). Hooks into
 * the host tracker runtime (`window.__pb`) to count events and update any
 * `<div data-pb-counter>` modules placed on the page by the canvas module
 * `acme.showcase.event-counter`.
 */

declare global {
  interface Window {
    __pb?: {
      tracker: {
        sendFor(pluginId: string, eventName: string, payload?: Record<string, unknown>): Promise<unknown>
      }
      hooks: {
        on(event: string, handler: (detail: Record<string, unknown>) => void): () => void
      }
    }
  }
}

;(function init() {
  const pb = window.__pb
  if (!pb || !pb.tracker) {
    console.warn('[acme.showcase] page runtime not available')
    return
  }

  const counts = new Map<string, number>()

  function bumpCounter(eventName: string) {
    const next = (counts.get(eventName) || 0) + 1
    counts.set(eventName, next)
    document.querySelectorAll(`[data-pb-counter="${CSS.escape(eventName)}"] [data-pb-counter-value]`).forEach((el) => {
      el.textContent = String(next)
    })
  }

  pb.hooks.on('page-view', (detail) => {
    bumpCounter('page-view')
    void pb.tracker.sendFor('acme.showcase', 'page-view', detail)
  })

  pb.hooks.on('link-click', (detail) => {
    bumpCounter('link-click')
    void pb.tracker.sendFor('acme.showcase', 'link-click', detail)
  })

  pb.hooks.on('scroll-depth', (detail) => {
    bumpCounter('scroll-depth')
    void pb.tracker.sendFor('acme.showcase', 'scroll-depth', detail)
  })
})()
