import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';

import { PendingRoute } from '~/routes/pending';
import { PermissionsRoute } from '~/routes/permissions';
import { QueueRoute } from '~/routes/queue';
import { RootLayout } from '~/routes/root';
import { TagRoute } from '~/routes/tag';
import { UsersRoute } from '~/routes/users';

const rootRoute = createRootRoute({ component: RootLayout });

/**
 * Which shelf, sort, tree and search the tagger is working through.
 *
 * Shared by the queue and the tag page so the selection rides along: tagging is
 * a loop — open a recording, mark it, come back — and coming back is the Back
 * button. Held in component state it dies on every route change and lands
 * everybody on the default shelf.
 *
 * Every field is optional; the queue supplies the default shelf.
 */
const SHELVES = ['todo', 'queued', 'started', 'done', 'all'] as const;

/**
 * Explicitly optional keys. Without the `?` the validated type has every key
 * required-but-undefined, and then `<Link to="/" search={{}}>` is a type error
 * and a `(prev) => prev` reducer does not match either.
 */
export interface QueueSearch {
  shelf?: (typeof SHELVES)[number];
  sort?: string;
  tree?: string;
  q?: string;
}

function queueSearch(search: Record<string, unknown>): QueueSearch {
  const out: QueueSearch = {};
  if (SHELVES.includes(search.shelf as never)) {
    out.shelf = search.shelf as (typeof SHELVES)[number];
  }
  if (typeof search.sort === 'string') out.sort = search.sort;
  if (typeof search.tree === 'string') out.tree = search.tree;
  if (typeof search.q === 'string') out.q = search.q;
  return out;
}

const queueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: QueueRoute,
  /**
   * The shelf lives in the URL so Back restores it. Tagging is a loop — open a
   * recording, mark it, come back — and component state dies on every route
   * change, landing everybody on the default shelf.
   */
  validateSearch: queueSearch,
});
const tagRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/tag/$id',
  component: TagRoute,
  // The same shape as the queue's, so the shelf a tagger was working through
  // rides along and the Back link returns them to it rather than to the default.
  validateSearch: queueSearch,
});
const pendingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/pending',
  component: PendingRoute,
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
  routeTree: rootRoute.addChildren([queueRoute, tagRoute, pendingRoute, usersRoute, permissionsRoute]),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
