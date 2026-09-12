ALTER TABLE student_accounts ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE student_password_resets (
  account_id UUID PRIMARY KEY REFERENCES student_accounts(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
