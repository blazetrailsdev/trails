-- Fixture for statement: ar-22
-- Query: User.select("users.*, RANK() OVER (ORDER BY comments_count DESC) as rank")...

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  name TEXT
);
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  body TEXT
);
