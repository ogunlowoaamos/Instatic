import type { PointerEvent as ReactPointerEvent } from 'react'
import type { IconComponent } from 'pixel-art-icons/types'
import { BracesIcon } from 'pixel-art-icons/icons/braces'
import { GlobeSolidIcon } from 'pixel-art-icons/icons/globe-solid'
import { HandGrabSolidIcon } from 'pixel-art-icons/icons/hand-grab-solid'
import { LayoutSolidIcon } from 'pixel-art-icons/icons/layout-solid'
import { PlusIcon } from 'pixel-art-icons/icons/plus'
import { ModuleIcon } from '@site/ui/ModuleIcon'
import { Button } from '@ui/components/Button'
import {
  itemDescription,
  type ModuleInserterAccent,
  type ModuleInserterItem,
  type ModuleInserterSectionId,
} from './moduleInserterModel'
import { ModuleWireframe } from './ModuleWireframe'
import styles from './ModuleInserterDialog.module.css'

export type InserterView = 'grid' | 'list'

export interface SectionDefinition {
  id: ModuleInserterSectionId
  name: string
  accent: ModuleInserterAccent
  icon: IconComponent
}

interface InserterItemButtonProps {
  item: ModuleInserterItem
  view: InserterView
  selected: boolean
  onSelect: () => void
  onPick: () => void
  onPointerDown: (
    item: ModuleInserterItem,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void
}

export function ModuleInserterItemButton({
  item,
  view,
  selected,
  onSelect,
  onPick,
  onPointerDown,
}: InserterItemButtonProps) {
  const isList = view === 'list'
  return (
    <Button
      variant="ghost"
      size="sm"
      align="start"
      className={isList ? styles.rowItem : styles.tileItem}
      onPointerMove={onSelect}
      onFocus={onSelect}
      onClick={onPick}
      onPointerDown={(event) => onPointerDown(item, event)}
      data-selected={selected ? 'true' : undefined}
      data-accent={item.accent}
      data-module-id={item.kind === 'module' ? item.id : undefined}
      data-layout-id={item.kind === 'layout' ? item.id : undefined}
      data-vc-id={item.kind === 'component' ? item.id : undefined}
    >
      {isList ? <ItemRow item={item} /> : <ItemTile item={item} />}
    </Button>
  )
}

function ItemTile({ item }: { item: ModuleInserterItem }) {
  return (
    <>
      <span className={styles.dragGrip} aria-hidden="true">
        <HandGrabSolidIcon size={13} />
      </span>
      <span className={styles.tileAdd} aria-hidden="true">
        <PlusIcon size={13} />
      </span>
      <span className={styles.tileStage}>
        <ModuleWireframe node={item.wire} />
      </span>
      <span className={styles.tileMeta}>
        <span className={styles.itemTitle}>
          <ItemIcon item={item} />
          <span>{item.name}</span>
        </span>
        <span className={styles.itemDescription}>{itemDescription(item)}</span>
      </span>
    </>
  )
}

function ItemRow({ item }: { item: ModuleInserterItem }) {
  return (
    <>
      <span className={styles.rowGrip} aria-hidden="true">
        <HandGrabSolidIcon size={13} />
      </span>
      <span className={styles.rowThumb}>
        <ModuleWireframe node={item.wire} />
      </span>
      <span className={styles.rowMain}>
        <span className={styles.itemTitle}>
          <ItemIcon item={item} />
          <span>{item.name}</span>
        </span>
        <span className={styles.itemDescription}>{itemDescription(item)}</span>
      </span>
    </>
  )
}

function ItemIcon({ item }: { item: ModuleInserterItem }) {
  if (item.kind === 'module') {
    return <ModuleIcon module={item.module} size={13} aria-hidden="true" />
  }
  if (item.kind === 'layout') {
    return <LayoutSolidIcon size={13} aria-hidden="true" />
  }
  if (item.kind === 'component') {
    return <BracesIcon size={13} aria-hidden="true" />
  }
  return <GlobeSolidIcon size={13} aria-hidden="true" />
}
