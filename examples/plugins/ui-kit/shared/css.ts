/**
 * Shared scoped CSS for every UI Kit module. Plugin authors typically split
 * styles per-module, but the kit's modules share enough variables/tokens
 * that one bundle keeps the publisher dedup happy and the source readable.
 */

export const sharedCss = `
  .uikit-card{background:var(--uikit-card-bg,#fff);color:var(--uikit-card-fg,#0f172a);border:1px solid var(--uikit-card-border,#e5e7eb);border-radius:12px;padding:24px;font-family:inherit;line-height:1.55;}
  .uikit-stat{display:grid;gap:6px;font-family:inherit;}
  .uikit-stat__value{font-size:clamp(2rem,4vw,3rem);font-weight:700;line-height:1;color:var(--uikit-accent,#1d4ed8);}
  .uikit-stat__label{font-size:0.95rem;color:var(--uikit-muted,#64748b);}
  .uikit-feature{display:grid;gap:10px;font-family:inherit;}
  .uikit-feature__icon{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:10px;background:var(--uikit-accent-soft,#dbeafe);color:var(--uikit-accent,#1d4ed8);font-size:22px;}
  .uikit-feature__title{margin:0;font-size:1.1rem;font-weight:600;}
  .uikit-feature__body{margin:0;color:var(--uikit-muted,#475569);}
  .uikit-pricing{display:grid;gap:16px;padding:28px 24px;border-radius:14px;border:1px solid var(--uikit-card-border,#e5e7eb);background:var(--uikit-card-bg,#fff);font-family:inherit;}
  .uikit-pricing--featured{border-color:var(--uikit-accent,#1d4ed8);box-shadow:0 12px 32px rgba(29,78,216,0.15);}
  .uikit-pricing__name{margin:0;font-size:1.1rem;font-weight:600;color:var(--uikit-muted,#475569);}
  .uikit-pricing__price{display:flex;align-items:baseline;gap:6px;}
  .uikit-pricing__price strong{font-size:2.4rem;font-weight:700;color:var(--uikit-card-fg,#0f172a);line-height:1;}
  .uikit-pricing__price span{color:var(--uikit-muted,#64748b);}
  .uikit-pricing__features{margin:0;padding:0;list-style:none;display:grid;gap:6px;color:var(--uikit-card-fg,#0f172a);}
  .uikit-pricing__features li{padding-left:22px;position:relative;}
  .uikit-pricing__features li::before{content:"✓";position:absolute;left:0;color:var(--uikit-accent,#1d4ed8);font-weight:700;}
  .uikit-pricing__cta{display:inline-block;margin-top:8px;padding:10px 18px;border-radius:8px;background:var(--uikit-accent,#1d4ed8);color:#fff;text-decoration:none;font-weight:600;text-align:center;}
  .uikit-pricing--featured .uikit-pricing__cta{background:var(--uikit-card-fg,#0f172a);}
  .uikit-testimonial{display:grid;gap:14px;padding:24px;border-radius:12px;background:var(--uikit-quote-bg,#f8fafc);font-family:inherit;}
  .uikit-testimonial__quote{margin:0;font-size:1.05rem;line-height:1.6;color:var(--uikit-card-fg,#0f172a);}
  .uikit-testimonial__author{display:flex;flex-direction:column;}
  .uikit-testimonial__author strong{font-size:0.95rem;color:var(--uikit-card-fg,#0f172a);}
  .uikit-testimonial__author span{font-size:0.85rem;color:var(--uikit-muted,#64748b);}
  .uikit-callout{display:grid;grid-template-columns:auto 1fr;gap:14px;padding:18px 22px;border-radius:10px;background:var(--uikit-card-bg,#fff);border:1px solid;font-family:inherit;line-height:1.5;}
  .uikit-callout__icon{font-size:24px;line-height:1;}
  .uikit-callout__title{display:block;font-size:0.95rem;margin-bottom:2px;}
  .uikit-callout__text{margin:0;color:var(--uikit-muted,#475569);}
  .uikit-callout--info{border-color:#1d4ed8;}
  .uikit-callout--warning{border-color:#d97706;}
  .uikit-callout--danger{border-color:#dc2626;}
  .uikit-callout--success{border-color:#16a34a;}
`
