import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2026-07-31',
  devtools: { enabled: true },
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
    },
  },
  app: { head: { title: 'Kirtan Admin' } },
});
