/**
 * Search BaniDB for a line — the native half of what the web app offers.
 *
 * Typing is GurbaniLipi: the field keeps raw keystrokes and renders them in the
 * GurbaniLipi font, so `mdmA` shows as ਮਦਮਅ while the query still holds the
 * ASCII BaniDB's first-letter search wants. No transliteration step, so nothing
 * can disagree about what was typed. English types roman letters. The header
 * language decides which.
 */
import { READ_ALONG_SEARCH_TYPE, useBaniDbSearch, type BaniDbHit } from '@kp/api';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useDebounceValue } from 'usehooks-ts';

import { BANIDB_BASE } from '~/lib/links';
import { cn } from '~/lib/utils';
import { useColors } from '~/lib/theme';
import { useTitleScript } from '~/lib/title-script';

export function ShabadSearch({ onSelect }: { onSelect: (shabadId: number) => void }) {
  const colors = useColors();
  const [script] = useTitleScript();
  const [term, setTerm] = useState('');
  const [debounced] = useDebounceValue(term, 300);

  const query = useBaniDbSearch(BANIDB_BASE, debounced, READ_ALONG_SEARCH_TYPE[script]);
  const hits = query.data ?? [];

  // English search is a different alphabet, so it drops the font and reads as
  // roman.
  const gurbaniLipi = script === 'pa';

  return (
    <View className="gap-3">
      <TextInput
        value={term}
        onChangeText={setTerm}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={gurbaniLipi ? 'ਪਹਿਲੇ ਅੱਖਰ ਲਿਖੋ…' : 'First letters…'}
        placeholderTextColor={colors.mutedForeground}
        className={cn(
          'rounded-lg border border-border bg-card px-4 py-3 text-foreground',
          gurbaniLipi && 'text-lg',
          // Only once there is something to render in it. React Native draws
          // the placeholder in the field's own font, and GurbaniLipi maps ASCII
          // to Gurmukhi glyphs — so an English hint came out as nonsense words.
          gurbaniLipi && term.length > 0 && 'font-gurmukhi'
        )}
      />

      {query.isLoading ? <Text className="text-sm text-muted-foreground">Searching…</Text> : null}
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
            className="rounded-lg px-2 py-2 active:bg-accent"
          >
            <Text className="text-base text-foreground">
              {hit.verse?.unicode ?? hit.verse?.gurmukhi}
            </Text>
            <Text className="text-xs text-muted-foreground">{hit.transliteration?.english}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
