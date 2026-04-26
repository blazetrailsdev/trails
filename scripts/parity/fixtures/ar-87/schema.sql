-- Fixture for statement: ar-87
-- Query: authors = Author.arel_table; books = Book.arel_table; join_node = books.join(authors).on(books[:author_id].eq(authors[:id])).join_sources; Book.joins(join_node)

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT,
  author_id INTEGER
);
