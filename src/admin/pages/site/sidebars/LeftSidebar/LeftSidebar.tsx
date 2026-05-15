import { useRef, type CSSProperties, type ReactNode } from 'react'
import { useEditorStore } from '@site/store/store'
import type { LeftSidebarPanelId } from '@site/store/slices/uiSlice'
import { AgentPanel } from '@site/panels/AgentPanel'
import { ColorsPanel } from '@site/panels/ColorsPanel'
import { DependenciesPanel } from '@site/panels/DependenciesPanel'
import { DomPanel } from '@site/panels/DomPanel'
import { MediaExplorerPanel } from '@site/panels/MediaExplorerPanel'
import { PanelRail } from '@site/sidebars/PanelRail'
import { PluginEditorPanel } from '@site/panels/PluginEditorPanel'
import { SelectorsPanel } from '@site/panels/SelectorsPanel'
import { SiteExplorerPanel } from '@site/panels/SiteExplorerPanel'
import { TypographyPanel } from '@site/panels/TypographyPanel'
import { SpacingPanel } from '@site/panels/SpacingPanel'
import { FrameworkChangeConfirmProvider } from '@admin/shared/dialogs/FrameworkChangeConfirmDialog'
import { SidebarResizeHandle } from '@admin/shared/SidebarResizeHandle'
import styles from './LeftSidebar.module.css'

function selectActiveLeftSidebarPanel(state: ReturnType<typeof useEditorStore.getState>): LeftSidebarPanelId | null {
  // A plugin panel takes precedence over the built-in `*PanelOpen` flags;
  // the LeftSidebar reads `activePluginPanelId` separately and shows the
  // plugin mount when set.
  if (state.activePluginPanelId !== null) return null
  if (state.siteExplorerPanelOpen) return 'site'
  if (state.selectorsPanelOpen) return 'selectors'
  if (state.colorsPanelOpen) return 'colors'
  if (state.typographyPanelOpen) return 'typography'
  if (state.spacingPanelOpen) return 'spacing'
  if (state.mediaExplorerPanelOpen) return 'media'
  if (state.dependenciesPanelOpen) return 'dependencies'
  if (!state.domTreePanel.collapsed) return 'layers'
  if (state.isAgentOpen) return 'agent'
  return null
}

interface LeftSidebarProps {
  workspace?: 'site' | 'content' | 'media'
  contentPanel?: ReactNode
  editable?: boolean
}

export function LeftSidebar({ workspace = 'site', contentPanel, editable = true }: LeftSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null)
  const activePanel = useEditorStore(selectActiveLeftSidebarPanel)
  const activePluginPanelId = useEditorStore((s) => s.activePluginPanelId)
  const leftSidebarWidth = useEditorStore((s) => s.leftSidebarWidth)
  const setLeftSidebarWidth = useEditorStore((s) => s.setLeftSidebarWidth)
  const effectiveActivePanel = editable ? activePanel : 'layers'
  const effectivePluginPanelId = editable ? activePluginPanelId : null
  // Sidebar is "expanded" whenever a built-in OR plugin panel is showing.
  const sidebarOpen = Boolean(effectiveActivePanel) || effectivePluginPanelId !== null
  const panelWidth = sidebarOpen ? leftSidebarWidth : 0

  const style = {
    '--left-sidebar-panel-width': `${panelWidth}px`,
  } as CSSProperties

  return (
    <aside
      ref={sidebarRef}
      className={styles.sidebar}
      data-testid="left-sidebar"
      data-expanded={sidebarOpen ? 'true' : 'false'}
      data-active-panel={effectivePluginPanelId !== null
        ? `plugin:${effectivePluginPanelId}`
        : effectiveActivePanel ?? 'none'}
      style={style}
    >
      <PanelRail workspace={workspace} editable={editable} />

      <FrameworkChangeConfirmProvider>
        <div
          className={styles.panelSlot}
          data-testid="left-sidebar-panel-slot"
          aria-hidden={sidebarOpen ? undefined : 'true'}
        >
          <div className={styles.panelMount} hidden={effectiveActivePanel !== 'layers'}>
            <DomPanel variant="docked" editable={editable} />
          </div>
          {editable && (
            <>
              <div className={styles.panelMount} hidden={effectiveActivePanel !== 'site'}>
                {workspace === 'content' ? contentPanel : <SiteExplorerPanel variant="docked" />}
              </div>
              <div className={styles.panelMount} hidden={effectiveActivePanel !== 'selectors'}>
                <SelectorsPanel variant="docked" />
              </div>
              <div className={styles.panelMount} hidden={effectiveActivePanel !== 'colors'}>
                <ColorsPanel />
              </div>
              <div className={styles.panelMount} hidden={effectiveActivePanel !== 'typography'}>
                <TypographyPanel />
              </div>
              <div className={styles.panelMount} hidden={effectiveActivePanel !== 'spacing'}>
                <SpacingPanel />
              </div>
              <div className={styles.panelMount} hidden={effectiveActivePanel !== 'media'}>
                <MediaExplorerPanel variant="docked" />
              </div>
              <div className={styles.panelMount} hidden={effectiveActivePanel !== 'dependencies'}>
                <DependenciesPanel variant="docked" />
              </div>
              <div className={styles.panelMount} hidden={effectiveActivePanel !== 'agent'}>
                <AgentPanel variant="docked" />
              </div>
              {effectivePluginPanelId !== null && (
                <div
                  className={styles.panelMount}
                  data-testid="left-sidebar-plugin-panel-mount"
                >
                  <PluginEditorPanel panelId={effectivePluginPanelId} />
                </div>
              )}
            </>
          )}
        </div>
      </FrameworkChangeConfirmProvider>

      {sidebarOpen && (
        <SidebarResizeHandle
          side="left"
          width={leftSidebarWidth}
          targetRef={sidebarRef}
          cssVariable="--left-sidebar-panel-width"
          ariaLabel="Resize left sidebar"
          onResize={setLeftSidebarWidth}
        />
      )}
    </aside>
  )
}
