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
import { useRouter } from 'expo-router';
import { Heart, ListPlus, Plus, Share2, Users, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { Input } from '@kp/ui-native/input';

import { ShabadTitle } from '~/components/ShabadTitle';
import { playerActions, playerStore } from '~/lib/player';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';
import { shareRendition } from '~/lib/share';
import { useColors } from '~/lib/theme';
import { useShownTitle } from '~/lib/title-script';

export function ShabadActions({
  item,
  open,
  onClose,
}: {
  item: Playable | null;
  open: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const { favorites, userId } = useSession();
  const playlists = usePlaylists(supabase, Boolean(userId));
  const { addItem, create } = usePlaylistMutations(supabase, userId);

  if (!item) return null;
  return (
    <Sheet
      // Remounted per item, so a half-typed playlist name does not carry over.
      key={item.id}
      item={item}
      open={open}
      onClose={onClose}
      saved={favorites.has(item.id)}
      onToggleSaved={() => favorites.toggle(item.id)}
      signedIn={Boolean(userId)}
      playlists={playlists.data ?? []}
      addItem={addItem}
      create={create}
      router={router}
      colors={colors}
    />
  );
}

function Sheet({
  item,
  open,
  onClose,
  saved,
  onToggleSaved,
  signedIn,
  playlists,
  addItem,
  create,
  router,
  colors,
}: {
  item: Playable;
  open: boolean;
  onClose: () => void;
  saved: boolean;
  onToggleSaved: () => void;
  signedIn: boolean;
  playlists: { id: string; name: string }[];
  addItem: ReturnType<typeof usePlaylistMutations>['addItem'];
  create: ReturnType<typeof usePlaylistMutations>['create'];
  router: ReturnType<typeof useRouter>;
  colors: ReturnType<typeof useColors>;
}) {
  const title = useShownTitle(item);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        {/* Stops a tap inside the sheet from dismissing it. */}
        <Pressable className="rounded-t-2xl bg-popover pb-8 pt-2" onPress={() => {}}>
          <View className="flex-row items-center gap-2 px-4 pb-2">
            <ShabadTitle
              item={item}
              numberOfLines={1}
              className="flex-1 font-display-medium text-lg text-foreground"
            />
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              className="size-9 items-center justify-center"
            >
              <X size={18} color={colors.mutedForeground} />
            </Pressable>
          </View>

          {/* A row plays when you press it, so the ragi's name in that row is
              not a target — this is where it went. The same door the web's row
              menu carries, for the same reason. */}
          {item.artist ? (
            <Pressable
              onPress={() => {
                onClose();
                router.push({ pathname: '/ragi/[name]', params: { name: item.artist ?? '' } });
              }}
              className="flex-row items-center gap-3 px-4 py-3 active:bg-accent"
            >
              <Users size={18} color={colors.foreground} />
              <Text className="text-foreground">View ragi</Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={() => {
              onToggleSaved();
              onClose();
            }}
            className="flex-row items-center gap-3 px-4 py-3 active:bg-accent"
          >
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
            className="flex-row items-center gap-3 px-4 py-3 active:bg-accent"
          >
            <ListPlus size={18} color={colors.foreground} />
            <Text className="text-foreground">Add to queue</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              // From where it is now if this is the one playing, so the link
              // opens on the same line — as the web's share does.
              const s = playerStore.getState();
              const position = s.current?.id === item.id ? s.position : 0;
              onClose();
              void shareRendition(item, position, title);
            }}
            className="flex-row items-center gap-3 px-4 py-3 active:bg-accent"
          >
            <Share2 size={18} color={colors.foreground} />
            <Text className="text-foreground">Share</Text>
          </Pressable>

          <Text className="px-4 pb-1 pt-3 text-xs text-muted-foreground">Add to playlist</Text>

          {!signedIn ? (
            // Asking for a sign-in beats a list that would only fail at the
            // insert — playlists are account-only by design.
            <Pressable
              onPress={() => {
                onClose();
                // The route, not the session's `prompt()`. That flag opens the
                // web app's AuthDialog; nothing on this side renders it, so
                // this button closed the sheet and did nothing at all.
                router.push('/sign-in');
              }}
              className="px-4 py-3 active:bg-accent"
            >
              <Text className="text-primary">Sign in to use playlists</Text>
            </Pressable>
          ) : (
            <ScrollView style={{ maxHeight: 220 }}>
              {/* New and add in one step, as the web's menu does: making the
                  listener leave, create, and come back is three trips for one. */}
              {naming ? (
                <View className="gap-2 px-4 py-2">
                  <Input
                    value={name}
                    onChangeText={setName}
                    autoFocus
                    maxLength={120}
                    placeholder="Playlist name"
                    placeholderTextColor={colors.mutedForeground}
                    className="h-11"
                  />
                  <Pressable
                    disabled={!name.trim() || create.isPending}
                    onPress={() =>
                      void create
                        .mutateAsync(name)
                        .then((playlist) =>
                          addItem.mutateAsync({ playlistId: playlist.id, renditionId: item.id })
                        )
                        .then(() => {
                          onClose();
                          // After the sheet has gone: iOS drops an alert raised
                          // while a modal is still animating away.
                          setTimeout(() => Alert.alert(`Added to ${name.trim()}`), 400);
                        })
                        .catch(() => Alert.alert('Could not create that playlist'))
                    }
                    className="items-center rounded-lg bg-primary py-2.5 active:opacity-80"
                  >
                    <Text className="font-medium text-primary-foreground">Create and add</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setNaming(true)}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-accent"
                >
                  <Plus size={18} color={colors.primary} />
                  <Text className="text-primary">New playlist…</Text>
                </Pressable>
              )}
              {playlists.map((playlist) => (
                <Pressable
                  key={playlist.id}
                  onPress={() => {
                    void addItem
                      .mutateAsync({
                        playlistId: playlist.id,
                        renditionId: item.id,
                      })
                      .then((inserted) =>
                        Alert.alert(
                          inserted ? `Added to ${playlist.name}` : `Already in ${playlist.name}`
                        )
                      )
                      .catch(() => Alert.alert('Could not add to that playlist'));
                    onClose();
                  }}
                  className="flex-row items-center gap-3 px-4 py-3 active:bg-accent"
                >
                  <ListPlus size={18} color={colors.mutedForeground} />
                  <Text className="text-foreground">{playlist.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
