/**
 * Where a contributor stands on the trust ladder, in the sidebar.
 *
 * The promotion was always automatic (maybe_promote, at TRUSTED_AT published)
 * and always silent: contribution_stats existed and nothing called it, so a
 * contributor had "publishing comes with the trust ladder" and no idea how far
 * up it they were.
 *
 * Contributors see the climb, trusted see that they arrived. Reviewers and
 * admins see nothing — their level is granted, not counted, and a bar that is
 * full forever says nothing.
 */
import { TRUSTED_AT, useStanding } from '@kp/api';
import { Badge } from '@kp/ui/badge';
import { Card, CardContent } from '@kp/ui/card';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@kp/ui/popover';
import { Progress } from '@kp/ui/progress';
import { Separator } from '@kp/ui/separator';
import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ChevronRight } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';

export function TrustLadder() {
  const { userId, can } = useSession();
  const { data } = useStanding(supabase, userId);
  const queryClient = useQueryClient();

  /*
   * Permissions are cached for the session (staleTime: Infinity), so the
   * contributor whose twentieth draft a reviewer just published would read
   * "Trusted" here beside a tag page still offering only Save draft. When the
   * level this card has seen changes, ask again.
   */
  const trust = data?.trust;
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (trust && seen.current && seen.current !== trust) {
      void queryClient.invalidateQueries({ queryKey: ['permissions'] });
    }
    seen.current = trust;
  }, [trust, queryClient]);

  if (!data) return null;

  if (data.trust === 'trusted') {
    return (
      <Card size="sm" className="gap-2 py-3">
        <CardContent className="space-y-1.5 px-3">
          <div className="flex items-center justify-between">
            <Badge>
              <BadgeCheck data-icon="inline-start" />
              Trusted
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {data.published} published
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Your segments publish without review
            {can['scans.request'] ? ', and you can request scans.' : '.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (data.trust !== 'contributor') return null;

  const published = Math.min(data.published, TRUSTED_AT);
  const left = TRUSTED_AT - published;
  const value = (published / TRUSTED_AT) * 100;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="w-full rounded-xl text-left focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          />
        }
      >
        <Card size="sm" className="gap-2 py-3 transition-colors hover:bg-accent/40">
          <CardContent className="space-y-2 px-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">Trust ladder</span>
              <span className="flex items-center text-muted-foreground tabular-nums">
                {published}/{TRUSTED_AT}
                <ChevronRight className="size-3.5" />
              </span>
            </div>
            <Progress value={value} aria-label="Published toward trusted" />
            <p className="text-[11px] text-muted-foreground">
              {left} more published to skip review
              {data.pending ? ` · ${data.pending} in review` : ''}
            </p>
          </CardContent>
        </Card>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" sideOffset={12}>
        <PopoverHeader>
          <PopoverTitle className="font-display text-base">Trust ladder</PopoverTitle>
          <PopoverDescription>
            At {TRUSTED_AT} published segments your own work publishes without review.
          </PopoverDescription>
        </PopoverHeader>
        <Progress value={value} aria-label="Published toward trusted" />
        <dl className="grid grid-cols-3 gap-2 text-center">
          <Stat label="Published" value={published} />
          <Stat label="In review" value={data.pending} />
          <Stat label="To go" value={left} />
        </dl>
        <Separator />
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          <li>Nothing to apply for: it happens on the publish that makes {TRUSTED_AT}.</li>
          <li>Reviewing other people&rsquo;s work is granted by an admin, not earned by count.</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    // Term before value, as <dl> wants; the number reads first on screen.
    <div className="flex flex-col-reverse rounded-md bg-muted/50 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="font-display text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
