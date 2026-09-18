/**
 * Save it, queue it, file it.
 *
 * A sheet rather than a menu: a phone has no hover and no right-click, and a
 * long-press onto a list of targets is the gesture every music app already
 * taught people. It reads the already-loaded playlists rather than fetching —
 * one request per visible row is what a naive version costs.
 */
import { usePlaylistMutations, usePlaylists } from '@kp/api';
import type { Playable } from '@kp/core';
import { colors } from '@kp/tokens/colors';
import { Heart, ListPlus, Plus, X } from 'lucide-react-native';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { playerActions } from '~/lib/player';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

export function ShabadActions({
  item,
  open,
  onClose,
}: {
  item: Playable | null;
  open: boolean;
  onClose: () => void;
}) {
  const { favorites, userId, prompt } = useSession();
  const playlists = usePlaylists(supabase, Boolean(userId));
  const { addItem } = usePlaylistMutations(supabase, userId);

  if (!item) return null;

  const saved = favorites.has(item.id);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        {/* Stops a tap inside the sheet from dismissing it. */}
        <Pressable className="rounded-t-2xl bg-card pb-8 pt-2" onPress={() => {}}>
          <View className="flex-row items-center gap-2 px-4 pb-2">
            <Text numberOfLines={1} className="flex-1 font-medium text-foreground">
              {item.title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              className="size-9 items-center justify-center">
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          <Pressable
            onPress={() => {
              favorites.toggle(item.id);
              onClose();
            }}
            className="flex-row items-center gap-3 px-4 py-3 active:bg-accent">
            <Heart
              size={18}
              color={saved ? colors.primary : colors.foreground}
              fill={saved ? colors.primary : 'transparent'}
            />
            <Text className="text-foreground">{saved ? 'Remove from saved' : 'Save'}</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              playerActions.addToQueue(item);
              onClose();
            }}
            className="flex-row items-center gap-3 px-4 py-3 active:bg-accent">
            <ListPlus size={18} color={colors.foreground} />
            <Text className="text-foreground">Add to queue</Text>
          </Pressable>

          <Text className="px-4 pb-1 pt-3 text-xs text-muted-foreground">Add to playlist</Text>

          {!userId ? (
            // Asking for a sign-in beats a list that would only fail at the
            // insert — playlists are account-only by design.
            <Pressable
              onPress={() => {
                onClose();
                prompt();
              }}
              className="px-4 py-3 active:bg-accent">
              <Text className="text-primary">Sign in to use playlists</Text>
            </Pressable>
          ) : (
            <ScrollView style={{ maxHeight: 220 }}>
              {(playlists.data ?? []).map((playlist) => (
                <Pressable
                  key={playlist.id}
                  onPress={() => {
                    void addItem
                      .mutateAsync({ playlistId: playlist.id, renditionId: item.id })
                      .then((inserted) =>
                        Alert.alert(
                          inserted ? `Added to ${playlist.name}` : `Already in ${playlist.name}`
                        )
                      )
                      .catch(() => Alert.alert('Could not add to that playlist'));
                    onClose();
                  }}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-accent">
                  <Plus size={18} color={colors.mutedForeground} />
                  <Text className="text-foreground">{playlist.name}</Text>
                </Pressable>
              ))}
              {!(playlists.data ?? []).length ? (
                <Text className="px-4 py-3 text-sm text-muted-foreground">
                  No playlists yet — make one on the Lists tab.
                </Text>
              ) : null}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
