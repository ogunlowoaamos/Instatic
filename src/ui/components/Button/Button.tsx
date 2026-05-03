/**
 * Button — shared action button primitive for the editor UI.
 *
 * Replaces 33+ one-off button classes across 37 files.
 *
 * Variants:  ghost | secondary | primary | destructive
 * Sizes:     micro (18px) | xs (26px) | sm (28px, default) | md (32px) | lg (44px touch target)
 * Icon-only: iconOnly={true} → square, requires aria-label
 * Pressed:   pressed={true} → aria-pressed + active bg (toolbar toggles)
 * Tooltip:   tooltip={...} → wraps with Tooltip primitive (works for disabled too)
 *
 * Constraints:
 *   - CSS Modules only — no Tailwind, no inline styles (#402/#403)
 *   - Strictly achromatic tokens (#376) — all colours via --editor-* vars
 *   - pixel-art-icons only (#350)
 *   - No !important (#403)
 *   - default type="button" (never accidentally submits forms)
 */
import { forwardRef, type ReactNode } from "react";
import { cn } from "@ui/cn";
import { Tooltip, type TooltipSide } from "@ui/components/Tooltip";
import styles from "./Button.module.css";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: "ghost" | "secondary" | "primary" | "destructive";
  size?: "micro" | "xs" | "sm" | "md" | "lg";
  align?: "center" | "start" | "between";
  shape?: "default" | "pill" | "flush";
  tone?: "default" | "danger";
  iconOnly?: boolean;
  pressed?: boolean;
  active?: boolean;
  accentFill?: boolean;
  fullWidth?: boolean;
  menuItem?: boolean;
  navItem?: boolean;
  dangerHover?: boolean;
  numeric?: boolean;
  /**
   * Tooltip content shown on hover. Works even for disabled buttons — icon-only
   * disabled buttons especially benefit from a tooltip to communicate their
   * purpose when they cannot be activated.
   * Note: mouseenter fires on disabled <button> elements in all major browsers.
   */
  tooltip?: ReactNode;
  /** Which side the tooltip should prefer. Default: 'auto'. */
  tooltipSide?: TooltipSide;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant,
      size = "sm",
      align = "center",
      shape = "default",
      tone = "default",
      iconOnly = false,
      pressed,
      active = false,
      accentFill: _accentFill = false,
      fullWidth = false,
      menuItem = false,
      navItem = false,
      dangerHover = false,
      numeric = false,
      className,
      children,
      type = "button",
      "aria-label": ariaLabel,
      tooltip,
      tooltipSide,
      // Explicitly destructured so we can intercept disabled+tooltip combos.
      disabled,
      onClick,
      ...rest
    },
    ref,
  ) {
    if (import.meta.env.DEV && iconOnly && !ariaLabel) {
      console.warn(
        "[Button] iconOnly={true} requires an aria-label prop for accessibility.",
      );
    }

    // When a tooltip is provided alongside disabled, use aria-disabled instead
    // of the native disabled attribute so that mouseenter still fires and the
    // tooltip can show (native disabled silently swallows pointer events).
    // The click handler is intercepted so the button remains non-interactive.
    const useAriaDisabled = !!disabled && !!tooltip;

    const button = (
      <button
        ref={ref}
        type={type}
        aria-label={ariaLabel}
        aria-pressed={pressed !== undefined ? pressed : undefined}
        data-active={active ? "true" : undefined}
        data-tone={tone !== "default" ? tone : undefined}
        data-danger-hover={dangerHover ? "true" : undefined}
        className={cn(
          styles.btn,
          styles[`variant-${variant}`],
          styles[`size-${size}`],
          styles[`align-${align}`],
          shape !== "default" && styles[`shape-${shape}`],
          iconOnly && styles.iconOnly,
          fullWidth && styles.fullWidth,
          menuItem && styles.menuItem,
          navItem && styles.navItem,
          numeric && styles.numeric,
          className,
        )}
        {...rest}
        // These three override anything in ...rest to ensure correct disabled/
        // aria semantics when a tooltip is provided with a disabled button.
        disabled={useAriaDisabled ? undefined : (disabled || undefined)}
        aria-disabled={useAriaDisabled ? true : undefined}
        onClick={useAriaDisabled ? (e: React.MouseEvent<HTMLButtonElement>) => e.preventDefault() : onClick}
      >
        {children}
      </button>
    );

    if (tooltip) {
      return (
        <Tooltip content={tooltip} side={tooltipSide ?? "auto"}>
          {button}
        </Tooltip>
      );
    }

    return button;
  },
);
