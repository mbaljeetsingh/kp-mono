/**
 * Search BaniDB for a line — the native half of what the web app offers.
 *
 * Typing goes through ShabadInput, with the Gurmukhi keys under it in Punjabi.
 */
import {
  lineDetails,
  hitSegments,
  lineTextIn,
  MIN_FIRST_LETTERS,
  useMatchingLines,
  type BaniDbHit,
} from '@kp/api';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useDebounceValue } from 'usehooks-ts';

import { MarkedLine } from '~/components/MarkedLine';
import { GurmukhiKeys, ShabadInput } from '~/components/ShabadInput';
import { BANIDB_BASE } from '~/lib/links';
import { useTitleScript } from '~/lib/title-script';

export function ShabadSearch({ onSelect }: { onSelect: (shabadId: number) => void }) {
  const [script] = useTitleScript();
  const [term, setTerm] = useState('');
  const [debounced] = useDebounceValue(term, 300);

  const query = useMatchingLines(BANIDB_BASE, debounced, script);
  const hits = query.data ?? [];

  return (
    <View className="gap-3">
      <ShabadInput
        value={term}
        onChangeText={setTerm}
        script={script}
        placeholder={script === 'pa' ? 'ਪਹਿਲੇ ਅੱਖਰ ਲਿਖੋ…' : 'First letters…'}
      />
      {script === 'pa' ? (
        <View className="rounded-lg bg-popover p-2">
          <GurmukhiKeys value={term} onChangeText={setTerm} />
        </View>
      ) : null}

      {query.isLoading ? <Text className="text-sm text-muted-foreground">Searching…</Text> : null}
      {query.isError ? (
        <Text className="text-sm text-muted-foreground">Could not reach BaniDB.</Text>
      ) : null}
      {!query.isLoading &&
      !query.isError &&
      debounced.trim().length >= MIN_FIRST_LETTERS &&
      !hits.length ? (
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
              {script === 'pa' ? (
                <MarkedLine parts={hitSegments(hit, debounced, 'pa')} />
              ) : (
                lineTextIn(hit, 'pa')
              )}
            </Text>
            <Text className="text-xs text-muted-foreground">
              {script === 'en' ? (
                <MarkedLine parts={hitSegments(hit, debounced, 'en')} />
              ) : (
                lineTextIn(hit, 'en')
              )}
            </Text>
            {lineDetails(hit) ? (
              <Text className="text-xs text-subtle-foreground">{lineDetails(hit)}</Text>
            ) : null}
          </Pressable>
        ))}
      </View>
    </View>
  );
}
