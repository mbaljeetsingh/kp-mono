/**
 * Search BaniDB for a line — the native half of what the web app offers.
 *
 * Typing is GurbaniLipi: the field keeps raw keystrokes and renders them in the
 * GurbaniLipi font, so `mdmA` shows as ਮਦਮਅ while the query still holds the
 * ASCII BaniDB's first-letter search wants. No transliteration step, so nothing
 * can disagree about what was typed.
 */
import { SEARCH_TYPES, useBaniDbSearch, type BaniDbHit } from '@kp/api';
import { colors } from '@kp/tokens/colors';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useDebounceValue } from 'usehooks-ts';

import { BANIDB_BASE } from '~/lib/links';
import { cn } from '~/lib/utils';

export function ShabadSearch({ onSelect }: { onSelect: (shabadId: number) => void }) {
  const [lang, setLang] = useState<number>(0);
  const [term, setTerm] = useState('');
  const [debounced] = useDebounceValue(term, 300);

  const query = useBaniDbSearch(BANIDB_BASE, debounced, lang);
  const hits = query.data ?? [];

  // English search is a different alphabet, so it drops the font and reads as
  // roman.
  const gurbaniLipi = lang === 0;

  return (
    <View className="gap-3">
      <TextInput
        value={term}
        onChangeText={setTerm}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={gurbaniLipi ? 'First letters…' : 'Words in English…'}
        placeholderTextColor={colors.mutedForeground}
        className={cn(
          'rounded-lg border border-border bg-card px-4 py-3 text-foreground',
          gurbaniLipi && 'font-gurmukhi text-lg'
        )}
      />

      <View className="flex-row gap-2">
        {SEARCH_TYPES.map((type) => (
          <Pressable
            key={type.key}
            onPress={() => setLang(type.key)}
            className={cn(
              'rounded-md px-3 py-1.5',
              lang === type.key ? 'bg-primary/20' : 'bg-muted'
            )}>
            <Text
              className={cn(
                'text-xs',
                lang === type.key ? 'text-primary' : 'text-muted-foreground'
              )}>
              {type.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {query.isLoading ? (
        <Text className="text-sm text-muted-foreground">Searching…</Text>
      ) : null}
      {query.isError ? (
        <Text className="text-sm text-muted-foreground">Could not reach BaniDB.</Text>
      ) : null}
      {!query.isLoading && debounced.trim().length >= 2 && !hits.length ? (
        <Text className="text-sm text-muted-foreground">Nothing matches.</Text>
      ) : null}

      <View className="gap-1">
        {hits.map((hit: BaniDbHit) => (
          <Pressable
            key={hit.verseId}
            onPress={() => onSelect(hit.shabadId)}
            className="rounded-lg px-2 py-2 active:bg-accent">
            <Text className="text-base text-foreground">
              {hit.verse?.unicode ?? hit.verse?.gurmukhi}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {hit.transliteration?.english}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
