/**
 * A square of deterministic artwork with initials on it.
 *
 * SGPC publishes bare MP3s — there is no cover art anywhere in the archive —
 * and grey placeholder squares are what makes a music app look broken. The
 * gradient comes from the name, so an artist looks the same on every screen and
 * the same as on the web: `artworkFor` hands both surfaces the same three sRGB
 * stops, and only the way they are painted differs.
 */
import { artworkFor } from '@kp/core';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Text, View } from 'react-native';

interface Props {
  name: string;
  src?: string | null;
  size?: number;
  rounded?: number;
}

/**
 * The CSS gradient's angle is measured clockwise from "up"; expo-linear-gradient
 * takes start and end points in a 0–1 box. This converts one to the other so the
 * tiles lean the same way on both surfaces.
 */
function endpoints(angleDeg: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  const dx = Math.cos(radians) / 2;
  const dy = Math.sin(radians) / 2;
  return {
    start: { x: 0.5 - dx, y: 0.5 - dy },
    end: { x: 0.5 + dx, y: 0.5 + dy },
  };
}

export function ArtTile({ name, src, size = 48, rounded = 8 }: Props) {
  const art = artworkFor(name);

  // Photos are seeded as paths only, so a miss is the normal state of a fresh
  // clone and the gradient has to take over silently.
  // Which src failed, rather than a boolean plus an effect to clear it: the
  // effect reset `broken` one render *after* a new src arrived, so a row
  // recycled from a broken photo to a good one showed the gradient for a
  // frame. Deriving it compares against the current src and cannot lag.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  const showPhoto = Boolean(src) && brokenSrc !== src;
  const { start, end } = endpoints(art.angle);

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        overflow: 'hidden',
      }}
    >
      {showPhoto ? (
        <Image
          source={{ uri: src! }}
          onError={() => setBrokenSrc(src ?? null)}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
        />
      ) : (
        <LinearGradient
          colors={art.colors}
          locations={[0, 0.55, 1]}
          start={start}
          end={end}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text
            style={{
              color: 'rgba(255,255,255,0.9)',
              fontWeight: '600',
              fontSize: size * 0.3,
            }}
          >
            {art.initials}
          </Text>
        </LinearGradient>
      )}
    </View>
  );
}
