-- Fixture for statement: ar-81
-- Query: Book.where(active: true).annotate("find active books")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  active BOOLEAN
);
