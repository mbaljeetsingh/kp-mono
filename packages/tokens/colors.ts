/**
 * The palette as TypeScript. GENERATED — edit tokens.css instead.
 *
 * React Native style props take colours as values, not class names, so an icon
 * tint or a native option cannot read a CSS variable.
 *
 * Class names remain the way to style anything that takes one. This is only for
 * the props that cannot.
 */
export const colors = {
  background: '#1a1612',
  foreground: '#ede8d6',
  card: '#221e18',
  cardForeground: '#ede8d6',
  popover: '#2a251e',
  popoverForeground: '#ede8d6',
  primary: '#e2764a',
  primaryForeground: '#1a1612',
  secondary: '#2e2720',
  secondaryForeground: '#ede8d6',
  muted: '#2e2720',
  mutedForeground: '#c4b89b',
  accent: '#3a322a',
  accentForeground: '#ede8d6',
  destructive: '#c94a4a',
  destructiveForeground: '#ede8d6',
  border: '#494033',
  input: '#4f4435',
  ring: '#e2764a',
  chart1: '#e2764a',
  chart2: '#b8ad96',
  chart3: '#8a806f',
  chart4: '#c96442',
  chart5: '#6a6054',
  sidebar: '#221e18',
  sidebarForeground: '#ede8d6',
  sidebarPrimary: '#e2764a',
  sidebarPrimaryForeground: '#1a1612',
  sidebarAccent: '#3a322a',
  sidebarAccentForeground: '#ede8d6',
  sidebarBorder: '#453c30',
  sidebarRing: '#e2764a',
} as const;

export type ColorToken = keyof typeof colors;
