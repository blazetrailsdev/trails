CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  bio TEXT,
  created_at DATETIME NOT NULL
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  author_id INTEGER NOT NULL REFERENCES authors(id),
  title TEXT NOT NULL,
  body TEXT,
  published_at DATETIME,
  view_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_posts_published_at ON posts (published_at);
