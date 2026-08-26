<script setup lang="ts">
/**
 * Create a playlist — and, when it was opened from a row menu, drop that shabad
 * into it. That pairing is the point: "add to playlist" with no playlists yet
 * should not be a dead end that makes you go and build one first.
 *
 * Mounted once in app.vue, opened through `usePlaylists().promptNew()`.
 */
import { ref, watch } from 'vue';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const playlists = usePlaylists();

const name = ref('');
const message = ref('');
const busy = ref(false);

watch(playlists.newOpen, (open) => {
  if (open) {
    name.value = '';
    message.value = '';
    return;
  }
  // Closing without creating drops the held shabad. Leaving it set would mean
  // the next sign-in reopens this dialog over a pick the listener abandoned.
  playlists.pendingPick.value = null;
});

async function submit() {
  if (busy.value) return;
  const trimmed = name.value.trim();
  if (!trimmed) {
    message.value = 'Give the playlist a name.';
    return;
  }

  busy.value = true;
  try {
    const created = await playlists.create(trimmed);
    if (!created) {
      message.value = 'Could not create that playlist.';
      return;
    }
    const pick = playlists.pendingPick.value;
    if (pick) await playlists.addItem(created.id, pick.id);
    playlists.pendingPick.value = null;
    playlists.newOpen.value = false;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Dialog v-model:open="playlists.newOpen.value">
    <DialogContent class="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>New playlist</DialogTitle>
        <!-- Always rendered, both branches: a DialogContent without a
             description has nothing for aria-describedby to point at. -->
        <DialogDescription>
          <!-- Named, not just "the shabad you picked": after a sign-in detour
               the listener is several steps from the row they tapped. -->
          {{
            playlists.pendingPick.value
              ? `“${playlists.pendingPick.value.name}” goes in as its first track.`
              : 'Add shabads to it from the ⋯ menu on any row.'
          }}
        </DialogDescription>
      </DialogHeader>

      <form @submit.prevent="submit">
        <Input
          v-model="name"
          placeholder="Morning kirtan"
          maxlength="120"
          autofocus
        />
        <p
          v-if="message"
          class="mt-2 text-xs text-amber-600 dark:text-amber-400"
        >
          {{ message }}
        </p>
        <DialogFooter class="mt-4">
          <Button type="submit" :disabled="busy">
            {{ busy ? 'Creating…' : 'Create playlist' }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
