/**
 * MediaSidebar — left rail + panel slot for the Media workspace.
 *
 * Mirrors the structure of `ContentSidebar`: a panel rail with one toggle
 * per panel (folders, smart folders, trash) and a panel slot that mounts
 * the active panel body.
 *
 * Reuses the editor's PanelRail / LeftSidebar CSS so the visual language is
 * identical across Site / Content / Media.
 */
import { useRef, type CSSProperties } from 'react'
import { Button } from '@ui/components/Button'
import { FolderGlyphIcon } from 'pixel-art-icons/icons/folder-glyph'
import { SparklesSolidIcon } from 'pixel-art-icons/icons/sparkles-solid'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import { useEditorStore } from '@site/store/store'
import { SidebarResizeHandle } from '@admin/shared/SidebarResizeHandle'
import { EmptyState } from '@ui/components/EmptyState'
import { Panel } from '@admin/shared/Panel'
import leftSidebarStyles from '@site/sidebars/LeftSidebar/LeftSidebar.module.css'
import panelRailStyles from '@site/sidebars/PanelRail/PanelRail.module.css'
import { MediaFolderPanel } from '../MediaFolderPanel/MediaFolderPanel'
import { MediaSmartFolderPanel } from '../MediaSmartFolderPanel/MediaSmartFolderPanel'
import { FOLDER_TRASH, type UseMediaWorkspaceResult } from '../../hooks/useMediaWorkspace'

export type MediaSidebarPanelId = 'folders' | 'smart' | 'trash'

interface MediaSidebarProps {
  workspace: UseMediaWorkspaceResult
  activePanel: MediaSidebarPanelId | null
  onActivePanelChange: (panel: MediaSidebarPanelId | null) => void
}

const RAIL_ITEMS: Array<{
  id: MediaSidebarPanelId
  label: string
  icon: typeof FolderGlyphIcon
  iconName: string
  accent: 'mint' | 'lilac' | 'sky' | 'peach'
}> = [
  { id: 'folders', label: 'Folders', icon: FolderGlyphIcon, iconName: 'folder', accent: 'sky' },
  { id: 'smart', label: 'Smart folders', icon: SparklesSolidIcon, iconName: 'sparkles', accent: 'lilac' },
  { id: 'trash', label: 'Trash', icon: TrashSolidIcon, iconName: 'trash', accent: 'peach' },
]

const PANEL_TITLES: Record<MediaSidebarPanelId, string> = {
  folders: 'Folders',
  smart: 'Smart folders',
  trash: 'Trash',
}

export function MediaSidebar({ workspace, activePanel, onActivePanelChange }: MediaSidebarProps) {
  const sidebarRef = useRef<HTMLElement | null>(null)
  const leftSidebarWidth = useEditorStore((s) => s.leftSidebarWidth)
  const setLeftSidebarWidth = useEditorStore((s) => s.setLeftSidebarWidth)
  const panelWidth = activePanel ? leftSidebarWidth : 0
  const style = {
    '--left-sidebar-panel-width': `${panelWidth}px`,
  } as CSSProperties

  function handleRailToggle(panelId: MediaSidebarPanelId) {
    const next = activePanel === panelId ? null : panelId
    onActivePanelChange(next)
    // Selecting the Trash rail jumps to the trash view; selecting Folders
    // when on Trash bounces us back to "All files" by clearing the trash
    // selection — the orchestrator hook decides via its own state.
    if (panelId === 'trash') {
      workspace.setFolderSelection(FOLDER_TRASH)
    }
  }

  return (
    <aside
      ref={sidebarRef}
      className={leftSidebarStyles.sidebar}
      data-testid="media-left-sidebar"
      data-expanded={activePanel ? 'true' : 'false'}
      data-active-panel={activePanel ?? 'none'}
      style={style}
    >
      <nav
        aria-label="Media panel dock"
        className={panelRailStyles.rail}
        data-testid="media-panel-rail"
      >
        <div className={panelRailStyles.itemGroup}>
          {RAIL_ITEMS.map((item) => {
            const Icon = item.icon
            const active = activePanel === item.id
            const action = active ? 'Close' : 'Open'
            return (
              <Button
                key={item.id}
                variant="ghost"
                size="md"
                iconOnly
                pressed={active}
                aria-label={`${action} ${item.label} panel`}
                tooltip={`${item.label} panel`}
                data-testid={`media-panel-rail-${item.id}`}
                data-icon={item.iconName}
                data-accent={item.accent}
                onClick={() => handleRailToggle(item.id)}
                className={panelRailStyles.railButton}
              >
                <span className={panelRailStyles.activeIndicator} aria-hidden="true" />
                <Icon size={16} className={panelRailStyles.railIcon} />
              </Button>
            )
          })}
        </div>
      </nav>

      <div
        className={leftSidebarStyles.panelSlot}
        data-testid="media-left-sidebar-panel-slot"
        aria-hidden={activePanel ? undefined : 'true'}
      >
        <div className={leftSidebarStyles.panelMount}>
          {activePanel && (
            <Panel
              panelId={`media-${activePanel}`}
              title={PANEL_TITLES[activePanel]}
              ariaLabel={`${PANEL_TITLES[activePanel]} panel`}
              testId={`media-${activePanel}-panel`}
              onClose={() => onActivePanelChange(null)}
              body="bare"
            >
              {activePanel === 'folders' && (
                <MediaFolderPanel workspace={workspace} />
              )}
              {activePanel === 'smart' && (
                <MediaSmartFolderPanel workspace={workspace} />
              )}
              {activePanel === 'trash' && (
                <EmptyState
                  compact
                  title="Trash"
                  description="Soft-deleted assets appear in the canvas. Restore from there."
                />
              )}
            </Panel>
          )}
        </div>
      </div>

      {activePanel && (
        <SidebarResizeHandle
          side="left"
          width={leftSidebarWidth}
          targetRef={sidebarRef}
          cssVariable="--left-sidebar-panel-width"
          ariaLabel="Resize media sidebar"
          onResize={setLeftSidebarWidth}
        />
      )}
    </aside>
  )
}
