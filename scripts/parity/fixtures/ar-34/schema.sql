-- Fixture for statement: ar-34
-- Query: Book.with(recent: Book.where("published_year >= ?", 2020)).from("recent AS books")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  published_year INTEGER
);
