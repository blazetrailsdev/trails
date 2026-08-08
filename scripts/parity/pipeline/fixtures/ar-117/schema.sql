-- Fixture for statement: ar-117
-- Query: Book.where(status: "draft").rewhere(status: "published")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT
);
