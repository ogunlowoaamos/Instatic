import { Button } from '@ui/components/Button'
import { EditIcon } from 'pixel-art-icons/icons/edit'
import styles from './RatioModeToggle.module.css'

/**
 * Compact "switch the ratio field between preset list and custom number"
 * toggle. Designed to sit in the labelSuffix slot of a ControlRow so it
 * never competes with the input for horizontal space.
 */
export function RatioModeToggle({
  isCustom,
  ariaLabel,
  onToggle,
}: {
  isCustom: boolean
  ariaLabel: string
  onToggle: () => void
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      iconOnly
      className={styles.ratioToggle}
      aria-label={ariaLabel}
      tooltip={isCustom ? 'Choose preset ratio' : 'Enter custom ratio'}
      pressed={isCustom}
      onClick={onToggle}
    >
      <EditIcon size={11} aria-hidden="true" />
    </Button>
  )
}
