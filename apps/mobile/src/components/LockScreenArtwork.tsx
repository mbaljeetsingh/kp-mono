/**
 * The lock screen's artwork: the shabad's own tile, as a picture.
 *
 * The lock screen and Control Center take an image URL and nothing else, and a
 * shabad's tile is not an image — it is a gradient and two letters, drawn live
 * (ArtTile). Before this the lock screen showed the ragi's photo instead, a
 * different picture from the one on every row and in the player.
 *
 * So the tile is drawn once more as an SVG, off screen, turned into a PNG and
 * kept in the cache directory, and the lock screen is pointed at the file. A
 * file rather than a data: URL because Android reads the artwork as a
 * java.net.URL, which has no data: scheme. Each tile is drawn once per seed,
 * initials and face; after that the file is found again by name.
 */
import { artworkFor, playableTile } from '@kp/core';
import { useRef } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, Text } from 'react-native-svg';

import { endpoints } from '~/components/ArtTile';
import { rememberTile, tileArtworkUrl, tileFile, tileKey } from '~/lib/lock-screen-art';
import { playerActions, usePlayer } from '~/lib/player';
import { useTitleScript } from '~/lib/title-script';

/** Points; the PNG comes out at the screen's scale, so ~900px on a phone. */
const SIZE = 300;

/** Mounted once, at the root: draws the current shabad's tile when it has none yet. */
export function LockScreenArtwork() {
  const current = usePlayer((s) => s.current);
  const [script] = useTitleScript();
  const svg = useRef<Svg>(null);

  if (!current) return null;
  const tile = playableTile(current, script);
  if (tileArtworkUrl(tile)) return null;

  const key = tileKey(tile);
  const art = artworkFor(tile.seed);
  const { start, end } = endpoints(art.angle);

  function capture() {
    svg.current?.toDataURL((base64) => {
      try {
        const file = tileFile(key);
        file.write(base64, { encoding: 'base64' });
        rememberTile(key, file.uri);
        // The item loaded before its tile existed; tell the lock screen again.
        playerActions.retitle();
      } catch {
        // No artwork is the same lock screen as before; nothing to recover.
      }
    });
  }

  return (
    // Off screen rather than hidden: a view that is not drawn has nothing to
    // capture.
    <View pointerEvents="none" style={{ position: 'absolute', left: -SIZE * 4, top: 0 }}>
      <Svg ref={svg} key={key} width={SIZE} height={SIZE} onLayout={capture}>
        <Defs>
          <LinearGradient id="tile" x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
            <Stop offset={0} stopColor={art.colors[0]} />
            <Stop offset={0.55} stopColor={art.colors[1]} />
            <Stop offset={1} stopColor={art.colors[2]} />
          </LinearGradient>
        </Defs>
        <Rect width={SIZE} height={SIZE} fill="url(#tile)" />
        <Text
          x={SIZE / 2}
          y={SIZE / 2}
          textAnchor="middle"
          alignmentBaseline="central"
          fill="rgba(255,255,255,0.9)"
          fontSize={SIZE * 0.3}
          // As ArtTile: the Gurbani face has one weight, registered on its own.
          fontFamily={tile.gurmukhi ? 'NotoSerifGurmukhi-Regular' : undefined}
          fontWeight={tile.gurmukhi ? undefined : '600'}
        >
          {tile.initials}
        </Text>
      </Svg>
    </View>
  );
}
