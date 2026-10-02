/**
 * Light, dark, or whatever the phone says — the phone's half of
 * packages/ui/src/lib/theme.ts, over MMKV, under the same key and values.
 *
 * The choice is handed to React Native's Appearance rather than to NativeWind
 * alone. react-native-css follows Appearance, so every class flips either way,
 * but only Appearance also moves what UIKit draws: the tab bar's blur, the
 * mini player's pill, the keyboard, alerts. Switching the classes alone left a
 * dark-blur tab bar under a parchment screen.
 */
import { palettes, type Palette } from '@kp/tokens/colors';
import { useEffect } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { useMMKVString } from 'react-native-mmkv';

import { mmkv } from './storage';

export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'kp:theme';

/** Anything unrecognised is System — also the sane reading of a future value. */
function parseThemeChoice(raw: string | undefined): ThemeChoice {
  return raw === 'light' || raw === 'dark' ? raw : 'system';
}

function apply(choice: ThemeChoice) {
  Appearance.setColorScheme(choice === 'system' ? 'unspecified' : choice);
}

// At import, synchronously, so the first frame is already in the chosen
// palette rather than the phone's and then swapped.
try {
  apply(parseThemeChoice(mmkv.getString(KEY)));
} catch {
  /* storage trouble: the phone's own setting stands */
}

export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const [raw, setRaw] = useMMKVString(KEY, mmkv);
  const choice = parseThemeChoice(raw);

  useEffect(() => apply(choice), [choice]);

  return [choice, (next) => setRaw(next)];
}

/** The palette on screen now, for the props that take a colour, not a class. */
export function useColors(): Palette {
  return palettes[useColorScheme() === 'light' ? 'light' : 'dark'];
}

/** Which palette is on screen, for the few native options that want the name. */
export function useIsDark(): boolean {
  return useColorScheme() !== 'light';
}
