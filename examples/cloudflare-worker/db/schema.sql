CREATE TABLE IF NOT EXISTS posts (
  id bigserial PRIMARY KEY,
  title varchar,
  created_at timestamp(6) NOT NULL DEFAULT now(),
  updated_at timestamp(6) NOT NULL DEFAULT now()
);
