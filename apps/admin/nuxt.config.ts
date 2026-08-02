import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2026-07-31',
  devtools: { enabled: true },
  // shadcn-vue components live in one place for both apps, as np-mono does —
  // `shadcn-vue add` writes to layers/ui/components/ui and neither app keeps
  // its own copy.
  extends: ['../../layers/ui'],
  // Admin is behind auth and has no SEO surface — SPA keeps session handling
  // entirely client-side and avoids SSR cookie plumbing.
  ssr: false,
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
  // — selects, dropdown menus, dialogs — to document.body, outside any
  // app-level wrapper, where the class no longer applies and the tokens resolve
  // to the light parchment `:root` set. The status Select in the tagger came up
  // cream-on-dark that way.
  app: { head: { title: 'Kirtan Admin', htmlAttrs: { class: 'dark' } } },
});
