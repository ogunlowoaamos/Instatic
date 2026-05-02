import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useEditorStore } from "@core/editor-store/store";
import type {
  FrameworkColorCategory,
  FrameworkColorToken,
  FrameworkColorUtilityType,
} from "@core/page-tree/types";
import {
  generateFrameworkColorVariableSets,
  normalizeFrameworkColorSlug,
} from "@core/framework/colors";
import { Button } from "@ui/components/Button";
import { ColorInput } from "@ui/components/ColorInput";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@ui/components/ContextMenu";
import { FilterBar, type FilterBarItem } from "@ui/components/FilterBar";
import { Input } from "@ui/components/Input";
import { Select } from "@ui/components/Select";
import { Switch } from "@ui/components/Switch";
import { ChevronDownIcon } from "@ui/icons/icons/chevron-down";
import { ChevronUpIcon } from "@ui/icons/icons/chevron-up";
import { CloseIcon } from "@ui/icons/icons/close";
import { Copy2SharpIcon } from "@ui/icons/icons/copy-2-sharp";
import { DeleteIcon } from "@ui/icons/icons/delete";
import { FilePlusIcon } from "@ui/icons/icons/file-plus";
import { MinusIcon } from "@ui/icons/icons/minus";
import { PlusIcon } from "@ui/icons/icons/plus";
import { TokenizedColorField } from "../PropertyControls/TokenizedColorField";
import { PanelHeader } from "../shared/PanelHeader";
import dialogStyles from "../SiteCreateDialog/SiteCreateDialog.module.css";
import styles from "./ColorsPanel.module.css";

interface ColorsPanelProps {
  variant?: "docked";
}

const EMPTY_COLORS = { categories: [], tokens: [] };
const UTILITY_OPTIONS: Array<{
  key: FrameworkColorUtilityType;
  label: string;
}> = [
  { key: "text", label: "Text utility" },
  { key: "background", label: "Background utility" },
  { key: "border", label: "Border utility" },
  { key: "fill", label: "Fill utility" },
];

type ColorTokenPatch = Parameters<
  ReturnType<typeof useEditorStore.getState>["updateFrameworkColorToken"]
>[1];
type ColorPreviewVariable = ReturnType<
  typeof generateFrameworkColorVariableSets
>["light"][number];

interface TokenContextMenuState {
  x: number;
  y: number;
  tokenId: string;
}

export function ColorsPanel({ variant = "docked" }: ColorsPanelProps) {
  const isOpen = useEditorStore((s) => s.colorsPanelOpen);
  const site = useEditorStore((s) => s.site);
  const setColorsPanelOpen = useEditorStore((s) => s.setColorsPanelOpen);
  const createFrameworkColorCategory = useEditorStore(
    (s) => s.createFrameworkColorCategory,
  );
  const createFrameworkColorToken = useEditorStore(
    (s) => s.createFrameworkColorToken,
  );
  const updateFrameworkColorToken = useEditorStore(
    (s) => s.updateFrameworkColorToken,
  );
  const duplicateFrameworkColorToken = useEditorStore(
    (s) => s.duplicateFrameworkColorToken,
  );
  const reorderFrameworkColorToken = useEditorStore(
    (s) => s.reorderFrameworkColorToken,
  );
  const deleteFrameworkColorToken = useEditorStore(
    (s) => s.deleteFrameworkColorToken,
  );

  const [query, setQuery] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [expandedTokenId, setExpandedTokenId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createCategoryDialogOpen, setCreateCategoryDialogOpen] =
    useState(false);
  const [contextMenu, setContextMenu] = useState<TokenContextMenuState | null>(
    null,
  );

  const colors = site?.settings.framework?.colors ?? EMPTY_COLORS;
  const filteredTokens = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return colors.tokens
      .filter(
        (token) => !activeCategoryId || token.categoryId === activeCategoryId,
      )
      .filter(
        (token) =>
          !normalizedQuery ||
          token.slug.toLowerCase().includes(normalizedQuery),
      )
      .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  }, [activeCategoryId, colors.tokens, query]);
  const contextToken = contextMenu
    ? (colors.tokens.find((token) => token.id === contextMenu.tokenId) ?? null)
    : null;

  if (!isOpen || variant !== "docked") return null;

  function handleCreate(
    name: string,
    lightValue: string,
    categoryId: string | null,
  ) {
    const token = createFrameworkColorToken({
      slug: name,
      lightValue,
      categoryId,
      darkModeEnabled: false,
    });
    setExpandedTokenId(token.id);
    setCreateDialogOpen(false);
  }

  function handleCreateCategory(name: string) {
    createFrameworkColorCategory(name);
    setCreateCategoryDialogOpen(false);
  }

  function openTokenContextMenu(
    tokenId: string,
    event: MouseEvent<HTMLElement>,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY, tokenId });
  }

  function handleDuplicateToken(token: FrameworkColorToken) {
    const copy = duplicateFrameworkColorToken(token.id);
    if (copy) setExpandedTokenId(copy.id);
    setContextMenu(null);
  }

  function handleMoveToken(
    token: FrameworkColorToken,
    direction: "up" | "down",
  ) {
    reorderFrameworkColorToken(token.id, direction);
    setContextMenu(null);
  }

  function handleDeleteToken(token: FrameworkColorToken) {
    deleteFrameworkColorToken(token.id);
    if (expandedTokenId === token.id) setExpandedTokenId(null);
    setContextMenu(null);
  }

  return (
    <>
      <aside
        role="complementary"
        aria-label="Colors"
        data-panel=""
        data-testid="colors-panel"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className={styles.panel}
      >
        <PanelHeader
          panelId="colors"
          title="Colors"
          onClose={() => setColorsPanelOpen(false)}
        >
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            aria-label="Create color"
            title="Create color"
            onClick={() => setCreateDialogOpen(true)}
          >
            <FilePlusIcon size={13} aria-hidden="true" />
          </Button>
        </PanelHeader>

        <div className={styles.content}>
          <FilterBar<string | null>
            items={[
              { value: null, label: "All" },
              ...colors.categories.map<FilterBarItem<string | null>>(
                (category) => ({
                  value: category.id,
                  label: category.name,
                }),
              ),
            ]}
            value={activeCategoryId}
            onValueChange={setActiveCategoryId}
            search={{
              value: query,
              onValueChange: setQuery,
              onClear: () => setQuery(""),
              placeholder: "Search colors",
              ariaLabel: "Search colors",
            }}
            groupLabel="Color categories"
            inlineActions={
              <Button
                variant="ghost"
                size="xs"
                aria-label="Create category"
                onClick={() => setCreateCategoryDialogOpen(true)}
              >
                Add category
              </Button>
            }
          />

          {colors.tokens.length === 0 ? (
            <div className={styles.emptyState}>
              <span>No colors yet.</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
              >
                Create color
              </Button>
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className={styles.emptyState}>
              No colors match the current filters.
            </div>
          ) : (
            <div className={styles.rows}>
              {filteredTokens.map((token) => (
                <ColorTokenCard
                  key={token.id}
                  token={token}
                  categories={colors.categories}
                  categoryName={
                    colors.categories.find(
                      (category) => category.id === token.categoryId,
                    )?.name
                  }
                  expanded={expandedTokenId === token.id}
                  onToggle={() =>
                    setExpandedTokenId(
                      expandedTokenId === token.id ? null : token.id,
                    )
                  }
                  onPatch={(patch) =>
                    updateFrameworkColorToken(token.id, patch)
                  }
                  onContextMenu={(event) =>
                    openTokenContextMenu(token.id, event)
                  }
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {createDialogOpen && (
        <CreateColorDialog
          categories={colors.categories}
          defaultCategoryId={activeCategoryId}
          onCancel={() => setCreateDialogOpen(false)}
          onSubmit={handleCreate}
        />
      )}
      {createCategoryDialogOpen && (
        <NameDialog
          title="Create category"
          label="Category name"
          submitLabel="Create"
          onCancel={() => setCreateCategoryDialogOpen(false)}
          onSubmit={handleCreateCategory}
        />
      )}
      {contextMenu && contextToken && (
        <ColorTokenContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canMoveUp={canMoveToken(colors.tokens, contextToken, "up")}
          canMoveDown={canMoveToken(colors.tokens, contextToken, "down")}
          onClose={() => setContextMenu(null)}
          onDuplicate={() => handleDuplicateToken(contextToken)}
          onMoveUp={() => handleMoveToken(contextToken, "up")}
          onMoveDown={() => handleMoveToken(contextToken, "down")}
          onDelete={() => handleDeleteToken(contextToken)}
        />
      )}
    </>
  );
}

function ColorTokenCard({
  token,
  categories,
  categoryName,
  expanded,
  onToggle,
  onPatch,
  onContextMenu,
}: {
  token: FrameworkColorToken;
  categories: FrameworkColorCategory[];
  categoryName?: string;
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: ColorTokenPatch) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
}) {
  const generatedSummary = colorGeneratedSummary(token);
  return (
    <div className={styles.card}>
      <div className={styles.row} onContextMenu={onContextMenu}>
        <span className={styles.swatches}>
          <ColorInput
            value={token.lightValue}
            swatchValue={token.lightValue}
            fieldSize="xs"
            aria-label={`Default color swatch ${token.slug}`}
            onChange={(event) => onPatch({ lightValue: event.target.value })}
          />
          {token.darkModeEnabled && (
            <ColorInput
              value={token.darkValue}
              swatchValue={token.darkValue}
              fieldSize="xs"
              aria-label={`Alternate color swatch ${token.slug}`}
              onChange={(event) =>
                onPatch({
                  darkValue: event.target.value,
                  darkModeEnabled: true,
                })
              }
            />
          )}
        </span>
        <button
          type="button"
          className={styles.rowToggle}
          aria-expanded={expanded}
          aria-label={`Edit color ${token.slug}`}
          onClick={onToggle}
          onContextMenu={onContextMenu}
        >
          <span className={styles.rowText}>
            <span className={styles.rowTitle}>--{token.slug}</span>
            <span className={styles.rowMeta}>
              {categoryName ?? "Uncategorized"}
            </span>
          </span>
          <span className={styles.rowSummary}>{generatedSummary}</span>
        </button>
      </div>

      {expanded && (
        <ColorTokenEditor
          token={token}
          categories={categories}
          onPatch={onPatch}
        />
      )}
    </div>
  );
}

function ColorTokenEditor({
  token,
  categories,
  onPatch,
}: {
  token: FrameworkColorToken;
  categories: FrameworkColorCategory[];
  onPatch: (patch: ColorTokenPatch) => void;
}) {
  const [slug, setSlug] = useState(token.slug);
  const [lightValue, setLightValue] = useState(token.lightValue);
  const [alternateValue, setAlternateValue] = useState(
    token.darkModeEnabled ? token.darkValue : "",
  );
  const [shadeCount, setShadeCount] = useState(
    String(token.generateShades.count),
  );
  const [tintCount, setTintCount] = useState(String(token.generateTints.count));
  const previewToken = useMemo<FrameworkColorToken>(
    () => ({
      ...token,
      lightValue: lightValue.trim() || token.lightValue,
      darkValue: alternateValue.trim() || token.darkValue,
      darkModeEnabled: alternateValue.trim().length > 0,
      generateShades: {
        ...token.generateShades,
        count: clampVariantCountInput(shadeCount),
      },
      generateTints: {
        ...token.generateTints,
        count: clampVariantCountInput(tintCount),
      },
    }),
    [alternateValue, lightValue, shadeCount, tintCount, token],
  );
  const previewVariables = generateFrameworkColorVariableSets({
    categories: [],
    tokens: [previewToken],
  }).light;
  const shadeVariables = previewVariables.filter((variable) =>
    variable.variantName?.startsWith("d-"),
  );
  const tintVariables = previewVariables.filter((variable) =>
    variable.variantName?.startsWith("l-"),
  );

  useEffect(() => {
    setSlug(token.slug);
    setLightValue(token.lightValue);
    setAlternateValue(token.darkModeEnabled ? token.darkValue : "");
    setShadeCount(String(token.generateShades.count));
    setTintCount(String(token.generateTints.count));
  }, [
    token.categoryId,
    token.darkModeEnabled,
    token.darkValue,
    token.generateShades.count,
    token.generateTints.count,
    token.id,
    token.lightValue,
    token.slug,
  ]);

  function commitLightValue(nextValue = lightValue) {
    onPatch({ lightValue: nextValue });
  }

  function commitAlternateValue(nextValue = alternateValue) {
    const trimmed = nextValue.trim();
    onPatch({
      darkValue: trimmed,
      darkModeEnabled: trimmed.length > 0,
    });
  }

  function commitVariantCount(kind: "shade" | "tint", value: string) {
    const nextCount = clampVariantCountInput(value);
    if (kind === "shade") {
      setShadeCount(String(nextCount));
      onPatch({ generateShades: { count: nextCount } });
    } else {
      setTintCount(String(nextCount));
      onPatch({ generateTints: { count: nextCount } });
    }
  }

  return (
    <div className={styles.editor}>
      <label className={styles.field}>
        <span>Token name</span>
        <Input
          fieldSize="sm"
          value={slug}
          aria-label="Token name"
          onChange={(event) => setSlug(event.target.value)}
          onBlur={() => {
            const nextSlug = normalizeFrameworkColorSlug(slug);
            setSlug(nextSlug);
            onPatch({ slug: nextSlug });
          }}
        />
      </label>

      <label className={styles.field}>
        <span>Category</span>
        <Select
          fieldSize="sm"
          value={token.categoryId ?? ""}
          aria-label="Category"
          options={[
            { value: "", label: "Uncategorized" },
            ...categories.map((category) => ({
              value: category.id,
              label: category.name,
            })),
          ]}
          onChange={(event) =>
            onPatch({ categoryId: event.currentTarget.value || null })
          }
        />
      </label>

      <ColorValueField
        label="Default color"
        inputLabel="Default color"
        swatchLabel={`Default color swatch ${token.slug}`}
        value={lightValue}
        excludeTokenId={token.id}
        onValueChange={setLightValue}
        onCommit={commitLightValue}
      />

      <ColorValueField
        label="Alt color"
        inputLabel="Alt color"
        swatchLabel={`Alternate color swatch ${token.slug}`}
        value={alternateValue}
        excludeTokenId={token.id}
        onValueChange={setAlternateValue}
        onCommit={commitAlternateValue}
        placeholder="Optional"
      />

      <div className={styles.utilityGrid} aria-label="Generate utility classes">
        {UTILITY_OPTIONS.map((option) => (
          <SwitchRow
            key={option.key}
            label={option.label}
            checked={token.generateUtilities[option.key]}
            onCheckedChange={(checked) =>
              onPatch({
                generateUtilities: { [option.key]: checked },
              })
            }
          />
        ))}
      </div>

      <SwitchRow
        label="Transparent variants"
        checked={token.generateTransparent}
        onCheckedChange={(checked) => onPatch({ generateTransparent: checked })}
      />

      <div className={styles.variantControl}>
        <SwitchRow
          label="Generate shades"
          checked={token.generateShades.enabled}
          onCheckedChange={(checked) =>
            onPatch({ generateShades: { enabled: checked } })
          }
        />
        <VariantCountStepper
          label="Shade"
          count={clampVariantCountInput(shadeCount)}
          onCountChange={(count) => commitVariantCount("shade", String(count))}
        />
        <ColorVariantPreview
          kind="Shade"
          tokenSlug={token.slug}
          variables={shadeVariables}
        />
      </div>

      <div className={styles.variantControl}>
        <SwitchRow
          label="Generate tints"
          checked={token.generateTints.enabled}
          onCheckedChange={(checked) =>
            onPatch({ generateTints: { enabled: checked } })
          }
        />
        <VariantCountStepper
          label="Tint"
          count={clampVariantCountInput(tintCount)}
          onCountChange={(count) => commitVariantCount("tint", String(count))}
        />
        <ColorVariantPreview
          kind="Tint"
          tokenSlug={token.slug}
          variables={tintVariables}
        />
      </div>
    </div>
  );
}

function ColorValueField({
  label,
  inputLabel,
  swatchLabel,
  value,
  excludeTokenId,
  onValueChange,
  onCommit,
  placeholder,
  fieldClassName = styles.field,
  labelClassName,
}: {
  label: string;
  inputLabel: string;
  swatchLabel: string;
  value: string;
  excludeTokenId?: string;
  onValueChange: (value: string) => void;
  onCommit: (value: string) => void;
  placeholder?: string;
  fieldClassName?: string;
  labelClassName?: string;
}) {
  function commit(nextValue = value) {
    onCommit(nextValue);
  }

  return (
    <div className={fieldClassName}>
      <span className={labelClassName}>{label}</span>
      <TokenizedColorField
        value={value}
        inputLabel={inputLabel}
        swatchLabel={swatchLabel}
        placeholder={placeholder}
        excludeTokenId={excludeTokenId}
        onTextChange={onValueChange}
        onTextBlur={() => commit()}
        onSwatchChange={(nextValue) => {
          onValueChange(nextValue);
          commit(nextValue);
        }}
        onTokenSelect={(nextValue) => {
          onValueChange(nextValue);
          commit(nextValue);
        }}
      />
    </div>
  );
}

function VariantCountStepper({
  label,
  count,
  onCountChange,
}: {
  label: "Shade" | "Tint";
  count: number;
  onCountChange: (count: number) => void;
}) {
  const min = 0;
  const max = 12;
  const lowerLabel = label.toLowerCase();
  return (
    <div
      className={styles.stepperRow}
      role="group"
      aria-label={`${label} variants`}
    >
      <span>{label} variants</span>
      <div className={styles.stepperControl}>
        <Button
          variant="ghost"
          size="xs"
          iconOnly
          aria-label={`Decrease ${lowerLabel} variants`}
          disabled={count <= min}
          onClick={() => onCountChange(Math.max(min, count - 1))}
        >
          <MinusIcon size={12} aria-hidden="true" />
        </Button>
        <span className={styles.stepperValue} aria-live="polite">
          {count}
        </span>
        <Button
          variant="secondary"
          size="xs"
          iconOnly
          aria-label={`Increase ${lowerLabel} variants`}
          disabled={count >= max}
          onClick={() => onCountChange(Math.min(max, count + 1))}
        >
          <PlusIcon size={12} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className={styles.checkboxRow}>
      <span>{label}</span>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        switchSize="sm"
        aria-label={label}
      />
    </div>
  );
}

function ColorVariantPreview({
  kind,
  tokenSlug,
  variables,
}: {
  kind: "Shade" | "Tint";
  tokenSlug: string;
  variables: ColorPreviewVariable[];
}) {
  if (variables.length === 0) return null;

  return (
    <div className={styles.variantPreview} aria-label={`${kind} previews`}>
      {variables.map((variable) => (
        <ColorInput
          key={variable.name}
          value={variable.value}
          swatchValue={variable.value}
          fieldSize="xs"
          disabled
          aria-label={`${kind} preview ${tokenSlug} ${variable.variantName ?? variable.variantId}`}
        />
      ))}
    </div>
  );
}

function CreateColorDialog({
  categories,
  defaultCategoryId,
  onCancel,
  onSubmit,
}: {
  categories: FrameworkColorCategory[];
  defaultCategoryId: string | null;
  onCancel: () => void;
  onSubmit: (
    name: string,
    lightValue: string,
    categoryId: string | null,
  ) => void;
}) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(defaultCategoryId ?? "");
  const [lightValue, setLightValue] = useState("hsla(238, 100%, 62%, 1)");
  const canSubmit = Boolean(name.trim() && lightValue.trim());

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(name, lightValue, categoryId || null);
  }

  return createPortal(
    <div
      className={dialogStyles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
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
              fieldSize="sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Token name"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className={dialogStyles.field}>
            <span className={dialogStyles.label}>Category</span>
            <Select
              fieldSize="sm"
              value={categoryId}
              aria-label="Category"
              options={[
                { value: "", label: "Uncategorized" },
                ...categories.map((category) => ({
                  value: category.id,
                  label: category.name,
                })),
              ]}
              onChange={(event) => setCategoryId(event.currentTarget.value)}
            />
          </label>
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
  );
}

function NameDialog({
  title,
  label,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  label: string;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const canSubmit = Boolean(name.trim());

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit(name);
  }

  return createPortal(
    <div
      className={dialogStyles.backdrop}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="color-name-dialog-title"
        className={dialogStyles.dialog}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={dialogStyles.header}>
          <h2 id="color-name-dialog-title" className={dialogStyles.title}>
            {title}
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
            <span className={dialogStyles.label}>{label}</span>
            <Input
              fieldSize="sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label={label}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
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
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function ColorTokenContextMenu({
  x,
  y,
  canMoveUp,
  canMoveDown,
  onClose,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  x: number;
  y: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onClose: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}) {
  return (
    <ContextMenu x={x} y={y} ariaLabel="Color token actions" onClose={onClose}>
      <ContextMenuItem onClick={onDuplicate}>
        <span aria-hidden="true">
          <Copy2SharpIcon size={13} />
        </span>
        Duplicate
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem disabled={!canMoveUp} onClick={onMoveUp}>
        <span aria-hidden="true">
          <ChevronUpIcon size={13} />
        </span>
        Move up
      </ContextMenuItem>
      <ContextMenuItem disabled={!canMoveDown} onClick={onMoveDown}>
        <span aria-hidden="true">
          <ChevronDownIcon size={13} />
        </span>
        Move down
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuItem danger onClick={onDelete}>
        <span aria-hidden="true">
          <DeleteIcon size={13} />
        </span>
        Remove
      </ContextMenuItem>
    </ContextMenu>
  );
}

function canMoveToken(
  tokens: FrameworkColorToken[],
  token: FrameworkColorToken,
  direction: "up" | "down",
): boolean {
  const group = tokens
    .filter((candidate) => candidate.categoryId === token.categoryId)
    .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  const index = group.findIndex((candidate) => candidate.id === token.id);
  return direction === "up"
    ? index > 0
    : index >= 0 && index < group.length - 1;
}

function colorGeneratedSummary(token: FrameworkColorToken): string {
  const utilities = [
    token.generateUtilities.text ? "Text" : null,
    token.generateUtilities.background ? "Bg" : null,
    token.generateUtilities.border ? "Border" : null,
    token.generateUtilities.fill ? "Fill" : null,
  ].filter(Boolean);
  const variantCount =
    1 +
    (token.generateTransparent ? 10 : 0) +
    (token.generateShades.enabled ? token.generateShades.count : 0) +
    (token.generateTints.enabled ? token.generateTints.count : 0);

  return `${utilities.length > 0 ? utilities.join(" · ") : "No utilities"} · ${variantCount} vars`;
}

function clampVariantCountInput(value: string | number): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(12, Math.floor(numericValue)));
}
