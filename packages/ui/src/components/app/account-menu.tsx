/**
 * The signed-in account control: an avatar that opens onto who you are and the
 * way out.
 *
 * Shared, because both apps need the same two things — the address the work is
 * being attributed to, and Sign out — and the workbench had them as loose text
 * and a bare button pinned to the bottom of the sidebar, where a long queue
 * pushed them off the screen entirely.
 *
 * Whatever else belongs in the menu is the app's own business and arrives as
 * children: the player puts its library links here, the workbench has none.
 * That keeps this component clear of either app's router.
 */
import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';

import { Avatar, AvatarFallback } from '../ui/avatar';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

export function AccountMenu({
  email,
  onSignOut,
  variant = 'avatar',
  children,
}: {
  email: string;
  onSignOut: () => void;
  /**
   * `row` carries the address beside the initial, for a sidebar that has the
   * width for it: a bare circle says only that somebody is signed in, and
   * which account the work is being attributed to is exactly the thing worth
   * saying on a shared machine. `avatar` is for the phone header, where a
   * truncated address would crowd out the title.
   */
  variant?: 'avatar' | 'row';
  /** Items to sit above the separator and Sign out. */
  children?: ReactNode;
}) {
  // An address with no local part is not worth a blank circle.
  const initial = email.slice(0, 1).toUpperCase() || '?';

  return (
    <DropdownMenu>
      {/* Base UI composes through `render`, not Radix's `asChild`. */}
      <DropdownMenuTrigger
        render={
          variant === 'row' ? (
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-2 px-2 py-1.5"
              aria-label="Account"
            />
          ) : (
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account" />
          )
        }
      >
        <Avatar className="size-7 shrink-0">
          <AvatarFallback className="text-xs">{initial}</AvatarFallback>
        </Avatar>
        {variant === 'row' ? (
          <span className="min-w-0 flex-1 truncate text-left text-sm font-normal text-muted-foreground">
            {email}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        {children ? (
          <>
            <DropdownMenuSeparator />
            {children}
          </>
        ) : null}
        <DropdownMenuSeparator />
        {/* `onClick`, not Radix's `onSelect` — see the note in ThemeToggle.
            This one is why Sign out did nothing at all. */}
        <DropdownMenuItem onClick={onSignOut}>
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
