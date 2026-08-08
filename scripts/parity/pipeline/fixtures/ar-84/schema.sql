-- Fixture for statement: ar-84
-- Query: Book.create_with(active: true).where(title: "Moby Dick")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  active BOOLEAN
);
