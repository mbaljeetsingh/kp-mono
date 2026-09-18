/**
 * Accounts and the trust ladder.
 *
 * Gated on the *permission*, not on `trust === 'admin'`. Those are the same
 * answer today by coincidence — admin is the only rung granted `users.manage` —
 * but hardcoding the role would silently hide this page from a reviewer the
 * moment somebody granted them the permission.
 */
import { useAdminUsers, usePermissions, useSetTrust, useAuth } from '@kp/api';
import { TRUST_LADDER } from '@kp/shared/types';
import { Badge } from '@kp/ui/badge';
import { Input } from '@kp/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kp/ui/select';
import { Search } from 'lucide-react';
import { useState } from 'react';

import { supabase } from '~/lib/supabase';
import { timeAgo } from '~/lib/utils';

/** What each rung adds, mirroring role_permissions. */
const GRANTS: Record<string, string> = {
  contributor: 'propose shabads',
  trusted: '+ publish their own',
  reviewer: '+ publish, edit and delete anyone’s',
  admin: '+ manage users, request scans',
};

export function UsersRoute() {
  const { session } = useAuth(supabase);
  const { can } = usePermissions(supabase, Boolean(session));
  const query = useAdminUsers(supabase, can['users.manage']);
  const setTrust = useSetTrust(supabase);

  const [term, setTerm] = useState('');
  const [level, setLevel] = useState<string>('all');

  if (!can['users.manage']) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have permission to manage users.
      </p>
    );
  }

  // Filtered in memory: the whole contributor list is one small request and
  // already loaded, so a round trip per keystroke would buy nothing. Worth
  // revisiting past a few hundred accounts.
  const people = (query.data ?? []).filter((p) => {
    if (level !== 'all' && p.trust !== level) return false;
    const q = term.trim().toLowerCase();
    if (!q) return true;
    return (
      p.email.toLowerCase().includes(q) ||
      (p.display_name ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">
          Users <span className="text-base font-normal text-muted-foreground">
            ({people.length})
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          The ladder gates publishing, not participation.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Email or name…"
            aria-label="Filter accounts"
            className="pl-9"
          />
        </div>

        <Select value={level} onValueChange={(v) => setLevel(String(v))}>
          <SelectTrigger className="w-44" aria-label="Filter by trust level">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {TRUST_LADDER.map((rung) => (
              <SelectItem key={rung} value={rung}>
                {rung}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {setTrust.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {setTrust.error instanceof Error ? setTrust.error.message : 'Could not change trust'}
        </p>
      ) : null}

      <div className="flex flex-col gap-0.5">
        {people.map((person) => (
          <div
            key={person.id}
            className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2 hover:bg-accent/50">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{person.display_name ?? person.email}</p>
              <p className="truncate text-xs text-muted-foreground">
                {person.display_name ? `${person.email} · ` : ''}
                {/* Relative, because "3 months ago" is read at a glance where a
                    date has to be subtracted from today first — and it answers
                    the question behind every promotion. */}
                <span title={new Date(person.created_at).toLocaleString()}>
                  joined {timeAgo(person.created_at)}
                </span>
                {person.published > 0 ? ` · ${person.published} published` : ''}
              </p>
            </div>

            <Badge variant="secondary" className="shrink-0">
              {GRANTS[person.trust] ?? person.trust}
            </Badge>

            <Select
              value={person.trust}
              // set_trust refuses a self-change, so the control says so rather
              // than offering an action the server will reject.
              disabled={person.id === session?.user.id || setTrust.isPending}
              onValueChange={(v) =>
                setTrust.mutate({ target: person.id, level: String(v) })
              }>
              <SelectTrigger
                className="w-36 shrink-0"
                aria-label={`Trust level for ${person.email}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRUST_LADDER.map((rung) => (
                  <SelectItem key={rung} value={rung}>
                    {rung}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}

        {query.isLoading ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">Loading…</p>
        ) : null}
        {!query.isLoading && !people.length ? (
          <p className="px-3 py-8 text-sm text-muted-foreground">No accounts match.</p>
        ) : null}
      </div>
    </section>
  );
}
