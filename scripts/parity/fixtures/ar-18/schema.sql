-- Fixture for statement: ar-18
-- Query: User.where.not(id: Comment.select(:user_id).distinct)

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  body TEXT
);
