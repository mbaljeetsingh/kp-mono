/**
 * Routes, defined in code.
 *
 * Code-based rather than file-based: the file-based router needs a codegen
 * step and a Vite plugin, and this app has six routes. The tree is easier to
 * read than the generated one it would replace.
 */
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { HomeRoute } from '~/routes/index';
import { RadioRoute } from '~/routes/radio';
import { RagiRoute } from '~/routes/ragi';
import { RagisRoute } from '~/routes/ragis';
import { RootLayout } from '~/routes/root';
import { SearchRoute } from '~/routes/search';

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: HomeRoute });
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

const routeTree = rootRoute.addChildren([
  indexRoute,
  searchRoute,
  ragisRoute,
  ragiRoute,
  radioRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
