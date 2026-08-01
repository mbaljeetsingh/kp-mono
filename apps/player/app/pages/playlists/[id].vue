<script setup lang="ts">
import { ref, watch } from 'vue';
import { MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { toPlayable, usePlayer } from '~/composables/usePlayer';

const route = useRoute();
const router = useRouter();
const player = usePlayer();
const auth = useAuth();
const playlists = usePlaylists();

const id = route.params.id as string;
const name = ref('');
const items = ref<any[]>([]);
const loaded = ref(false);
/** Null until known. False for an id that isn't this account's — RLS returns no
 *  row for a stale link or someone else's playlist, and rendering that as an
 *  empty playlist would invite the listener to start adding to nothing. */
const found = ref<boolean | null>(null);

// Loaded on the client only, and re-loaded when the session settles: the server
// holds no session, so an SSR fetch would read this playlist as somebody else's
// and find nothing. `ready` is the signal that the stored session has been read.
watch(
  [auth.ready, auth.user],
  async ([isReady, user]) => {
    if (!isReady) return;
    if (!user) {
      loaded.value = true;
      return;
    }
    const [playlist, rows] = await Promise.all([
      playlists.get(id),
      playlists.items(id),
    ]);
    found.value = !!playlist;
    name.value = playlist?.name ?? '';
    items.value = rows;
    loaded.value = true;
  },
  { immediate: true }
);

function playAll(startAt = 0) {
  if (!items.value.length) return;
  player.playList(items.value.map(toPlayable), startAt);
}

function drop(renditionId: string) {
  items.value = items.value.filter((row) => row.id !== renditionId);
}

// ── rename ────────────────────────────────────────────────────────────────
const renameOpen = ref(false);
const draftName = ref('');
const renameError = ref('');

function openRename() {
  draftName.value = name.value;
  renameError.value = '';
  renameOpen.value = true;
}

async function submitRename() {
  const trimmed = draftName.value.trim();
  if (!trimmed) {
    renameError.value = 'Give the playlist a name.';
    return;
  }
  const error = await playlists.rename(id, trimmed);
  if (error) {
    renameError.value = error;
    return;
  }
  name.value = trimmed;
  renameOpen.value = false;
}

// ── delete ────────────────────────────────────────────────────────────────
const deleteOpen = ref(false);

async function confirmDelete() {
  const error = await playlists.remove(id);
  if (error) return;
  // Nothing to come back to, so replace rather than push — the browser's back
  // button should not land on a playlist that no longer exists.
  await router.replace('/playlists');
}
</script>

<template>
  <div>
    <SavedHeader />

    <template v-if="loaded && auth.user.value && found">
      <div class="mb-6 flex items-center gap-3">
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-2xl font-semibold text-foreground">
            {{ name || 'Playlist' }}
          </h1>
          <p class="text-sm text-muted-foreground">
            {{ items.length }} shabad{{ items.length === 1 ? '' : 's' }}
          </p>
        </div>

        <Button v-if="items.length" size="sm" @click="playAll(0)">
          <Play class="size-4 fill-current" /> Play
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="icon-sm" title="Playlist options">
              <MoreHorizontal class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" class="w-48">
            <DropdownMenuItem @select="openRename">
              <Pencil class="size-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              class="text-destructive"
              @select="deleteOpen = true"
            >
              <Trash2 class="size-4" /> Delete playlist
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <!-- `playlist-id` is what turns the row menu's "add to playlist" list into
           a "remove from this playlist" action while reading a playlist. -->
      <ShabadRow
        v-for="(s, i) in items"
        :key="s.id"
        :shabad="s"
        :index="i"
        :list="items"
        :playlist-id="id"
        @removed="drop(s.id)"
      />

      <EmptyState
        v-if="!items.length"
        title="This playlist is empty"
        hint="Add shabads from the ⋯ menu on any row."
      />
    </template>

    <EmptyState
      v-else-if="loaded && !auth.user.value"
      title="Sign in to open this playlist"
      hint="Playlists are private to the account that made them."
    />
    <EmptyState
      v-else-if="loaded"
      title="Playlist not found"
      hint="It may have been deleted, or it belongs to another account."
    />

    <Dialog v-model:open="renameOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename playlist</DialogTitle>
          <DialogDescription>
            Only the name changes — the shabads stay where they are.
          </DialogDescription>
        </DialogHeader>
        <form @submit.prevent="submitRename">
          <Input v-model="draftName" maxlength="120" autofocus />
          <p v-if="renameError" class="mt-2 text-xs text-amber-400">
            {{ renameError }}
          </p>
          <DialogFooter class="mt-4">
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="deleteOpen">
      <DialogContent class="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{{ name }}”?</DialogTitle>
          <DialogDescription>
            The shabads stay in the archive — only this collection goes.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter class="mt-2">
          <Button variant="ghost" @click="deleteOpen = false">Cancel</Button>
          <Button variant="destructive" @click="confirmDelete">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
