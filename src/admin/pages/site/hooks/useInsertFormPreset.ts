import type { InsertLocation } from '@site/store/insertLocation'
import type { FormPreset } from '@site/module-picker'
import { useInsertPreset } from './useInsertPreset'

export function useInsertFormPreset() {
  const insertPreset = useInsertPreset()
  return (preset: FormPreset, explicitTarget?: string | InsertLocation) =>
    insertPreset(preset, explicitTarget)
}
