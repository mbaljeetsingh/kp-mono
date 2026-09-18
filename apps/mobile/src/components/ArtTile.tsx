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
import { useEffect, useState } from 'react';
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
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  const showPhoto = Boolean(src) && !broken;
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
          onError={() => setBroken(true)}
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
