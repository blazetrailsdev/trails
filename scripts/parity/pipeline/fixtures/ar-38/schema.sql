-- Fixture for statement: ar-38
-- Query: User.where(id: Comment.select(:user_id).where(approved: true))

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  approved BOOLEAN
);
