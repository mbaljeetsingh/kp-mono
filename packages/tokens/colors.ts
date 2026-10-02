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
  background: '#0e1420',
  foreground: '#f4f0e6',
  card: '#161e2d',
  cardForeground: '#f4f0e6',
  popover: '#1e2838',
  popoverForeground: '#f4f0e6',
  primary: '#d1a64a',
  primaryForeground: '#0e1420',
  primarySoft: '#3a3222',
  secondary: '#243045',
  secondaryForeground: '#f4f0e6',
  muted: '#1e2838',
  mutedForeground: '#a8b0bf',
  subtleForeground: '#8e98aa',
  accent: '#2b3850',
  accentForeground: '#f4f0e6',
  highlight: '#d1a64a',
  highlightForeground: '#0e1420',
  destructive: '#ef6461',
  destructiveForeground: '#0e1420',
  live: '#ff6159',
  success: '#7cc49a',
  border: '#2d394c',
  input: '#3d4a61',
  ring: '#d1a64a',
  chart1: '#d1a64a',
  chart2: '#7f93b8',
  chart3: '#e4c98a',
  chart4: '#4e6184',
  chart5: '#8b94a6',
  sidebar: '#161e2d',
  sidebarForeground: '#f4f0e6',
  sidebarPrimary: '#d1a64a',
  sidebarPrimaryForeground: '#0e1420',
  sidebarAccent: '#2b3850',
  sidebarAccentForeground: '#f4f0e6',
  sidebarBorder: '#2d394c',
  sidebarRing: '#d1a64a',
} as const;

export type ColorToken = keyof typeof colors;
