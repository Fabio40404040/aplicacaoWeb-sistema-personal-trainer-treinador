CREATE TABLE student_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(140) NOT NULL,
  email VARCHAR(180) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX student_accounts_email_idx ON student_accounts (lower(email));
-- Separate login identities. Never associate existing private student records
-- merely by matching an unverified email address.
