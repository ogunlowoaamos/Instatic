/**
 * VCBreadcrumb — breadcrumb + back navigation rendered in the toolbar
 * while the canvas is in Visual Component edit mode.
 *
 * Renders null when `activeDocument.kind !== 'visualComponent'`.
 *
 * Layout (left → right):
 *   [← Back]  ·  Site  ›  Components  ›  [ComponentName (editable)]
 *
 * Name editing:
 *   - Click the name chip → switches to an <Input>.
 *   - Blur or Enter → validate via validateComponentName + call renameVisualComponent.
 *     On validation failure: keep the input mounted, show a role="alert" error.
 *   - Escape → revert to original name, dismiss input.
 *
 * "Adjust state during render" pattern is used to reset editing state when
 * vcId changes. No useEffect for prop sync. useEffect is used only for the
 * requestAnimationFrame focus/select on edit-mode entry.
 *
 * Architecture source: Phase 4 Layer 3 (Task #A1)
 */

import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '@site/store/store'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'
import { ChevronLeftIcon } from 'pixel-art-icons/icons/chevron-left'
import { ChevronRightIcon } from 'pixel-art-icons/icons/chevron-right'
import { validateComponentName } from '@core/visualComponents/nameValidation'
import type { VisualComponent } from '@core/visualComponents/schemas'
import styles from './VCBreadcrumb.module.css'

/**
 * Stable empty sentinel for the VC list fallback (Guideline #239).
 * A module-level constant avoids creating a new [] reference on every render,
 * which would cause useSyncExternalStore to think state changed continuously.
 */
const EMPTY_VCS: VisualComponent[] = []

export default function VCBreadcrumb() {
  // ── All hooks unconditionally at the top (Rules of Hooks) ────────────────

  const activeDocument = useEditorStore((s) => s.activeDocument)
  const exitVisualComponentMode = useEditorStore((s) => s.exitVisualComponentMode)
  const renameVisualComponent = useEditorStore((s) => s.renameVisualComponent)

  // Derive vcId synchronously — safe because it's a primitive (string | null).
  const vcId = activeDocument?.kind === 'visualComponent' ? activeDocument.vcId : null

  // Subscribe directly to the VC object for this vcId.
  // When site is null or the VC is not found, the selector returns null (a stable
  // primitive), which does NOT trigger useSyncExternalStore's "new reference"
  // detection. Returning [] from a selector would create a new reference on every
  // call, causing an infinite render loop (Guideline #239).
  const vc = useEditorStore(
    (s) => s.site?.visualComponents?.find((v) => v.id === vcId) ?? null,
  )

  const [isEditing, setIsEditing] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Adjust-state-during-render: when vcId changes, reset local editing state.
  // This avoids a useEffect for prop sync — the pattern is:
  //   "adjust component state in render when a controlling prop changes."
  const [prevVcId, setPrevVcId] = useState<string | null>(null)
  if (vcId !== prevVcId) {
    setPrevVcId(vcId)
    if (isEditing) setIsEditing(false)
    if (nameError !== null) setNameError(null)
  }

  // Focus + select on edit entry — presentation side-effect, not prop sync.
  // requestAnimationFrame ensures the input is in the DOM when .select() fires.
  useEffect(() => {
    if (!isEditing) return
    requestAnimationFrame(() => inputRef.current?.select())
  }, [isEditing])

  // ── Early returns (safe because all hooks were called above) ─────────────

  if (activeDocument?.kind !== 'visualComponent') return null
  if (!vc) return null

  // ── Event handlers ───────────────────────────────────────────────────────

  function commitRename(input: HTMLInputElement): void {
    const newName = input.value.trim()

    // No-op: name is unchanged or empty — revert and close
    if (!newName || newName === vc!.name) {
      input.value = vc!.name
      setIsEditing(false)
      setNameError(null)
      return
    }

    // Read latest VC list from store on-demand (imperative getState, not a selector
    // subscription), then fall back to the stable module-level sentinel per Guideline #239.
    const storeVCs = useEditorStore.getState().site?.visualComponents
    const currentVCs = storeVCs ?? EMPTY_VCS
    const result = validateComponentName(newName, currentVCs, vc!.id)

    if (!result.ok) {
      // Keep the input mounted so the user can correct the name
      setNameError(result.reason)
      return
    }

    // Valid rename — commit, close, clear error
    renameVisualComponent(vc!.id, newName)
    setIsEditing(false)
    setNameError(null)
  }

  function cancelRename(input: HTMLInputElement): void {
    input.value = vc!.name
    setIsEditing(false)
    setNameError(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.breadcrumb} data-testid="vc-breadcrumb">
      {/* ── Back button ─────────────────────────────────────────────────── */}
      <Button
        variant="ghost"
        size="xs"
        onClick={exitVisualComponentMode}
        data-testid="vc-breadcrumb-back"
        aria-label="Back to page"
      >
        <ChevronLeftIcon size={12} aria-hidden="true" />
        Back
      </Button>

      <span className={styles.dot} aria-hidden="true">·</span>

      {/* ── Breadcrumb path: Site / Components / <name> ─────────────── */}
      <span className={styles.chip}>Site</span>
      <ChevronRightIcon size={10} aria-hidden="true" className={styles.chevron} />
      <span className={styles.chip}>Components</span>
      <ChevronRightIcon size={10} aria-hidden="true" className={styles.chevron} />

      {/* ── Editable name chip ──────────────────────────────────────────── */}
      <span className={styles.nameChipWrapper}>
        {isEditing ? (
          <>
            <Input
              ref={inputRef}
              type="text"
              fieldSize="xs"
              defaultValue={vc.name}
              data-testid="vc-breadcrumb-name-input"
              aria-label="Component name"
              className={styles.nameInput}
              onBlur={(e) => commitRename(e.target as HTMLInputElement)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitRename(e.target as HTMLInputElement)
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelRename(e.target as HTMLInputElement)
                }
              }}
            />
            {nameError !== null && (
              <div role="alert" className={styles.error}>
                {nameError}
              </div>
            )}
          </>
        ) : (
          <span
            className={styles.nameChip}
            role="button"
            tabIndex={0}
            data-testid="vc-breadcrumb-name"
            aria-label={`Rename component: ${vc.name}`}
            onClick={() => setIsEditing(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setIsEditing(true)
              }
            }}
          >
            {vc.name}
          </span>
        )}
      </span>
    </div>
  )
}
