<script setup lang="ts">
const model = defineModel<string>({ default: '' });
const { search } = useRagas();
const open = ref(false);

// Deliberately not derived from the linked shabad: a ragi may sing a shabad in
// a different raag from the one it is written under in SGGS, and for a kirtan
// archive the raag actually performed is the interesting one.
const matches = computed(() => (open.value ? search(model.value) : []));

function pick(name: string) {
  model.value = name;
  open.value = false;
}
</script>

<template>
  <div class="relative">
    <input
      v-model="model"
      placeholder="Raag as performed"
      class="w-full rounded-md border border-input bg-card px-3 py-1.5 text-sm outline-none focus:border-ring"
      @focus="open = true"
      @blur="setTimeout(() => (open = false), 150)"
    />
    <ul
      v-if="matches.length"
      class="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg"
    >
      <li v-for="r in matches" :key="r.id">
        <button
          class="flex w-full items-baseline justify-between gap-2 px-3 py-1.5 text-left hover:bg-accent"
          @mousedown.prevent="pick(r.name)"
        >
          <span class="text-sm">{{ r.name }}</span>
          <span class="text-[10px] text-muted-foreground">{{
            r.category
          }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
