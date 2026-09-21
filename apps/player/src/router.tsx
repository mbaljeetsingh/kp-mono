/**
 * Routes, defined in code.
 *
 * Code-based rather than file-based: the file-based router needs a codegen step
 * and a Vite plugin, and this tree is shorter than the one it would generate.
 *
 * Each route is spelled out rather than built by a helper. TanStack Router
 * derives its whole type-safe surface — every `to`, every `params` — from these
 * literals, and wrapping createRoute in a function collapses all of it to
 * `"/" | "." | ".."`.
 */
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { FavoritesRoute } from '~/routes/favorites';
import { HomeRoute } from '~/routes/index';
import { PlaylistRoute } from '~/routes/playlist';
import { PlaylistsRoute } from '~/routes/playlists';
import { RadioRoute } from '~/routes/radio';
import { RagiRoute } from '~/routes/ragi';
import { RagisRoute } from '~/routes/ragis';
import { RootLayout } from '~/routes/root';
import { SearchRoute } from '~/routes/search';
import { ShabadsRoute } from '~/routes/shabads';

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomeRoute,
});
const shabadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/shabads',
  component: ShabadsRoute,
});
const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/search',
  component: SearchRoute,
});
const ragisRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ragis',
  component: RagisRoute,
});
const ragiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ragis/$name',
  component: RagiRoute,
});
const radioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/radio',
  component: RadioRoute,
});
const favoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/favorites',
  component: FavoritesRoute,
});
const playlistsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/playlists',
  component: PlaylistsRoute,
});
const playlistRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/playlists/$id',
  component: PlaylistRoute,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  shabadsRoute,
  searchRoute,
  ragisRoute,
  ragiRoute,
  radioRoute,
  favoritesRoute,
  playlistsRoute,
  playlistRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
