/**
 * MediaFolderPanel — the folder tree shown in the Media sidebar.
 *
 * Uses the same `Tree*` primitives (`TreeContainer`, `TreeRow`, `TreeChevron`,
 * `TreeIconSlot`, `TreeLabel`) that the DOM panel and the rest of the editor
 * trees share, so the visual language (row height, density-aware sizing,
 * selection / hover / focus states) matches one-to-one.
 *
 * Operations supported here:
 *   - Select a folder / pseudo-folder.
 *   - Expand / collapse subtrees.
 *   - Inline create (opens a small input row under the active parent).
 *   - Rename / delete via the existing ExplorerItemContextMenu.
 */
import { useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'
import { EmptyState } from '@ui/components/EmptyState'
import { FolderGlyphIcon } from 'pixel-art-icons/icons/folder-glyph'
import { ImagesSolidIcon } from 'pixel-art-icons/icons/images-solid'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { TrashSolidIcon } from 'pixel-art-icons/icons/trash-solid'
import type { IconComponent } from 'pixel-art-icons/types'
import {
  ExplorerItemContextMenu,
  ExplorerRenameDialog,
} from '@site/explorer-actions'
import {
  TreeChevron,
  TreeContainer,
  TreeIconSlot,
  TreeLabel,
  TreeLabelGroup,
  TreeRow,
} from '@admin/pages/site/ui/Tree'
import { flattenFolderTree, type MediaFolderNode } from '../../utils/folderTree'
import {
  FOLDER_ALL,
  FOLDER_TRASH,
  FOLDER_UNCATEGORIZED,
  type FolderSelection,
  type UseMediaWorkspaceResult,
} from '../../hooks/useMediaWorkspace'
import styles from './MediaFolderPanel.module.css'

interface MediaFolderPanelProps {
  workspace: UseMediaWorkspaceResult
}

interface ContextMenuState {
  x: number
  y: number
  folderId: string
}

interface RenameState {
  folderId: string
  initialValue: string
}

export function MediaFolderPanel({ workspace }: MediaFolderPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renameState, setRenameState] = useState<RenameState | null>(null)
  const [createUnder, setCreateUnder] = useState<string | null | undefined>(undefined)
  const [createName, setCreateName] = useState('')

  function toggleExpanded(folderId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  function isSelected(target: FolderSelection): boolean {
    return workspace.folderSelection === target
  }

  function startCreate(parentId: string | null) {
    setCreateUnder(parentId)
    setCreateName('')
    if (parentId !== null) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.add(parentId)
        return next
      })
    }
  }

  async function commitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = createName.trim()
    if (!name || createUnder === undefined) return
    const folder = await workspace.createFolder(name, createUnder)
    if (folder) workspace.setFolderSelection(folder.id)
    setCreateUnder(undefined)
    setCreateName('')
  }

  function cancelCreate() {
    setCreateUnder(undefined)
    setCreateName('')
  }

  function openContextMenu(folderId: string, event: MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ x: event.clientX, y: event.clientY, folderId })
  }

  function handleKeyboardMenu(folderId: string, event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return
    event.preventDefault()
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setContextMenu({
      folderId,
      x: rect.left + Math.min(rect.width - 8, 24),
      y: rect.top + Math.min(rect.height - 8, 24),
    })
  }

  const rows = flattenFolderTree(workspace.folderTree, expanded)
  const renameFolder = renameState ? workspace.folderById.get(renameState.folderId) ?? null : null

  return (
    <div className={styles.root} data-testid="media-folder-panel">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Library</span>
      </div>
      <TreeContainer ariaLabel="Media library" className={styles.tree}>
        <SentinelRow
          label="All files"
          icon={ImagesSolidIcon}
          selected={isSelected(FOLDER_ALL)}
          onSelect={() => workspace.setFolderSelection(FOLDER_ALL)}
        />
        <SentinelRow
          label="Uncategorized"
          icon={FolderGlyphIcon}
          selected={isSelected(FOLDER_UNCATEGORIZED)}
          onSelect={() => workspace.setFolderSelection(FOLDER_UNCATEGORIZED)}
        />
      </TreeContainer>

      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Folders</span>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          tooltip="New folder"
          aria-label="New root folder"
          onClick={() => startCreate(null)}
        >
          <PlusIcon size={13} />
        </Button>
      </div>

      {createUnder === null && (
        <CreateRow
          depth={0}
          value={createName}
          onValueChange={setCreateName}
          onSubmit={commitCreate}
          onCancel={cancelCreate}
        />
      )}

      {rows.length === 0 && createUnder === undefined ? (
        <EmptyState
          compact
          plain
          title="No folders yet"
          description="Click + to create your first folder."
        />
      ) : (
        <TreeContainer ariaLabel="Folder tree" className={styles.tree}>
          {rows.map((node) => (
            <FolderRowItem
              key={node.folder.id}
              node={node}
              expanded={expanded.has(node.folder.id)}
              hasChildren={node.children.length > 0}
              selected={workspace.folderSelection === node.folder.id}
              onSelect={() => workspace.setFolderSelection(node.folder.id)}
              onToggle={() => toggleExpanded(node.folder.id)}
              onContextMenu={openContextMenu}
              onKeyDown={handleKeyboardMenu}
              showCreateChild={createUnder === node.folder.id}
              createValue={createName}
              onCreateValueChange={setCreateName}
              onCommitCreate={commitCreate}
              onCancelCreate={cancelCreate}
            />
          ))}
        </TreeContainer>
      )}

      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>System</span>
      </div>
      <TreeContainer ariaLabel="System folders" className={styles.tree}>
        <SentinelRow
          label="Trash"
          icon={TrashSolidIcon}
          selected={isSelected(FOLDER_TRASH)}
          onSelect={() => workspace.setFolderSelection(FOLDER_TRASH)}
        />
      </TreeContainer>

      {contextMenu && (
        <ExplorerItemContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          ariaLabel="Folder options"
          onClose={() => setContextMenu(null)}
          onRename={() => {
            const folder = workspace.folderById.get(contextMenu.folderId)
            if (folder) setRenameState({ folderId: folder.id, initialValue: folder.name })
            setContextMenu(null)
          }}
          onDelete={() => {
            const folderId = contextMenu.folderId
            setContextMenu(null)
            void workspace.deleteFolder(folderId)
          }}
          extraItems={[
            {
              label: 'New subfolder',
              icon: <PlusIcon size={13} />,
              action: () => {
                const folderId = contextMenu.folderId
                setContextMenu(null)
                startCreate(folderId)
              },
            },
          ]}
        />
      )}

      {renameFolder && renameState && (
        <ExplorerRenameDialog
          title="Rename folder"
          fieldLabel="Name"
          initialValue={renameState.initialValue}
          onCancel={() => setRenameState(null)}
          onRename={async (payload) => {
            await workspace.renameFolder(renameFolder.id, payload.value)
            setRenameState(null)
          }}
        />
      )}
    </div>
  )
}

interface SentinelRowProps {
  label: string
  icon: IconComponent
  selected: boolean
  onSelect: () => void
}

function SentinelRow({ label, icon, selected, onSelect }: SentinelRowProps) {
  return (
    <TreeRow
      depth={0}
      selected={selected}
      role="treeitem"
      aria-selected={selected}
      aria-label={label}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      data-testid={`media-folder-row-${label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <TreeChevron visible={false} />
      <TreeIconSlot icon={icon} />
      <TreeLabelGroup>
        <TreeLabel>{label}</TreeLabel>
      </TreeLabelGroup>
    </TreeRow>
  )
}

interface FolderRowItemProps {
  node: MediaFolderNode
  expanded: boolean
  hasChildren: boolean
  selected: boolean
  onSelect: () => void
  onToggle: () => void
  onContextMenu: (folderId: string, event: MouseEvent<HTMLDivElement>) => void
  onKeyDown: (folderId: string, event: KeyboardEvent<HTMLDivElement>) => void
  showCreateChild: boolean
  createValue: string
  onCreateValueChange: (value: string) => void
  onCommitCreate: (event: FormEvent<HTMLFormElement>) => Promise<void> | void
  onCancelCreate: () => void
}

function FolderRowItem({
  node,
  expanded,
  hasChildren,
  selected,
  onSelect,
  onToggle,
  onContextMenu,
  onKeyDown,
  showCreateChild,
  createValue,
  onCreateValueChange,
  onCommitCreate,
  onCancelCreate,
}: FolderRowItemProps) {
  return (
    <>
      <TreeRow
        depth={node.depth}
        selected={selected}
        role="treeitem"
        aria-selected={selected}
        aria-expanded={hasChildren ? expanded : undefined}
        aria-label={node.folder.name}
        tabIndex={0}
        onClick={(event) => {
          event.stopPropagation()
          onSelect()
          if (hasChildren) onToggle()
        }}
        onKeyDown={(event) => {
          onKeyDown(node.folder.id, event)
          if (event.defaultPrevented) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect()
          } else if (event.key === 'ArrowRight' && hasChildren && !expanded) {
            event.preventDefault()
            onToggle()
          } else if (event.key === 'ArrowLeft' && hasChildren && expanded) {
            event.preventDefault()
            onToggle()
          }
        }}
        onContextMenu={(event) => onContextMenu(node.folder.id, event)}
      >
        <TreeChevron
          expanded={expanded}
          visible={hasChildren}
          onClick={(event: MouseEvent<HTMLSpanElement>) => {
            event.stopPropagation()
            if (hasChildren) onToggle()
          }}
        />
        <TreeIconSlot icon={FolderGlyphIcon} />
        <TreeLabelGroup>
          <TreeLabel>{node.folder.name}</TreeLabel>
        </TreeLabelGroup>
      </TreeRow>
      {showCreateChild && (
        <CreateRow
          depth={node.depth + 1}
          value={createValue}
          onValueChange={onCreateValueChange}
          onSubmit={onCommitCreate}
          onCancel={onCancelCreate}
        />
      )}
    </>
  )
}

interface CreateRowProps {
  depth: number
  value: string
  onValueChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void> | void
  onCancel: () => void
}

function CreateRow({ depth, value, onValueChange, onSubmit, onCancel }: CreateRowProps) {
  return (
    <form
      className={styles.createRow}
      onSubmit={(event) => void onSubmit(event)}
      style={{ paddingLeft: `${8 + depth * 12 + 18}px` } as React.CSSProperties}
    >
      <FolderGlyphIcon size={12} />
      <Input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder="Folder name"
        autoFocus
        aria-label="New folder name"
        onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}
      />
    </form>
  )
}

// Helper to keep the ReactNode type stable across renamed JSX subtrees.
export type { ReactNode }
