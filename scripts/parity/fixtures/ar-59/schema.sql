-- Fixture for statement: ar-59
-- Query: Book.order(Arel.sql("RANDOM()"))  # trails: Book.order("RANDOM()")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT
);
