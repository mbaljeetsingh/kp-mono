/**
 * Live broadcasts.
 *
 * Every mount except Harimandir Sahib is relayed by SikhNet, on SikhNet's
 * bandwidth — the archive hotlinks sgpc.net, which is the organisation that
 * recorded it, and this is a different arrangement that should be visible.
 */
import { colors } from '@kp/tokens/colors';
import {
  CHANNELS,
  DEFAULT_STATION,
  OTHER_GURDWARAS,
  stationPlayable,
  type Station,
} from '@kp/core';
import { Radio } from 'lucide-react-native';
import { FlatList, Pressable, Text, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { playerActions, usePlayer } from '~/lib/player';

function StationCard({ station }: { station: Station }) {
  const playable = stationPlayable(station);
  const currentId = usePlayer((s) => s.current?.id);
  const playing = usePlayer((s) => s.playing);
  const starting = usePlayer((s) => s.starting);

  const isCurrent = currentId === playable.id;

  return (
    <Pressable
      onPress={() => (isCurrent ? playerActions.toggle() : playerActions.play(playable))}
      className="mx-2 mb-2 flex-row items-center gap-3 rounded-xl border border-border px-3 py-3 active:bg-card"
    >
      <Radio size={16} color={isCurrent ? colors.primary : colors.mutedForeground} />
      <View className="min-w-0 flex-1">
        <Text numberOfLines={1} className="text-foreground">
          {station.name}
        </Text>
        {station.place ? (
          <Text numberOfLines={1} className="text-xs text-muted-foreground">
            {station.place}
          </Text>
        ) : null}
      </View>
      {/* "Connecting…" is set only by an explicit attempt — inferring it from
          "selected but not playing" is equally true of a station somebody
          deliberately stopped. */}
      {starting === playable.id ? (
        <Text className="text-xs text-muted-foreground">Connecting…</Text>
      ) : isCurrent && playing ? (
        <Text className="text-xs font-medium text-primary">LIVE</Text>
      ) : null}
    </Pressable>
  );
}

export default function RadioScreen() {
  const sections: { title: string; data: Station[] }[] = [
    { title: '', data: [DEFAULT_STATION] },
    { title: 'Gurdwaras', data: OTHER_GURDWARAS },
    { title: 'Channels', data: CHANNELS },
  ];

  return (
    <Screen edges={['top']} className="flex-1 bg-background">
      <FlatList
        data={sections}
        keyExtractor={(s) => s.title || 'featured'}
        contentContainerClassName="pb-4"
        ListHeaderComponent={
          <View className="px-4 pb-2 pt-3">
            <Text className="text-2xl font-semibold text-foreground">Radio</Text>
            <Text className="text-sm text-muted-foreground">
              Live darbars, and feeds this archive does not hold.
            </Text>
          </View>
        }
        renderItem={({ item: section }) => (
          <View className="pt-2">
            {section.title ? (
              <Text className="px-4 pb-2 text-sm font-medium text-foreground">{section.title}</Text>
            ) : null}
            {section.data.map((station) => (
              <StationCard key={station.id} station={station} />
            ))}
          </View>
        )}
        ListFooterComponent={
          <Text className="px-4 pt-4 text-xs text-muted-foreground">
            Sri Harimandir Sahib is served by SGPC. Every other mount is relayed by SikhNet, on
            SikhNet's bandwidth.
          </Text>
        }
      />
    </Screen>
  );
}
