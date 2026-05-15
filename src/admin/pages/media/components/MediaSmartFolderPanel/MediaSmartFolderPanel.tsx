/**
 * MediaSmartFolderPanel — sidebar panel listing the built-in smart folders.
 *
 * Smart folders are saved filters that run client-side over the active asset
 * list. They behave like a folder selection (set via `setFolderSelection`)
 * so the rest of the workspace (canvas grid, viewer, bulk-edit) reacts
 * exactly as it would for a real folder — search / type chip / sort still
 * apply on top.
 *
 * Built-in set today (per `docs/media-page.md`):
 *   - Recent — created in the last 7 days
 *   - Missing alt text — image assets with empty `altText`
 *
 * "Unused" (assets nothing references) will land alongside the publish-time
 * `media_usage_refs` index in milestone M5.
 */
import type { ReactNode } from 'react'
import {
  TreeChevron,
  TreeContainer,
  TreeIconSlot,
  TreeLabel,
  TreeLabelGroup,
  TreeMeta,
  TreeRow,
} from '@admin/pages/site/ui/Tree'
import { SparklesSolidIcon } from 'pixel-art-icons/icons/sparkles-solid'
import { WarningDiamondSolidIcon } from 'pixel-art-icons/icons/warning-diamond-solid'
import type { IconComponent } from 'pixel-art-icons/types'
import type { CmsMediaAsset } from '@core/persistence/cmsMedia'
import {
  SMART_MISSING_ALT,
  SMART_RECENT,
  type SmartFolderId,
  type UseMediaWorkspaceResult,
} from '../../hooks/useMediaWorkspace'
import styles from './MediaSmartFolderPanel.module.css'

interface MediaSmartFolderPanelProps {
  workspace: UseMediaWorkspaceResult
}

interface SmartFolderDescriptor {
  id: SmartFolderId
  label: string
  icon: IconComponent
  /**
   * Predicate run against the full active asset list to produce the count
   * shown in the row meta column. Kept here (not pulled from the workspace
   * hook) so the panel can show counts without needing a second cache layer.
   * It must stay logically identical to the predicate the workspace applies
   * in `visibleAssets` — see `smartFolderPredicate` there.
   */
  matches: (asset: CmsMediaAsset) => boolean
  description: string
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

const SMART_FOLDERS: SmartFolderDescriptor[] = [
  {
    id: SMART_RECENT,
    label: 'Recent uploads',
    icon: SparklesSolidIcon,
    description: 'Assets created in the last 7 days.',
    matches: (asset) => {
      const ts = Date.parse(asset.createdAt)
      return Number.isFinite(ts) && ts >= Date.now() - SEVEN_DAYS_MS
    },
  },
  {
    id: SMART_MISSING_ALT,
    label: 'Missing alt text',
    icon: WarningDiamondSolidIcon,
    description: 'Image assets without a written alt text.',
    matches: (asset) =>
      asset.mimeType.startsWith('image/') && asset.altText.trim().length === 0,
  },
]

export function MediaSmartFolderPanel({ workspace }: MediaSmartFolderPanelProps) {
  return (
    <div className={styles.root} data-testid="media-smart-folder-panel">
      <div className={styles.sectionHeader}>
        <span className={styles.sectionLabel}>Built-in</span>
      </div>
      <TreeContainer ariaLabel="Built-in smart folders" className={styles.tree}>
        {SMART_FOLDERS.map((descriptor) => {
          const count = workspace.assets.filter(descriptor.matches).length
          const selected = workspace.folderSelection === descriptor.id
          return (
            <SmartFolderRow
              key={descriptor.id}
              label={descriptor.label}
              icon={descriptor.icon}
              count={count}
              selected={selected}
              onSelect={() => workspace.setFolderSelection(descriptor.id)}
              description={descriptor.description}
            />
          )
        })}
      </TreeContainer>

      <p className={styles.footnote}>
        Smart folders are dynamic — they update as you upload, edit, or tag assets.
      </p>
    </div>
  )
}

interface SmartFolderRowProps {
  label: string
  icon: IconComponent
  count: number
  selected: boolean
  onSelect: () => void
  description: string
}

function SmartFolderRow({
  label,
  icon,
  count,
  selected,
  onSelect,
  description,
}: SmartFolderRowProps): ReactNode {
  return (
    <TreeRow
      depth={0}
      selected={selected}
      role="treeitem"
      aria-selected={selected}
      aria-label={`${label} — ${count} ${count === 1 ? 'asset' : 'assets'}`}
      tabIndex={0}
      title={description}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
    >
      <TreeChevron visible={false} />
      <TreeIconSlot icon={icon} />
      <TreeLabelGroup>
        <TreeLabel>{label}</TreeLabel>
      </TreeLabelGroup>
      <TreeMeta>{count}</TreeMeta>
    </TreeRow>
  )
}
