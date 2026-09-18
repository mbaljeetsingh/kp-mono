import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { PermissionsRoute } from '~/routes/permissions';
import { QueueRoute } from '~/routes/queue';
import { RootLayout } from '~/routes/root';
import { TagRoute } from '~/routes/tag';
import { UsersRoute } from '~/routes/users';

const rootRoute = createRootRoute({ component: RootLayout });

const queueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: QueueRoute,
});
const tagRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tag/$id',
  component: TagRoute,
});
const usersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/users',
  component: UsersRoute,
});
const permissionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/permissions',
  component: PermissionsRoute,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([queueRoute, tagRoute, usersRoute, permissionsRoute]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
