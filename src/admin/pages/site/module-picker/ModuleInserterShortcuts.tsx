import styles from './ModuleInserterDialog.module.css'

export function ModuleInserterShortcuts() {
  return (
    <div
      className={styles.shortcutFooter}
      aria-label="Module inserter keyboard shortcuts"
    >
      <div className={styles.shortcutHint}>
        <span className={styles.keycap}>↑</span>
        <span className={styles.keycap}>↓</span>
        <span className={styles.keycap}>←</span>
        <span className={styles.keycap}>→</span>
        <span>navigate</span>
      </div>
      <div className={styles.shortcutHint}>
        <span className={styles.keycap}>←</span>
        <span>categories</span>
        <span className={styles.keycap}>↵</span>
        <span>add</span>
      </div>
      <div className={styles.shortcutHint}>
        <span className={styles.keycap}>/</span>
        <span>search</span>
        <span className={styles.keycap}>drag</span>
        <span>to canvas</span>
      </div>
    </div>
  )
}
