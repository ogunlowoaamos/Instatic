/**
 * Task #392 — Zoom not working: Toolbar buttons + trackpad pinch don't sync canvas
 *
 * WHY THESE GATES EXIST
 * ─────────────────────
 * User report (message #1671 / Task #392):
 *   "Zoom in and out is not working. When I am clicking buttons, it doesn't zoom in
 *   and out. When I use zoom on my trackpad, it actually zooms the entire page
 *   instead of only the canvas."
 *
 * Follow-up report (message #1732):
 *   "Buttons are working now, and zoom out is working too with trackpad.
 *   When I zoom IN with trackpad, it zooms the entire thing, including the
 *   panels and everything."
 *
 * Three distinct root causes, three sets of gates:
 *
 * ── Gate 1 — Toolbar / keyboard zoom never updates the DOM ──────────────────
 *
 * `useCanvas.ts` manages a `transformRef` that drives `style.transform` on the
 * canvas transform layer.  On mount it reads `zoom / panX / panY` from the
 * Zustand store ONCE via `getState()` (intentional — avoids re-renders during
 * 60fps gestures).
 *
 * The keyboard shortcut handler calls `zoomIn()` / `zoomOut()` — Zustand
 * actions — but NEVER syncs `transformRef.current` or calls
 * `applyTransformToDOM()` afterward.  Toolbar buttons in `ZoomControls.tsx`
 * call the same Zustand actions and face the same problem: the DOM transform
 * layer is NEVER updated.
 *
 * Required fix (two acceptable approaches):
 *   A) In `handleKeyDown`, after calling `zoomIn()` / `zoomOut()`, immediately
 *      read the new value via `useEditorStore.getState()` and apply it:
 *        const { zoom, panX, panY } = useEditorStore.getState()
 *        transformRef.current = { zoom, panX, panY }
 *        applyTransformToDOM(transformRef.current)
 *
 *   B) Add a `useEditorStore.subscribe(...)` in the hook that reacts when
 *      `zoom / panX / panY` changes from an external source and calls
 *      `applyTransformToDOM`.  The subscription MUST guard against false
 *      positives from its own debounce commits (compare vs. transformRef).
 *
 * Gate activation condition: this gate fires immediately (not adaptive-skip).
 * It checks whether the keyboard handler syncs the DOM after calling zoomIn /
 * zoomOut.  Gate goes green when either fix approach lands.
 *
 * ── Gate 2 — touch-action: none (necessary for mobile/touch, not sufficient
 *             for Mac desktop trackpad) ────────────────────────────────────
 *
 * `touch-action: none` prevents the browser from claiming ownership of touch
 * pointer events on mobile/tablet.  Required by @use-gesture/react docs.
 * IMPORTANT: this does NOT prevent browser zoom on Mac desktop trackpad (which
 * uses wheel events, not touch events) — see Gate 4 for the Mac desktop fix.
 *
 * Required: `touch-action: none` in the CanvasRoot CSS module.
 *
 * ── Gate 3 — resetView pattern (reference) ──────────────────────────────────
 *
 * Documents the correct pattern used by Shift+1.
 *
 * ── Gate 4 — Non-passive document wheel listener prevents Mac trackpad
 *             browser zoom (the real fix for message #1732) ────────────────
 *
 * On Mac, trackpad pinch sends `wheel` events with `ctrlKey: true`.  The
 * browser's default response to ctrlKey+wheel is to zoom the entire viewport.
 * `touch-action: none` (Gate 2) only blocks TOUCH events — it has no effect
 * on wheel events.  React 17+ registers wheel handlers as passive by default
 * through its synthetic event system, so `event.preventDefault()` inside React's
 * `onWheel` handler is SILENTLY IGNORED.
 *
 * The asymmetry the user observed (zoom OUT works, zoom IN does not): when the
 * browser is already at 100% minimum zoom, the browser floor prevents ctrlKey+
 * wheel-down from zooming out — but ctrlKey+wheel-up freely zooms in, causing
 * the entire viewport (panels + toolbar) to scale.
 *
 * Required fix: add a NON-PASSIVE document-level wheel listener in useCanvas.ts
 * that calls e.preventDefault() when e.ctrlKey || e.metaKey.  This must be a
 * direct DOM addEventListener call (not a React synthetic handler) with
 * { passive: false } to ensure preventDefault is honoured.
 *
 * @see Task #392  — user bug reports (messages #1717, #1732)
 * @see src/admin/pages/site/hooks/useCanvas.ts  — transformRef / applyTransformToDOM / wheel listener
 * @see src/admin/pages/site/components/Canvas/CanvasRoot.tsx  — touch-action
 */

import { describe, it, expect } from 'bun:test'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

const PROJECT_ROOT = join(import.meta.dir, '../../../')
const USE_CANVAS_PATH = join(PROJECT_ROOT, 'src/admin/pages/site/hooks/useCanvas.ts')
const CANVAS_ROOT_PATH = join(PROJECT_ROOT, 'src/admin/pages/site/canvas/CanvasRoot.tsx')
const CANVAS_ROOT_CSS_PATH = join(PROJECT_ROOT, 'src/admin/pages/site/canvas/CanvasRoot.module.css')

// ─── Gate 1: keyboard zoom handler must sync DOM after store action ────────────

describe('Gate 1 — useCanvas keyboard zoom handler syncs DOM after zoomIn/zoomOut', () => {
  /**
   * INTENTIONALLY FAILING — Task #392
   *
   * The `handleKeyDown` callback calls `zoomIn()` / `zoomOut()` from the Zustand
   * store, which updates `s.zoom`.  But `transformRef.current` and
   * `applyTransformToDOM` are never called in that path, so the canvas transform
   * layer stays frozen at the pre-click zoom level.
   *
   * Fix: After calling zoomIn()/zoomOut() in handleKeyDown, OR via a subscribe,
   * ensure the DOM transform is updated.
   *
   * Detected by: presence of `getState()` call in/after the zoom key handlers,
   * OR a `subscribe` call that watches zoom/panX/panY.
   */

  it('useCanvas.ts exists', () => {
    expect(existsSync(USE_CANVAS_PATH)).toBe(true)
  })

  it('[FAILING] handleKeyDown syncs transformRef after zoomIn/zoomOut (getState pattern OR subscribe pattern)', () => {
    const source = readFileSync(USE_CANVAS_PATH, 'utf8')

    // Pattern A: After calling zoomIn()/zoomOut() in keyboard handler, the hook reads
    // the new value back from the store and applies it to the DOM.
    // We look for getState() called in the context of the zoom key handler.
    //
    // In the current broken implementation, getState() is ONLY called on mount
    // (in a useEffect with no deps). The handleKeyDown callback only calls
    // zoomIn() / zoomOut() with no follow-up DOM write.
    //
    // Pattern B: A useEditorStore.subscribe() call that watches zoom/panX/panY
    // and calls applyTransformToDOM (or similar) when the values change externally.

    const hasSubscribe = source.includes('useEditorStore.subscribe')

    // Pattern A: getState() used inside or after the keyboard zoom action.
    // The on-mount useEffect wraps the ONLY current getState() call.
    // A new getState() in handleKeyDown (outside the mount effect) is the fix signal.
    //
    // We detect "getState() is called in a non-mount context that also contains zoomIn/zoomOut":
    const handleKeyDownBlock = source.match(
      /handleKeyDown\s*=\s*useCallback[\s\S]*?\],\s*\[[\s\S]*?\]\s*\)/,
    )
    const hasGetStateInKeyHandler =
      handleKeyDownBlock !== null &&
      handleKeyDownBlock[0].includes('getState()')

    const hasFix = hasSubscribe || hasGetStateInKeyHandler

    if (!hasFix) {
      throw new Error(
        '[Gate 1 — Task #392] useCanvas.ts does not sync the canvas DOM transform\n' +
          'after toolbar / keyboard zoom actions.\n\n' +
          'Symptom: clicking the + / − zoom buttons in the toolbar has no visible effect;\n' +
          'the canvas stays at the same zoom level despite the Zustand store updating.\n\n' +
          'Root cause: `handleKeyDown` calls `zoomIn()` / `zoomOut()` (Zustand actions)\n' +
          'but never updates `transformRef.current` or calls `applyTransformToDOM()`.\n' +
          'The toolbar ZoomControls.tsx has the same problem — it calls store actions\n' +
          'but useCanvas has no subscription to react to those changes.\n\n' +
          'Required fix (pick one):\n' +
          '  A) After zoomIn()/zoomOut() in handleKeyDown:\n' +
          '       const { zoom, panX, panY } = useEditorStore.getState()\n' +
          '       transformRef.current = { zoom, panX, panY }\n' +
          '       applyTransformToDOM(transformRef.current)\n\n' +
          '  B) Add a useEditorStore.subscribe() that reacts to external zoom/pan changes:\n' +
          '       useEditorStore.subscribe((state) => {\n' +
          '         const { zoom, panX, panY } = state\n' +
          '         const cur = transformRef.current\n' +
          '         if (zoom !== cur.zoom || panX !== cur.panX || panY !== cur.panY) {\n' +
          '           transformRef.current = { zoom, panX, panY }\n' +
          '           applyTransformToDOM(transformRef.current)\n' +
          '         }\n' +
          '       })\n\n' +
          'Both toolbar button clicks and keyboard shortcuts (+/-) are affected.',
      )
    }

    expect(hasFix).toBe(true)
  })
})

// ─── Gate 2: CanvasRoot must have touch-action: none ──────────────────────────

describe('Gate 2 — CanvasRoot canvas element must set touch-action: none', () => {
  /**
   * INTENTIONALLY FAILING — Task #392
   *
   * On macOS, trackpad two-finger pinch produces wheel events with ctrlKey=true.
   * React 17+ and many browsers register wheel listeners as passive by default,
   * meaning event.preventDefault() is silently ignored and the browser handles
   * the zoom (entire-page zoom instead of canvas-only zoom).
   *
   * @use-gesture/react is configured with `wheel: { eventOptions: { passive: false } }`
   * which should override this, but `touch-action: none` on the canvas element is
   * REQUIRED by @use-gesture/react docs for reliable interception of all
   * pointer / touch / pinch events.
   *
   * Fix: Add `touchAction: 'none'` to the canvas root <div> style in CanvasRoot.tsx.
   */

  it('CanvasRoot.tsx exists', () => {
    expect(existsSync(CANVAS_ROOT_PATH)).toBe(true)
  })

  it('[FAILING] CanvasRoot canvas element has touch-action: none to prevent browser pinch-zoom takeover', () => {
    const source = readFileSync(CANVAS_ROOT_PATH, 'utf8')

    // Also check CSS module file if it exists (post-Task #399 CSS module migration)
    const cssModulePath = CANVAS_ROOT_PATH.replace('.tsx', '.module.css')
    const cssModuleSource = existsSync(cssModulePath) ? readFileSync(cssModulePath, 'utf8') : ''

    // Accept the post-CSS-module contract only.
    const hasTouchActionNone =
      cssModuleSource.includes('touch-action: none')  // CSS module (Task #399)

    if (!hasTouchActionNone) {
      throw new Error(
        '[Gate 2 — Task #392] CanvasRoot.tsx canvas element is missing touch-action: none.\n\n' +
          'Symptom: two-finger trackpad pinch triggers whole-page browser zoom instead\n' +
          'of the canvas zoom handler. The browser claims ownership of the pinch gesture\n' +
          'before @use-gesture/react can intercept it.\n\n' +
          'Fix: Add touchAction: \'none\' to the canvas root <div> style:\n\n' +
          '  style={{\n' +
          '    ...\n' +
          '    touchAction: \'none\',  // ← add this\n' +
          '  }}\n\n' +
          'This is required by @use-gesture/react for reliable gesture interception\n' +
          '(see https://use-gesture.netlify.app/docs/extras/#touch-action).\n' +
          'Without it, passive event listeners cannot call preventDefault() and the\n' +
          'browser handles pinch as a page-level zoom event.',
      )
    }

    expect(hasTouchActionNone).toBe(true)
  })
})

// ─── Gate 3: useCanvas resetView keyboard shortcut must also sync DOM ─────────

describe('Gate 3 — resetView keyboard shortcut (Shift+1) already correctly syncs DOM', () => {
  /**
   * PASSING — documents the correct pattern that zoomIn/zoomOut should follow.
   *
   * The Shift+1 / resetView path in handleKeyDown correctly:
   *   1. Calls resetView() (Zustand action)
   *   2. Manually sets transformRef.current = { zoom: 1, panX: 0, panY: 0 }
   *   3. Calls applyTransformToDOM(transformRef.current)
   *
   * This is the pattern that the zoomIn/zoomOut paths are MISSING.
   */

  it('Shift+1 resetView handler explicitly syncs transformRef and DOM (reference pattern)', () => {
    const source = readFileSync(USE_CANVAS_PATH, 'utf8')

    // The resetView keyboard path explicitly updates transformRef and calls applyTransformToDOM.
    // We look for the pattern: resetView() followed by transformRef.current = {...} and applyTransformToDOM
    const hasResetViewSync =
      source.includes('resetView()') &&
      source.includes('transformRef.current = {') &&
      source.includes('applyTransformToDOM(transformRef.current)')

    expect(hasResetViewSync).toBe(true)
  })
})

// ─── Gate 4: useCanvas must have a non-passive document wheel listener ────────

describe('Gate 4 — useCanvas must prevent Mac trackpad browser zoom via non-passive wheel listener', () => {
  /**
   * Root cause (user report message #1732):
   *   "When I zoom IN with trackpad, it zooms the entire thing, including the
   *   panels and everything, so it gets out of view."
   *
   * `touch-action: none` (Gate 2) only prevents browser claim of TOUCH events
   * on mobile — it has zero effect on wheel events on Mac desktop.
   *
   * On Mac, trackpad pinch = wheel event with ctrlKey=true.  The browser's
   * default for ctrlKey+wheel is page-level zoom.  React 17+ registers wheel
   * handlers as PASSIVE, so event.preventDefault() inside React's onWheel is
   * silently ignored.
   *
   * Fix: add a direct DOM addEventListener('wheel', ..., { passive: false })
   * at document scope in useCanvas.ts that calls e.preventDefault() when
   * e.ctrlKey || e.metaKey.  This fires before the browser zoom logic and is
   * not subject to React's passive-event restrictions.
   */

  it('useCanvas.ts exists', () => {
    expect(existsSync(USE_CANVAS_PATH)).toBe(true)
  })

  it('useCanvas.ts registers a non-passive document wheel listener that prevents ctrlKey/metaKey browser zoom', () => {
    const source = readFileSync(USE_CANVAS_PATH, 'utf8')

    // Must have a document.addEventListener('wheel', ...) call
    const hasDocumentWheelListener = source.includes("document.addEventListener('wheel'")

    // Must mark it as { passive: false }
    const hasPassiveFalse =
      source.includes("{ passive: false }") ||
      source.includes("{passive: false}")

    // Must call preventDefault when ctrlKey or metaKey
    const hasCtrlKeyPrevention =
      (source.includes('e.ctrlKey') || source.includes('event.ctrlKey')) &&
      (source.includes('e.preventDefault()') || source.includes('event.preventDefault()'))

    // Must clean up on unmount via removeEventListener
    const hasCleanup = source.includes("document.removeEventListener('wheel'")

    if (!hasDocumentWheelListener) {
      throw new Error(
        '[Gate 4 — Task #392] useCanvas.ts is missing a document-level non-passive wheel listener.\n\n' +
          'Symptom: Mac trackpad pinch-to-zoom IN zooms the entire browser viewport\n' +
          '(panels, toolbar, canvas all scale together).\n\n' +
          'Root cause: touch-action: none prevents TOUCH events (mobile only). On Mac desktop,\n' +
          'trackpad pinch = wheel event with ctrlKey=true. React registers wheel handlers as\n' +
          'passive (event.preventDefault() silently ignored). The browser zoom fires before\n' +
          'any JS canvas zoom logic.\n\n' +
          'The asymmetry (zoom out OK, zoom in broken): the browser has a 100% floor — it\n' +
          'refuses to zoom below 100%, so pinch-to-zoom-out hits the floor and appears to\n' +
          'work. Pinch-to-zoom-in has no ceiling, so the browser zoom wins freely.\n\n' +
          'Required fix in useCanvas.ts:\n\n' +
          '  useEffect(() => {\n' +
          '    const preventBrowserZoom = (e: WheelEvent) => {\n' +
          '      if (e.ctrlKey || e.metaKey) e.preventDefault()\n' +
          '    }\n' +
          '    document.addEventListener(\'wheel\', preventBrowserZoom, { passive: false })\n' +
          '    return () => document.removeEventListener(\'wheel\', preventBrowserZoom)\n' +
          '  }, [])\n\n' +
          'This is the authoritative fix used by Figma, Excalidraw, and all professional\n' +
          'canvas-based web apps.\n'
      )
    }

    expect(hasDocumentWheelListener).toBe(true)
    expect(hasPassiveFalse).toBe(true)
    expect(hasCtrlKeyPrevention).toBe(true)
    expect(hasCleanup).toBe(true)
  })
})

// ─── Gate 5: Safari gesturestart/gesturechange listeners ──────────────────────

describe('Gate 5 — useCanvas must also block Safari GestureEvent to prevent browser zoom', () => {
  /**
   * PASSING — documents the Safari-specific layer of the cross-platform fix.
   *
   * On macOS Safari, trackpad pinch does NOT produce WheelEvent with ctrlKey=true
   * (the Chrome/Firefox path handled by Gate 4).  Instead Safari fires its
   * proprietary GestureEvent API: gesturestart → gesturechange → gestureend.
   *
   * Without a non-passive gesturestart/gesturechange listener, Safari ignores the
   * wheel prevention entirely and applies native viewport zoom — same symptom as
   * the Chrome bug (panels + canvas scale together) but caused by a different
   * event family.
   *
   * Fix: register non-passive document-level listeners for both event types that
   * call e.preventDefault().  These must be present alongside the wheel listener
   * from Gate 4 for full cross-platform coverage.
   *
   * Gate goes red if these listeners are removed — protects against regression
   * when refactoring the useCanvas effect block.
   */

  it('useCanvas.ts registers non-passive gesturestart listener (Safari pinch)', () => {
    const source = readFileSync(USE_CANVAS_PATH, 'utf8')

    const hasGestureStart =
      source.includes("document.addEventListener('gesturestart'") ||
      source.includes('document.addEventListener("gesturestart"')

    if (!hasGestureStart) {
      throw new Error(
        '[Gate 5 — Task #392] useCanvas.ts is missing gesturestart listener.\n\n' +
          'Safari on macOS uses GestureEvent (gesturestart / gesturechange) for trackpad\n' +
          'pinch, NOT wheel events with ctrlKey=true (the Chrome/Firefox path).\n\n' +
          'Without this listener, Safari users see the entire viewport zoom (panels,\n' +
          'toolbar, canvas all scale) when pinching on the canvas.\n\n' +
          'Required addition inside the same useEffect as the wheel listener:\n\n' +
          "  const preventGestureZoom = (e: Event) => e.preventDefault()\n" +
          "  document.addEventListener('gesturestart', preventGestureZoom, { passive: false } as AddEventListenerOptions)\n" +
          "  document.addEventListener('gesturechange', preventGestureZoom, { passive: false } as AddEventListenerOptions)\n" +
          '  // cleanup:\n' +
          "  document.removeEventListener('gesturestart', preventGestureZoom)\n" +
          "  document.removeEventListener('gesturechange', preventGestureZoom)\n",
      )
    }

    expect(hasGestureStart).toBe(true)
  })

  it('useCanvas.ts registers non-passive gesturechange listener (Safari ongoing pinch)', () => {
    const source = readFileSync(USE_CANVAS_PATH, 'utf8')

    const hasGestureChange =
      source.includes("document.addEventListener('gesturechange'") ||
      source.includes('document.addEventListener("gesturechange"')

    const hasGestureCleanup =
      source.includes("document.removeEventListener('gesturestart'") ||
      source.includes("document.removeEventListener('gesturechange'")

    if (!hasGestureChange) {
      throw new Error(
        '[Gate 5b — Task #392] useCanvas.ts is missing gesturechange listener.\n\n' +
          'gesturestart alone is not enough — Safari fires gesturechange continuously\n' +
          'throughout the pinch gesture.  Without preventing gesturechange, the viewport\n' +
          'zoom still accumulates on each event tick during the gesture.\n\n' +
          'Add gesturechange listener alongside gesturestart (see Gate 5 error for full fix).',
      )
    }

    expect(hasGestureChange).toBe(true)
    expect(hasGestureCleanup).toBe(true)
  })
})

// ─── Gate 6: trackpad pinch must not be handled twice ───────────────────────

describe('Gate 6 — useCanvas lets the native wheel path own trackpad pinch zoom', () => {
  /**
   * Trackpad pinch in Chrome/Firefox arrives as ctrlKey/metaKey wheel events.
   * useCanvas already handles those events with a native non-passive wheel
   * listener and `zoomFromWheelDelta`.  @use-gesture also enables pinch-on-wheel
   * by default, which sends the same physical pinch into `onPinch` as well.
   *
   * That double application makes tiny trackpad gestures jump dramatically and
   * can drive the canvas to MAX_ZOOM in a few events.  The regression gate below
   * requires useCanvas to opt out of @use-gesture's wheel-to-pinch path.
   */
  it('disables @use-gesture pinchOnWheel so ctrl-wheel zoom is applied once', () => {
    const source = readFileSync(USE_CANVAS_PATH, 'utf8')
    const useGestureConfig = source.slice(source.indexOf('const bind = useGesture'))

    const disablesPinchOnWheel =
      /pinch\s*:\s*\{[\s\S]*?pinchOnWheel\s*:\s*false/.test(useGestureConfig)

    if (!disablesPinchOnWheel) {
      throw new Error(
        '[Gate 6 — Trackpad pinch sensitivity] useCanvas.ts still allows @use-gesture pinchOnWheel.\n\n' +
          'Root cause: macOS trackpad pinch is a ctrlKey/metaKey WheelEvent. useCanvas handles\n' +
          'that event natively in handleWheel, but @use-gesture also converts the same event\n' +
          'into onPinch by default. The same physical pinch is therefore applied twice, making\n' +
          'small gestures jump to extreme zoom levels.\n\n' +
          'Required fix in the useGesture config:\n\n' +
          '  pinch: {\n' +
          '    eventOptions: { passive: false },\n' +
          '    pinchOnWheel: false,\n' +
          '  }\n',
      )
    }

    expect(disablesPinchOnWheel).toBe(true)
  })
})

// ─── Gate 7: standard browser reset shortcut ────────────────────────────────

describe('Gate 7 — useCanvas supports Cmd/Ctrl+0 reset-to-100 shortcut', () => {
  /**
   * Users expect the standard browser zoom reset shortcut to reset the canvas
   * zoom, not only the older Shift+1 app shortcut.  Because browser focus can
   * be in floating panels or other editor chrome, the shortcut must be wired at
   * document scope and guarded so it does not intercept text editing.
   */
  it('registers a document keydown listener for Cmd/Ctrl+0 reset', () => {
    const source = readFileSync(USE_CANVAS_PATH, 'utf8')

    const hasDocumentKeydown = source.includes("document.addEventListener('keydown'")
    const hasModifierZero =
      /(?:e|event)\.(?:metaKey|ctrlKey)[\s\S]*?(?:e|event)\.(?:metaKey|ctrlKey)[\s\S]*?\.key\s*===\s*['"]0['"]/.test(source) ||
      /\.key\s*===\s*['"]0['"][\s\S]*?(?:e|event)\.(?:metaKey|ctrlKey)[\s\S]*?(?:e|event)\.(?:metaKey|ctrlKey)/.test(source)
    const callsResetView = source.includes('resetView()')
    const syncsDom =
      source.includes('transformRef.current = { zoom: 1, panX: 0, panY: 0 }') &&
      source.includes('applyTransformToDOM(transformRef.current)')
    const guardsInputs =
      source.includes("target.tagName === 'INPUT'") &&
      source.includes("target.tagName === 'TEXTAREA'") &&
      source.includes('target.isContentEditable')

    if (!hasModifierZero) {
      throw new Error(
        '[Gate 7 — Cmd/Ctrl+0 reset] useCanvas.ts does not handle the standard reset shortcut.\n\n' +
          'Required behavior: Command+0 on Mac and Control+0 elsewhere should reset the canvas\n' +
          'to zoom 100% and pan 0,0. This should call resetView(), sync transformRef, and apply\n' +
          'the DOM transform immediately.\n',
      )
    }

    expect(hasDocumentKeydown).toBe(true)
    expect(hasModifierZero).toBe(true)
    expect(callsResetView).toBe(true)
    expect(syncsDom).toBe(true)
    expect(guardsInputs).toBe(true)
  })
})
