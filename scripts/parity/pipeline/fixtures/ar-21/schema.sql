-- Fixture for statement: ar-21
-- Query: User.where(Post.where(posts[:user_id].eq(User.arel_table[:id])).arel.exists.not)

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT
);
