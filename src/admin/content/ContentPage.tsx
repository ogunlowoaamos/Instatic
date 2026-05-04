import { useEffect, useId, useState } from 'react'
import { createHeadingBlock, createParagraphBlock, serializeMarkdownBlocks } from '@core/content/markdown'
import type { ContentCollection, ContentEntry, UpdateContentCollectionInput } from '@core/content/schemas'
import { useEditorStore } from '@core/editor-store/store'
import { HeadingIcon } from 'pixel-art-icons/icons/heading'
import { ImagesIcon } from 'pixel-art-icons/icons/images'
import { TextPlusIcon } from 'pixel-art-icons/icons/text-plus'
import AdminLayout from '../AdminLayout'
import { MediaExplorerPanel } from '../../editor/components/MediaExplorerPanel'
import type { CanvasNotchAction } from '../../editor/components/Canvas/CanvasNotch'
import { ContentDocumentCanvas } from './components/ContentDocumentCanvas/ContentDocumentCanvas'
import { ContentCollectionCreateDialog } from './components/ContentCollectionCreateDialog/ContentCollectionCreateDialog'
import { ContentExplorerPanel } from './components/ContentExplorerPanel/ContentExplorerPanel'
import { ContentSettingsPanel } from './components/ContentSettingsPanel/ContentSettingsPanel'
import { ContentSidebar, type ContentPanelId } from './components/ContentSidebar/ContentSidebar'
import { ContentToolbar } from './components/ContentToolbar/ContentToolbar'
import { MediaPickerDialog } from './components/MediaPickerDialog/MediaPickerDialog'
import { useContentEntryDraft } from './hooks/useContentEntryDraft'
import { useContentMediaPicker } from './hooks/useContentMediaPicker'
import { useContentWorkspace } from './hooks/useContentWorkspace'
import { publicContentPath } from './utils/contentEntryUtils'

export function ContentPage() {
  const [activeContentPanel, setActiveContentPanel] = useState<ContentPanelId | null>('content')
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false)
  const titleId = useId()
  const slugId = useId()
  const seoTitleId = useId()
  const seoDescriptionId = useId()

  const workspace = useContentWorkspace()
  const draft = useContentEntryDraft({
    selectedEntry: workspace.selectedEntry,
    updateSelectedEntry: workspace.updateSelectedEntry,
    setError: workspace.setError,
  })
  const mediaPicker = useContentMediaPicker({
    featuredMediaId: draft.featuredMediaId,
    setFeaturedMediaId: draft.setFeaturedMediaId,
    setBlocks: draft.setBlocks,
  })

  const publicPath = workspace.selectedCollection && draft.slug
    ? publicContentPath(workspace.selectedCollection.routeBase, draft.slug)
    : ''

  useEffect(() => {
    useEditorStore.getState().setPropertiesPanel({ collapsed: false })
  }, [])

  async function handleCreateEntry() {
    draft.setSaveMessage('saving')
    workspace.setError(null)
    try {
      const entry = await workspace.createUntitledEntry()
      draft.applySelectedEntry(entry)
      draft.setSaveMessage('saved')
    } catch (err) {
      draft.setSaveMessage('error')
      workspace.setError(err instanceof Error ? err.message : 'Could not create entry')
    }
  }

  async function handleMoveEntryCollection(collectionId: string) {
    draft.setSaveMessage('saving')
    workspace.setError(null)
    try {
      const entry = await workspace.moveSelectedEntryToCollection(collectionId)
      if (entry) draft.applySelectedEntry(entry)
      draft.setSaveMessage('saved')
    } catch (err) {
      draft.setSaveMessage('error')
      workspace.setError(err instanceof Error ? err.message : 'Could not move entry')
    }
  }

  async function handleUpdateCollection(
    collection: ContentCollection,
    input: UpdateContentCollectionInput,
  ) {
    workspace.setError(null)
    try {
      await workspace.updateCollection(collection.id, input)
    } catch (err) {
      workspace.setError(err instanceof Error ? err.message : 'Could not update collection')
      throw err
    }
  }

  async function handleDeleteCollection(collection: ContentCollection) {
    workspace.setError(null)
    try {
      await workspace.deleteCollection(collection.id)
      if (workspace.selectedCollectionId === collection.id) {
        draft.applySelectedEntry(null)
      }
    } catch (err) {
      workspace.setError(err instanceof Error ? err.message : 'Could not delete collection')
      throw err
    }
  }

  async function handleRenameEntry(
    entry: ContentEntry,
    input: Pick<ContentEntry, 'title' | 'slug'>,
  ) {
    draft.setSaveMessage('saving')
    workspace.setError(null)
    try {
      const entrySnapshot = workspace.selectedEntry?.id === entry.id
        ? {
            ...entry,
            bodyMarkdown: serializeMarkdownBlocks(draft.blocks),
            featuredMediaId: draft.featuredMediaId,
            seoTitle: draft.seoTitle,
            seoDescription: draft.seoDescription,
          }
        : entry
      const updatedEntry = await workspace.renameEntry(entrySnapshot, input)
      if (workspace.selectedEntry?.id === entry.id) {
        draft.applySelectedEntry(updatedEntry)
      }
      draft.setSaveMessage('saved')
    } catch (err) {
      draft.setSaveMessage('error')
      workspace.setError(err instanceof Error ? err.message : 'Could not rename entry')
      throw err
    }
  }

  async function handleDeleteEntry(entry: ContentEntry) {
    workspace.setError(null)
    try {
      const nextEntry = await workspace.deleteEntry(entry)
      if (workspace.selectedEntry?.id === entry.id) {
        draft.applySelectedEntry(nextEntry)
      }
    } catch (err) {
      workspace.setError(err instanceof Error ? err.message : 'Could not delete entry')
      throw err
    }
  }

  async function handlePublishEntry(entry: ContentEntry) {
    if (workspace.selectedEntry?.id === entry.id) {
      await draft.handlePublish()
      return
    }

    workspace.setError(null)
    try {
      await workspace.publishEntry(entry)
    } catch (err) {
      workspace.setError(err instanceof Error ? err.message : 'Could not publish entry')
      throw err
    }
  }

  async function handleConvertEntryToDraft(entry: ContentEntry) {
    if (workspace.selectedEntry?.id === entry.id) {
      await draft.handleStatusChange('draft')
      return
    }

    workspace.setError(null)
    try {
      await workspace.updateEntryStatus(entry, 'draft')
    } catch (err) {
      workspace.setError(err instanceof Error ? err.message : 'Could not convert entry to draft')
      throw err
    }
  }

  function handleSelectEntry(entry: Parameters<typeof workspace.selectEntry>[0]) {
    workspace.selectEntry(entry)
    draft.applySelectedEntry(entry)
  }

  const notchActions: CanvasNotchAction[] = [
    {
      id: 'heading',
      label: 'Heading',
      icon: HeadingIcon,
      onClick: () => draft.setBlocks((current) => [...current, createHeadingBlock()]),
    },
    {
      id: 'text',
      label: 'Text',
      icon: TextPlusIcon,
      onClick: () => draft.setBlocks((current) => [...current, createParagraphBlock()]),
    },
    {
      id: 'media',
      label: 'Media',
      icon: ImagesIcon,
      onClick: () => void mediaPicker.openMediaPicker('media'),
    },
  ]

  return (
    <>
      <AdminLayout
        workspace="content"
        toolbarRightSlot={(
          <ContentToolbar
            contentLoading={workspace.contentLoading}
            saveMessage={draft.saveMessage}
            isDirty={draft.isDirty}
            selectedEntry={workspace.selectedEntry}
            selectedCollection={workspace.selectedCollection}
            publicPath={publicPath}
            onSaveDraft={() => void draft.handleSaveDraft()}
            onPublish={() => void draft.handlePublish()}
          />
        )}
        contentSidebar={(
          <ContentSidebar
            activePanel={activeContentPanel}
            onActivePanelChange={setActiveContentPanel}
            contentPanel={(
              <ContentExplorerPanel
                loading={workspace.contentLoading}
                error={workspace.error}
                collections={workspace.collections}
                entries={workspace.entries}
                selectedCollection={workspace.selectedCollection}
                selectedCollectionId={workspace.selectedCollectionId}
                selectedEntryId={workspace.selectedEntry?.id ?? null}
                onSelectCollection={workspace.selectCollection}
                onSelectEntry={handleSelectEntry}
                onCreateCollection={() => setCollectionDialogOpen(true)}
                onCreateEntry={() => void handleCreateEntry()}
                onUpdateCollection={handleUpdateCollection}
                onDeleteCollection={handleDeleteCollection}
                onRenameEntry={handleRenameEntry}
                onPublishEntry={handlePublishEntry}
                onConvertEntryToDraft={handleConvertEntryToDraft}
                onDeleteEntry={handleDeleteEntry}
                onClose={() => setActiveContentPanel(null)}
              />
            )}
            mediaPanel={(
              <MediaExplorerPanel
                variant="docked"
                open={activeContentPanel === 'media'}
                onOpenChange={(open) => setActiveContentPanel(open ? 'media' : null)}
              />
            )}
          />
        )}
        contentCanvas={(
          <ContentDocumentCanvas
            selectedEntry={workspace.selectedEntry}
            selectedCollection={workspace.selectedCollection}
            loading={workspace.contentLoading}
            title={draft.title}
            titleId={titleId}
            blocks={draft.blocks}
            notchActions={notchActions}
            onTitleChange={draft.setTitle}
            onBlocksChange={draft.setBlocks}
            onRequestMedia={(blockId) => void mediaPicker.openMediaPicker('media', blockId)}
            onCreateEntry={() => void handleCreateEntry()}
          />
        )}
        contentRightPanel={(
          <ContentSettingsPanel
            selectedEntry={workspace.selectedEntry}
            collections={workspace.collections}
            selectedCollection={workspace.selectedCollection}
            loading={workspace.contentLoading}
            slug={draft.slug}
            slugId={slugId}
            seoTitle={draft.seoTitle}
            seoTitleId={seoTitleId}
            seoDescription={draft.seoDescription}
            seoDescriptionId={seoDescriptionId}
            publicPath={publicPath}
            mediaAssets={mediaPicker.mediaAssets}
            mediaLoading={mediaPicker.mediaLoading}
            mediaError={mediaPicker.mediaError}
            featuredMediaId={draft.featuredMediaId}
            featuredMediaAsset={mediaPicker.featuredMediaAsset}
            onCollectionChange={(collectionId) => void handleMoveEntryCollection(collectionId)}
            onSlugChange={draft.setSlug}
            onSeoTitleChange={draft.setSeoTitle}
            onSeoDescriptionChange={draft.setSeoDescription}
            onStatusChange={(status) => void draft.handleStatusChange(status)}
            onChooseFeaturedMedia={() => void mediaPicker.openMediaPicker('featured')}
            onClearFeaturedMedia={() => draft.setFeaturedMediaId(null)}
          />
        )}
      />

      {mediaPicker.mediaPicker && (
        <MediaPickerDialog
          mediaPicker={mediaPicker.mediaPicker}
          mediaLoading={mediaPicker.mediaLoading}
          mediaError={mediaPicker.mediaError}
          mediaAssets={mediaPicker.filteredMediaAssets}
          onInsertMedia={mediaPicker.insertMedia}
          onClose={mediaPicker.closeMediaPicker}
        />
      )}

      {collectionDialogOpen && (
        <ContentCollectionCreateDialog
          onCancel={() => setCollectionDialogOpen(false)}
          onCreate={async (input) => {
            await workspace.createCollection(input)
            setCollectionDialogOpen(false)
          }}
        />
      )}
    </>
  )
}
