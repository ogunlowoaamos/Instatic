/**
 * useRuntimePreviewBuild — owns the runtime-preview iframe build state.
 *
 * Extracted from CanvasRuntimePreview so two render surfaces (the iframe
 * itself, and the status pill in BreakpointFrame's label row) can share one
 * source of truth without spawning duplicate fetches.
 *
 * Build trigger contract:
 * - The build does NOT auto-rebuild on every site change. It used to (when
 *   the iframe overlaid the design canvas), which caused scripts to
 *   re-execute on every keystroke — confetti firing per character, etc.
 * - The build DOES rebuild when something that actually affects the bundle
 *   or the rendered HTML changes:
 *   - script-file content (id + content)
 *   - packageJson (deps added/removed/version edits)
 *   - site.runtime (script config, dependency lock)
 *   - active page navigation
 *   - active breakpoint navigation
 *   - templateContext (entry currently being previewed for templates)
 * - For non-bundle visual edits (class CSS, node prop tweaks) the user
 *   explicitly calls `refresh()` to pull a fresh build. The preview is a
 *   user-controlled snapshot, not an always-live mirror.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Page, SiteDocument } from '@core/page-tree/types'
import type { TemplateRenderDataContext } from '@core/templates/dynamicBindings'
import { useEditorStore } from '@core/editor-store/store'
import { buildCmsRuntimePreview } from '@core/persistence/cmsRuntime'
import {
  collectRuntimeScripts,
  normalizeSiteRuntimeConfig,
  type SiteRuntimeDiagnostic,
} from '@core/site-runtime'
import { materializeRuntimePreviewDocument } from './runtimePreviewDocument'

export type RuntimePreviewStatus = 'idle' | 'building' | 'ready' | 'error'

export interface RuntimePreviewBuildState {
  /** Final HTML to inject into the iframe `srcDoc`. Empty string until first build resolves. */
  srcDoc: string
  /** Build lifecycle status. */
  status: RuntimePreviewStatus
  /** Diagnostics surfaced by the server build (esbuild errors, etc.). */
  diagnostics: SiteRuntimeDiagnostic[]
  /** True when the active page has at least one runtime script enabled in canvas. */
  hasScripts: boolean
  /** Force a rebuild from current site state, bypassing the bundle-signature memo. */
  refresh: () => void
}

interface UseRuntimePreviewBuildArgs {
  page: Page
  breakpointId: string
  templateContext?: TemplateRenderDataContext
  /** Gates the effect — pass `false` while in design mode to skip building entirely. */
  enabled: boolean
}

function computeBuildSignature(
  site: SiteDocument | null,
  pageId: string,
  breakpointId: string,
  templateContext: TemplateRenderDataContext | undefined,
): string | null {
  if (!site) return null
  const scriptInputs = site.files
    .filter((file) => file.type === 'script')
    .map((file) => [file.id, file.content ?? ''])
  return JSON.stringify({
    scripts: scriptInputs,
    packageJson: site.packageJson,
    runtime: site.runtime,
    pageId,
    breakpointId,
    templateContext: templateContext ?? null,
  })
}

export function useRuntimePreviewBuild({
  page,
  breakpointId,
  templateContext,
  enabled,
}: UseRuntimePreviewBuildArgs): RuntimePreviewBuildState {
  const site = useEditorStore((s) => s.site)
  const [srcDoc, setSrcDoc] = useState('')
  const [diagnostics, setDiagnostics] = useState<SiteRuntimeDiagnostic[]>([])
  const [status, setStatus] = useState<RuntimePreviewStatus>('idle')
  const [refreshNonce, setRefreshNonce] = useState(0)

  const hasScripts = useMemo(() => {
    if (!site) return false
    return collectRuntimeScripts({
      files: site.files,
      runtime: normalizeSiteRuntimeConfig(site.runtime),
      page,
      target: 'canvas',
    }).length > 0
  }, [page, site])

  const effectiveEnabled = enabled && Boolean(site)

  // Hold the latest site in a ref so the actual server fetch (debounced 350ms
  // after a signature change) always sends fresh state.
  const siteRef = useRef(site)
  siteRef.current = site

  const buildSignature = useMemo(
    () => computeBuildSignature(site, page.id, breakpointId, templateContext),
    [site, page.id, breakpointId, templateContext],
  )

  useEffect(() => {
    if (!effectiveEnabled || buildSignature === null) {
      setSrcDoc('')
      setDiagnostics([])
      setStatus('idle')
      return
    }

    let cancelled = false
    let cleanup: (() => void) | null = null
    setStatus('building')

    const timeout = window.setTimeout(() => {
      const currentSite = siteRef.current
      if (!currentSite) return
      buildCmsRuntimePreview({
        site: currentSite,
        pageId: page.id,
        breakpointId,
        templateContext,
      })
        .then((result) => {
          if (cancelled) return
          const materialized = materializeRuntimePreviewDocument(result)
          cleanup = materialized.revoke
          setSrcDoc(materialized.html)
          setDiagnostics(result.diagnostics)
          setStatus(result.diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'error' : 'ready')
        })
        .catch((error) => {
          if (cancelled) return
          setSrcDoc('')
          setDiagnostics([{
            code: 'runtime-preview-client-error',
            severity: 'error',
            message: error instanceof Error ? error.message : 'Runtime preview failed',
          }])
          setStatus('error')
        })
    }, 350)

    return () => {
      cancelled = true
      window.clearTimeout(timeout)
      cleanup?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- page.id, breakpointId
    // and templateContext are encoded in buildSignature; refreshNonce is a
    // user-triggered "rebuild now" pulse. The signature is the single source
    // of truth for "should we automatically rebuild?".
  }, [buildSignature, effectiveEnabled, refreshNonce])

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1)
  }, [])

  return { srcDoc, status, diagnostics, hasScripts, refresh }
}
