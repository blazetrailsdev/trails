-- Fixture for statement: arel-43
-- Query: replies = comments.alias; comments.join(replies).on(replies[:parent_id].eq(comments[:id]))

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
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id),
  user_id INTEGER REFERENCES users(id),
  author_id INTEGER REFERENCES users(id),
  parent_id INTEGER REFERENCES comments(id),
  active INTEGER,
  created_at DATETIME
);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
CREATE INDEX idx_comments_author_id ON comments(author_id);
CREATE INDEX idx_comments_parent_id ON comments(parent_id);
