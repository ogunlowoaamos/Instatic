import { Button } from '@ui/components/Button'
import type { CmsMediaAsset } from '@core/persistence'
import type { MediaPickerState } from '@content/hooks/useContentMediaPicker'
import styles from '../../ContentPage.module.css'

interface MediaPickerDialogProps {
  mediaPicker: MediaPickerState
  mediaLoading: boolean
  mediaError: string | null
  mediaAssets: CmsMediaAsset[]
  onInsertMedia: (asset: CmsMediaAsset) => void
  onClose: () => void
}

export function MediaPickerDialog({
  mediaPicker,
  mediaLoading,
  mediaError,
  mediaAssets,
  onInsertMedia,
  onClose,
}: MediaPickerDialogProps) {
  return (
    <div className={styles.mediaOverlay} role="dialog" aria-modal="true" aria-label={`Pick ${mediaPicker.kind}`}>
      <div className={styles.mediaDialog}>
        <header className={styles.mediaHeader}>
          <h2>{mediaPicker.kind === 'featured' ? 'Pick featured media' : `Pick ${mediaPicker.kind}`}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </header>
        {mediaLoading ? (
          <p className={styles.muted}>Loading media...</p>
        ) : mediaError ? (
          <p className={styles.error} role="alert">{mediaError}</p>
        ) : mediaAssets.length === 0 ? (
          <p className={styles.muted}>No matching media yet.</p>
        ) : (
          <div className={styles.mediaGrid}>
            {mediaAssets.map((asset) => (
              <button
                key={asset.id}
                type="button"
                className={styles.mediaTile}
                onClick={() => onInsertMedia(asset)}
              >
                {asset.mimeType.startsWith('image/') ? (
                  <img src={asset.publicPath} alt="" />
                ) : (
                  <video src={asset.publicPath} />
                )}
                <span>{asset.filename}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
