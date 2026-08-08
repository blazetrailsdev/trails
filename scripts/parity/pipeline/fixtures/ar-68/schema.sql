-- Fixture for statement: ar-68
-- Query: Book.select(Arel.sql("id, title")).limit(5)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
