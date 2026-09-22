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
  background: '#0f0d0b',
  foreground: '#f4efe3',
  card: '#1a1612',
  cardForeground: '#f4efe3',
  popover: '#241f1a',
  popoverForeground: '#f4efe3',
  primary: '#e8a33d',
  primaryForeground: '#1a1206',
  primarySoft: '#2f2513',
  secondary: '#2c261f',
  secondaryForeground: '#f4efe3',
  muted: '#2c261f',
  mutedForeground: '#a99d89',
  subtleForeground: '#8a7f70',
  accent: '#372f27',
  accentForeground: '#f4efe3',
  destructive: '#d2554b',
  destructiveForeground: '#f4efe3',
  live: '#e5484d',
  success: '#7dab86',
  border: '#2a241e',
  input: '#3a322a',
  ring: '#e8a33d',
  chart1: '#e8a33d',
  chart2: '#b8ad96',
  chart3: '#8a806f',
  chart4: '#c98a2e',
  chart5: '#6a6054',
  sidebar: '#1a1612',
  sidebarForeground: '#f4efe3',
  sidebarPrimary: '#e8a33d',
  sidebarPrimaryForeground: '#1a1206',
  sidebarAccent: '#372f27',
  sidebarAccentForeground: '#f4efe3',
  sidebarBorder: '#2a241e',
  sidebarRing: '#e8a33d',
} as const;

export type ColorToken = keyof typeof colors;
