import { useEffect, useRef } from 'react'
import { useEditorStore } from '@site/store/store'
import { PanelHeader } from '@admin/shared/PanelHeader'
import { DepsSection } from './DepsSection'
import styles from './DependenciesPanel.module.css'

interface DependenciesPanelProps {
  variant?: 'docked'
}

export function DependenciesPanel({ variant = 'docked' }: DependenciesPanelProps) {
  const isOpen = useEditorStore((s) => s.dependenciesPanelOpen)
  const setDependenciesPanelOpen = useEditorStore((s) => s.setDependenciesPanelOpen)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => panelRef.current?.focus())
    }
  }, [isOpen])

  if (!isOpen || variant !== 'docked') return null

  return (
    <aside
      ref={panelRef}
      role="complementary"
      aria-label="Dependencies"
      data-panel=""
      data-testid="dependencies-panel"
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      className={styles.panel}
    >
      <PanelHeader
        panelId="dependencies"
        title="Dependencies"
        onClose={() => setDependenciesPanelOpen(false)}
      />
      <DepsSection collapsible={false} defaultExpanded />
    </aside>
  )
}
