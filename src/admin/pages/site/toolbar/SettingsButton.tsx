/**
 * SettingsButton — opens the Settings modal.
 */
import { useEditorStore } from '@site/store/store'
import { SettingsCogIcon } from 'pixel-art-icons/icons/settings-cog'
import { Button } from '@ui/components/Button'

export function SettingsButton() {
  const openSettings = useEditorStore((s) => s.openSettingsModal)

  return (
    <Button
      variant="ghost"
      size="sm"
      iconOnly
      aria-label="Open settings"
      tooltip="Settings"
      onClick={() => openSettings('pages')}
      data-testid="toolbar-settings-btn"
    >
      <SettingsCogIcon size={16} aria-hidden="true" />
    </Button>
  )
}
