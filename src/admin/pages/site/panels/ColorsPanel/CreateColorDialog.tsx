import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@ui/components/Button'
import { Input } from '@ui/components/Input'
import { CloseIcon } from 'pixel-art-icons/icons/close'
import { CategoryComboBox } from './CategoryComboBox'
import { ColorValueField } from './ColorValueField'
import { DEFAULT_NEW_TOKEN_COLOR } from './helpers'
import dialogStyles from '../../../../shared/dialogs/SiteCreateDialog/SiteCreateDialog.module.css'

interface CreateColorDialogProps {
  categories: string[]
  defaultCategory: string
  onCancel: () => void
  onSubmit: (name: string, lightValue: string, category: string) => void
}

export function CreateColorDialog({
  categories,
  defaultCategory,
  onCancel,
  onSubmit,
}: CreateColorDialogProps) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(defaultCategory)
  const [lightValue, setLightValue] = useState(DEFAULT_NEW_TOKEN_COLOR)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const canSubmit = Boolean(name.trim() && lightValue.trim())

  useEffect(() => {
    requestAnimationFrame(() => nameInputRef.current?.focus())
  }, [])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    onSubmit(name, lightValue, category.trim())
  }

  return createPortal(
    <div
      className={dialogStyles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-color-dialog-title"
        className={dialogStyles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={dialogStyles.header}>
          <h2 id="create-color-dialog-title" className={dialogStyles.title}>
            Create color
          </h2>
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            aria-label="Close dialog"
            onClick={onCancel}
          >
            <CloseIcon size={12} aria-hidden="true" />
          </Button>
        </div>
        <form className={dialogStyles.form} onSubmit={handleSubmit}>
          <label className={dialogStyles.field}>
            <span className={dialogStyles.label}>Token name</span>
            <Input
              ref={nameInputRef}
              fieldSize="sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Token name"
              autoComplete="off"
              spellCheck={false}
              prefix="--"
            />
          </label>
          <CategoryComboBox
            label="Category"
            suggestions={categories}
            value={category}
            onValueChange={setCategory}
            onCommit={(next) => setCategory(next.trim())}
            fieldClassName={dialogStyles.field}
            labelClassName={dialogStyles.label}
          />
          <ColorValueField
            label="Default color"
            inputLabel="Default color"
            swatchLabel="Default color swatch"
            value={lightValue}
            onValueChange={setLightValue}
            onCommit={setLightValue}
            fieldClassName={dialogStyles.field}
            labelClassName={dialogStyles.label}
          />
          <div className={dialogStyles.actions}>
            <Button
              variant="secondary"
              size="sm"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={!canSubmit}
            >
              Create
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
