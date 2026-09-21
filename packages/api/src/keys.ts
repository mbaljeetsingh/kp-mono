/**
 * Query keys in one place.
 *
 * Two apps and a background refetch share this cache; keys invented at the
 * call site drift, and a mismatched key is a stale list nobody can explain.
 */
export const keys = {
  shabads: {
    all: ['shabads'] as const,
    list: (filters: Record<string, unknown> = {}) => ['shabads', 'list', filters] as const,
    search: (term: string) => ['shabads', 'search', term] as const,
    byArtist: (artist: string) => ['shabads', 'artist', artist] as const,
    random: (seed: number) => ['shabads', 'random', seed] as const,
  },
  artists: {
    all: ['artists'] as const,
    directory: () => ['artists', 'directory'] as const,
    one: (name: string) => ['artists', name] as const,
  },
  favorites: {
    all: ['favorites'] as const,
  },
  playlists: {
    all: ['playlists'] as const,
    one: (id: string) => ['playlists', id] as const,
  },
  shabadText: (shabadId: number) => ['shabad-text', shabadId] as const,
} as const;
