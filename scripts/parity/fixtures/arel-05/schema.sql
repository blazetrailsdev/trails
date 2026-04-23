-- Fixture for statement: arel-05
-- Query: posts[:title].as('name')

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT, first_name TEXT, last_name TEXT, email TEXT,
  age INTEGER, karma INTEGER, bitmap INTEGER, comments_count INTEGER,
  tall INTEGER, active INTEGER, locked INTEGER, orders_count INTEGER,
  created_at DATETIME
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT, name TEXT,
  answers_count INTEGER, likes_count INTEGER, view_count INTEGER,
  rating REAL, col_a INTEGER, col_b INTEGER, col_c INTEGER,
  created_at DATETIME, published_at DATETIME
);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_published_at ON posts(published_at);
