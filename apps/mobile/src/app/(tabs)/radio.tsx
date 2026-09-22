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
import { Pause, Play, Radio } from 'lucide-react-native';
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
      className="mx-3 mb-2 flex-row items-center gap-3 rounded-2xl bg-card px-3 py-3 active:bg-accent"
    >
      <View
        className={
          isCurrent
            ? 'size-11 items-center justify-center rounded-xl bg-primary-soft'
            : 'size-11 items-center justify-center rounded-xl bg-secondary'
        }
      >
        <Radio size={20} color={isCurrent ? colors.primary : colors.mutedForeground} />
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-base font-medium text-foreground">
          {station.name}
        </Text>
        {station.place ? (
          <Text numberOfLines={1} className="text-[13px] leading-[18px] text-muted-foreground">
            {station.place}
          </Text>
        ) : null}
      </View>
      {/* "Connecting…" is set only by an explicit attempt — inferring it from
          "selected but not playing" is equally true of a station somebody
          deliberately stopped. */}
      {starting === playable.id ? (
        <Text className="text-xs text-subtle-foreground">Connecting…</Text>
      ) : null}
      {/* The whole card is the target; this is the affordance that says the
          card plays, and the one place the station's state is drawn — a pause
          glyph while it is the one on air. */}
      <View
        className={
          isCurrent && playing
            ? 'size-10 items-center justify-center rounded-full bg-primary'
            : 'size-10 items-center justify-center rounded-full bg-secondary'
        }
      >
        {isCurrent && playing ? (
          <Pause size={18} color={colors.primaryForeground} fill={colors.primaryForeground} />
        ) : (
          <Play size={18} color={colors.foreground} fill={colors.foreground} />
        )}
      </View>
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
            <Text className="font-display text-[34px] leading-10 text-foreground">Radio</Text>
            <Text className="text-sm text-muted-foreground">
              Live darbars, and feeds this archive does not hold.
            </Text>
          </View>
        }
        renderItem={({ item: section }) => (
          <View className="pt-2">
            {section.title ? (
              <Text className="px-4 pb-2 pt-2 font-display text-[22px] leading-7 text-foreground">
                {section.title}
              </Text>
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
