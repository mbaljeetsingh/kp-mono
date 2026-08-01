export default defineNuxtConfig({
  modules: ['shadcn-nuxt'],

  shadcn: {
    prefix: '',
    componentDir: 'components/ui',
  },

  // Don't auto-scan UI components — apps use explicit imports via alias
  components: {
    dirs: [],
  },
});
