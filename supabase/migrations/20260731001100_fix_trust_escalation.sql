-- Close a privilege-escalation hole in the profiles policy.
--
-- The self-edit policy checked only WHICH ROW a user could update, never WHICH
-- COLUMNS. `trust` lives on that row, so any contributor could PATCH their own
-- profile to trust='admin' and thereby satisfy is_reviewer() — gaining publish,
-- edit and delete over every segment in the archive. Verified exploitable.
--
-- RLS cannot express "this row but not this column", so the column list is
-- enforced with a column-level GRANT, which Postgres checks independently of
-- any policy.

revoke update on profiles from authenticated;
-- A user may edit only their own presentation. `trust` is deliberately absent.
grant update (display_name, tasks) on profiles to authenticated;

-- Trust changes go through a definer function that an admin alone may call,
-- so promotion is never a plain table write.
create function set_trust(target uuid, level trust_level)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not exists (
    select 1 from profiles where id = auth.uid() and trust = 'admin'
  ) then
    raise exception 'only an admin may change trust levels';
  end if;

  -- An admin demoting themselves could leave the archive with no admin at all,
  -- and self-promotion is the escalation this migration exists to prevent.
  if target = auth.uid() then
    raise exception 'trust level cannot be changed on your own account';
  end if;

  update profiles set trust = level where id = target;
end;
$$;

grant execute on function set_trust(uuid, trust_level) to authenticated;

-- Undo the escalation performed while proving the hole was real.
update profiles set trust = 'contributor'
where id <> (select id from auth.users where email = 'admin@kirtan.com');
