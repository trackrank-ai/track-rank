ALTER TABLE invites ADD COLUMN recipient_email TEXT;
-- Legacy bearer invitations have no intended recipient. Require fresh named links.
UPDATE invites SET expires_at=0 WHERE claimed_by IS NULL AND recipient_email IS NULL;
CREATE INDEX invites_recipient ON invites(org_id,recipient_email);
