-- Earned promotion, and a way to stop someone.
--
-- The ladder had the right shape but no movement: every account sat at
-- `contributor` until an admin manually intervened, which does not scale past
-- the people the admin already knows. Someone who has had twenty tags approved
-- has demonstrably earned the right to skip the review queue.

-- A way to stop abuse short of deleting the account. Ordered below
-- `contributor` so any future comparison reads naturally.
alter type trust_level add value if not exists 'blocked' before 'contributor';
