/**
 * A square of deterministic artwork with initials on it.
 *
 * SGPC publishes bare MP3s — there is no cover art anywhere in the archive —
 * and grey placeholder squares are what makes a music app look broken. The
 * gradient comes from the name, so an artist looks the same on every screen.
 *
 * React Native has no CSS gradients, so this reads the stops rather than the
 * `linear-gradient` string the web uses. Same function, same colours.
 */
import { colors } from '@kp/tokens/colors';
import { artworkFor } from '@kp/core';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

interface Props {
  name: string;
  src?: string | null;
  size?: number;
  rounded?: number;
}

export function ArtTile({ name, src, size = 48, rounded = 8 }: Props) {
  const art = artworkFor(name);

  // Photos are seeded as paths only, so a miss is the normal state of a fresh
  // clone and the gradient has to take over silently.
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  const showPhoto = Boolean(src) && !broken;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        // The middle stop, so a flat fill still reads as the same artwork.
        backgroundColor: art.colors[1],
      }}>
      {showPhoto ? (
        <Image
          source={{ uri: src! }}
          onError={() => setBroken(true)}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
      ) : (
        <Text style={{ color: colors.foreground, fontWeight: '600', fontSize: size * 0.3 }}>
          {art.initials}
        </Text>
      )}
    </View>
  );
}
