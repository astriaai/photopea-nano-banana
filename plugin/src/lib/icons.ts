// Ported from nano-banana-photoshop-uxp/nano-banana/ui-src/src/lib/icons.ts (commit ffe30c1b).
// Icon set for the option-bar dropdowns. The provider / control SVGs are the
// same markup astria.ai's prompt composer uses (sdbooth
// app/javascript/shared/select_menu_icons.js) so the plugin's model picker
// matches the web app. Keep this a plain string map: MenuIcon injects the
// markup and sizes the wrapper.
export const ICONS: Record<string, string> = {
  "search": "<svg viewBox=\"0 0 20 20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" aria-hidden=\"true\"><path d=\"m14 14 3 3\"/><circle cx=\"8.5\" cy=\"8.5\" r=\"5.5\"/></svg>",
  "clock": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3 2\"/></svg>",
  "layers": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M12 3 4 7l8 4 8-4-8-4Z\"/><path d=\"m4 12 8 4 8-4\"/><path d=\"m4 17 8 4 8-4\"/></svg>",
  "images": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M7 7h9a2 2 0 0 1 2 2v9\"/><rect x=\"4\" y=\"4\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M9 20h9a2 2 0 0 0 2-2V9\"/></svg>",
  "resolution": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><rect x=\"5\" y=\"5\" width=\"14\" height=\"14\" rx=\"2.5\"/><path d=\"M9 9h2.5\"/><path d=\"M9 9v2.5\"/><path d=\"M15 15h-2.5\"/><path d=\"M15 15v-2.5\"/></svg>",
  "cog": "<svg viewBox=\"0 0 20 20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.6\" aria-hidden=\"true\"><path d=\"M8.7 2.8h2.6l.4 1.8c.4.1.8.3 1.1.5l1.6-1 1.8 1.8-1 1.6c.2.4.4.7.5 1.1l1.8.4v2.6l-1.8.4c-.1.4-.3.8-.5 1.1l1 1.6-1.8 1.8-1.6-1c-.4.2-.7.4-1.1.5l-.4 1.8H8.7l-.4-1.8c-.4-.1-.8-.3-1.1-.5l-1.6 1-1.8-1.8 1-1.6c-.2-.4-.4-.7-.5-1.1l-1.8-.4V9l1.8-.4c.1-.4.3-.8.5-1.1l-1-1.6 1.8-1.8 1.6 1c.4-.2.7-.4 1.1-.5Z\"/><circle cx=\"10\" cy=\"10.3\" r=\"2.6\"/></svg>",
  "folder": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.7\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M3 7.5A2.5 2.5 0 0 1 5.5 5H9l2 2.5h7.5A2.5 2.5 0 0 1 21 10v6.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 16.5Z\"/></svg>",
  "provider-google": "<svg class=\"provider-icon provider-icon-google\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68q.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58a12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68q-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96q2.19.93 3.81 2.55t2.55 3.81\"/></svg>",
  "provider-openai": "<svg class=\"provider-icon provider-icon-openai\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M22.282 9.821a6 6 0 0 0-.516-4.91a6.05 6.05 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a6 6 0 0 0-3.998 2.9a6.05 6.05 0 0 0 .743 7.097a5.98 5.98 0 0 0 .51 4.911a6.05 6.05 0 0 0 6.515 2.9A6 6 0 0 0 13.26 24a6.06 6.06 0 0 0 5.772-4.206a6 6 0 0 0 3.997-2.9a6.06 6.06 0 0 0-.747-7.073M13.26 22.43a4.48 4.48 0 0 1-2.876-1.04l.141-.081l4.779-2.758a.8.8 0 0 0 .392-.681v-6.737l2.02 1.168a.07.07 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494M3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085l4.783 2.759a.77.77 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646M2.34 7.896a4.5 4.5 0 0 1 2.366-1.973V11.6a.77.77 0 0 0 .388.677l5.815 3.354l-2.02 1.168a.08.08 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.08.08 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667m2.01-3.023l-.141-.085l-4.774-2.782a.78.78 0 0 0-.785 0L9.409 9.23V6.897a.07.07 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.8.8 0 0 0-.393.681zm1.097-2.365l2.602-1.5l2.607 1.5v2.999l-2.597 1.5l-2.607-1.5Z\"/></svg>",
  "provider-microsoft": "<svg class=\"provider-icon provider-icon-microsoft\" viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M7.462 0H0v7.19h7.462zM16 0H8.538v7.19H16zM7.462 8.211H0V16h7.462zm8.538 0H8.538V16H16z\"/></svg>",
  "provider-meta": "<svg class=\"provider-icon provider-icon-meta\" viewBox=\"0 0 16 16\" aria-hidden=\"true\"><path fill=\"currentColor\" fill-rule=\"evenodd\" d=\"M8.217 5.243C9.145 3.988 10.171 3 11.483 3 13.96 3 16 6.153 16.001 9.907c0 2.29-.986 3.725-2.757 3.725-1.543 0-2.395-.866-3.924-3.424l-.667-1.123-.118-.197a55 55 0 0 0-.53-.877l-1.178 2.08c-1.673 2.925-2.615 3.541-3.923 3.541C1.086 13.632 0 12.217 0 9.973 0 6.388 1.995 3 4.598 3q.477-.001.924.122c.31.086.611.22.913.407.577.359 1.154.915 1.782 1.714m1.516 2.224q-.378-.615-.727-1.133L9 6.326c.845-1.305 1.543-1.954 2.372-1.954 1.723 0 3.102 2.537 3.102 5.653 0 1.188-.39 1.877-1.195 1.877-.773 0-1.142-.51-2.61-2.87zM4.846 4.756c.725.1 1.385.634 2.34 2.001A212 212 0 0 0 5.551 9.3c-1.357 2.126-1.826 2.603-2.581 2.603-.777 0-1.24-.682-1.24-1.9 0-2.602 1.298-5.264 2.846-5.264q.137 0 .27.018\"/></svg>",
  "provider-grok": "<svg class=\"provider-icon provider-icon-grok\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M14.234 10.162L22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299l-.929-1.329L3.076 1.56h3.182l5.965 8.532l.929 1.329l7.754 11.09h-3.182z\"/></svg>",
  "provider-bytedance": "<svg class=\"provider-icon provider-icon-bytedance\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M19.877 1.469L24 2.532v18.942l-4.123 1.056zM6.53 10.897l4.115 1.064v8.978L6.53 22.003zM0 2.572l4.115 1.064v16.736L0 21.428zm17.455 5.62V19.3l-4.122-1.065V9.257z\"/></svg>",
  "provider-alibaba": "<svg class=\"provider-icon provider-icon-alibaba\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M3.996 4.517h5.291L8.01 6.324L4.153 7.506a1.67 1.67 0 0 0-1.165 1.601v5.786a1.67 1.67 0 0 0 1.165 1.6l3.857 1.183l1.277 1.807H3.996A3.996 3.996 0 0 1 0 15.487V8.513a3.996 3.996 0 0 1 3.996-3.996m16.008 0h-5.291l1.277 1.807l3.857 1.182c.715.227 1.17.889 1.165 1.601v5.786a1.67 1.67 0 0 1-1.165 1.6l-3.857 1.183l-1.277 1.807h5.291A3.996 3.996 0 0 0 24 15.487V8.513a3.996 3.996 0 0 0-3.996-3.996m-4.007 8.345H8.002v-1.804h7.995Z\"/></svg>",
  "provider-flux": "<svg class=\"provider-icon provider-icon-flux\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M0 20.683L12.01 2.5L24 20.683h-2.233L12.009 5.878L3.471 18.806h12.122l1.239 1.877z\"/><path fill=\"currentColor\" d=\"m8.069 16.724l2.073-3.115l2.074 3.115zm10.171 3.959l-5.668-8.707h2.177l5.686 8.707zm1.5-9.007l2.13-3.19l2.13 3.19z\"/></svg>",
  "provider-recraft": "<svg class=\"provider-icon provider-icon-recraft\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M6 20V4h7.25c3.56 0 5.75 1.82 5.75 4.78c0 2.15-1.18 3.72-3.18 4.42L19.5 20h-4.25l-3.1-6.18H9.75V20zm3.75-9.25h3.03c1.45 0 2.32-.68 2.32-1.82s-.87-1.8-2.32-1.8H9.75z\"/></svg>",
  "provider-reve": "<svg class=\"provider-icon provider-icon-reve\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M6.2 18.8V5.2h6.05c3.08 0 4.85 1.45 4.85 3.8 0 2.2-1.65 3.65-4.42 3.65H9.2\"/><path d=\"m12.4 12.65 5.25 6.15\"/></svg>",
  "provider-riverflow": "<svg class=\"provider-icon provider-icon-riverflow\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4.2 8.2c2.7-2.4 5.4-2.4 8.1 0s5.4 2.4 8.1 0\"/><path d=\"M4.2 12c2.7-2.4 5.4-2.4 8.1 0s5.4 2.4 8.1 0\"/><path d=\"M4.2 15.8c2.7-2.4 5.4-2.4 8.1 0s5.4 2.4 8.1 0\"/></svg>",
  "provider-wavespeed": "<svg class=\"provider-icon provider-icon-wavespeed\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.75\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M4.2 15.8h4.7l2-7.6 3.2 9.1 2-6.05h3.7\"/><path d=\"M5.1 8.3h4.2\"/><path d=\"M3.8 11.6h5\"/></svg>",
  "sparkles": "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\"><path d=\"M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z\"/><path d=\"M20 3v4\"/><path d=\"M22 5h-4\"/><path d=\"M4 17v2\"/><path d=\"M5 18H3\"/></svg>"
};

// Client-side fallback used when /plugin/tunes does not send an `icon` for a
// model (older backends). Titles are only used to guess the provider logo -
// never capabilities.
const PROVIDER_BY_TITLE: Array<[RegExp, string]> = [
  [/nano banana|gemini/i, "provider-google"],
  [/seedream/i, "provider-bytedance"],
  [/\bwan\b|qwen/i, "provider-alibaba"],
  [/grok/i, "provider-grok"],
  [/gpt/i, "provider-openai"],
  [/mai image/i, "provider-microsoft"],
  [/muse/i, "provider-meta"],
  [/flux|krea|kontext/i, "provider-flux"],
  [/recraft/i, "provider-recraft"],
  [/reve/i, "provider-reve"],
  [/riverflow/i, "provider-riverflow"],
  [/ideogram/i, "provider-wavespeed"],
];

export function providerIconForModel(model: { title: string; icon?: string | null }): string | null {
  if (model.icon && ICONS[model.icon]) return model.icon;
  const match = PROVIDER_BY_TITLE.find(([pattern]) => pattern.test(model.title));
  return match ? match[1] : null;
}
