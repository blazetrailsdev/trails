-- Fixture for statement: ar-118
-- Query: Book.where(status: ["active", "featured", "new"])

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  status TEXT
);
