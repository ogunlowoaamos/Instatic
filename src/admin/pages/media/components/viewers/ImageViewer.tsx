/**
 * ImageViewer — the viewer body for image assets.
 *
 * - Click-and-drag the crosshair (FocalPointPicker) to set the focal point;
 *   commits via the supplied callback.
 * - Reuses the existing FocalPointPicker so the focal-edit UX matches what
 *   the docked inspector previously offered.
 */
import { FocalPointPicker } from '../FocalPointPicker/FocalPointPicker'
import styles from './ImageViewer.module.css'

interface ImageViewerProps {
  src: string
  alt: string
  focalX: number
  focalY: number
  onFocalChange: (x: number, y: number) => void
}

export function ImageViewer({ src, alt, focalX, focalY, onFocalChange }: ImageViewerProps) {
  return (
    <div className={styles.root}>
      <FocalPointPicker
        src={src}
        alt={alt}
        focalX={focalX}
        focalY={focalY}
        onChange={onFocalChange}
      />
    </div>
  )
}
