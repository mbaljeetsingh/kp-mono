import tailwindcss from '@tailwindcss/vite';

// A Netlify build must never fall through to the local defaults below. Either
// naming satisfies this and both are checked: SUPABASE_URL/SUPABASE_KEY are
// read below and baked in as the build-time defaults, while
// NUXT_PUBLIC_SUPABASE_URL/_KEY are applied by Nitro over runtimeConfig.public
// per request — verified against the built function, whose served HTML carries
// the runtime values and none of the baked ones (this holds for admin too: its
// `ssr: false` still ships a catch-all server function that renders the shell).
// What must not happen is neither being set: the build then goes green with
// `127.0.0.1:54521` and an empty key as the effective config, and every
// visitor's browser quietly queries its own localhost.
const supabaseUrlSet =
  process.env.SUPABASE_URL || process.env.NUXT_PUBLIC_SUPABASE_URL;
const supabaseKeySet =
  process.env.SUPABASE_KEY || process.env.NUXT_PUBLIC_SUPABASE_KEY;
if (process.env.NETLIFY && (!supabaseUrlSet || !supabaseKeySet)) {
  throw new Error(
    'Supabase env vars missing on the Netlify site: set either SUPABASE_URL + SUPABASE_KEY or NUXT_PUBLIC_SUPABASE_URL + NUXT_PUBLIC_SUPABASE_KEY. Refusing to build with the local defaults.'
  );
}

export default defineNuxtConfig({
  compatibilityDate: '2026-07-31',
  devtools: { enabled: true },
  // shadcn-vue components live in one place for both apps, as np-mono does —
  // `shadcn-vue add` writes to layers/ui/components/ui and neither app keeps
  // its own copy.
  extends: ['../../layers/ui'],
  // `app/components/ui` is a symlink into that layer, and every shadcn
  // component is imported explicitly through the `@/components/ui/*` alias —
  // none is auto-imported. Scanning it anyway registers both
  // `ui/button/index.ts` and `ui/button/Button.vue` as `UiButton`, and Nuxt
  // warns once per component: ~50 warnings that scroll the dev server's URL
  // out of the terminal. The layer already sets `dirs: []` for this reason,
  // but the symlink lives inside the app's own components dir, so the app has
  // to exclude it too.
  components: [{ path: '~/components', ignore: ['**/ui/**'] }],
  css: ['~/assets/main.css'],
  modules: ['@vueuse/nuxt'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54521',
      supabaseKey: process.env.SUPABASE_KEY ?? '',
      // Always same-origin, in production as well as dev — see routeRules.
      // Overridable at runtime with NUXT_PUBLIC_BANIDB_API_BASE_URL.
      banidbApiBaseUrl: '/banidb-api',
    },
  },
  // Shabad lookups go through this app's own origin, never to banidb from the
  // browser. banidb reflects the request Origin but sends no `Vary: Origin`
  // with a 6-hour max-age, so one cached response — allow-origin header and
  // all — gets reused for whichever of the two apps asks second, and that
  // app's fetch fails CORS.
  //
  // This used to be dev-only, on the reasoning that production puts the apps
  // on distinct hosts so the collision could not happen. That was wrong, and
  // it broke production: the HTTP cache is keyed by URL and partitioned by
  // registrable domain, and player.<domain> and admin.<domain> share one.
  // Observed in production: the player's fetch was refused with an
  // allow-origin naming the admin's host, because a shared parent domain puts
  // both subdomains in one cache partition.
  //
  // Proxying makes the browser call this origin while Nitro fetches banidb
  // server-side, where CORS does not apply — and it gives each app its own
  // cache key, so neither can serve the other a stale header.
  routeRules: {
    '/banidb-api/**': { proxy: 'https://api.banidb.com/v2/**' },
  },
  // No `dark` class here any more: the theme is a listener's choice now, so it
  // is written to <html> by the pre-paint script in app.vue and thereafter by
  // useTheme. It stays on <html> rather than a wrapper div for the original
  // reason — Reka portals every overlay (dialogs, dropdown menus, their
  // submenus) to document.body, outside any app-level wrapper, where the class
  // no longer applies and the tokens resolve to the other palette. Declaring
  // it here as well would put unhead in charge of the same attribute and the
  // two would fight over it on hydration.
  app: { head: { title: 'Kirtan Player' } },
});
