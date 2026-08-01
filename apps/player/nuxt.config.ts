import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2026-07-31',
  devtools: { enabled: true },
  // shadcn-vue components live in one place for both apps, as np-mono does —
  // `shadcn-vue add` writes to layers/ui/components/ui and neither app keeps
  // its own copy.
  extends: ['../../layers/ui'],
  css: ['~/assets/main.css'],
  modules: ['@vueuse/nuxt'],
  vite: { plugins: [tailwindcss()] },
  runtimeConfig: {
    public: {
      supabaseUrl: process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321',
      supabaseKey: process.env.SUPABASE_KEY ?? '',
      // Same-origin in dev (see routeRules), straight to banidb in production.
      banidbApiBaseUrl:
        process.env.NODE_ENV !== 'production'
          ? '/banidb-api'
          : 'https://api.banidb.com/v2',
    },
  },
  // Dev-only proxy for shabad lookups, as np-mono does. banidb reflects the
  // request Origin but sends no `Vary: Origin` with a 6-hour max-age, so the
  // browser reuses one app's cached response — allow-origin header and all —
  // for the other, and the second app's fetch fails CORS. Routing through the
  // dev server makes the browser call same-origin while Nitro fetches banidb
  // server-side, where CORS does not apply. Omitted in production, where the
  // two apps are on distinct hosts and the cache collision cannot happen.
  routeRules:
    process.env.NODE_ENV !== 'production'
      ? { '/banidb-api/**': { proxy: 'https://api.banidb.com/v2/**' } }
      : {},
  // `dark` belongs on <html>, not on a wrapper div: Reka portals every overlay
  // — dialogs, dropdown menus, their submenus — to document.body, outside any
  // app-level wrapper. With the class on a div those overlays resolved the
  // light `:root` palette from shared-theme and came up cream-on-dark.
  app: { head: { title: 'Kirtan', htmlAttrs: { class: 'dark' } } },
});
