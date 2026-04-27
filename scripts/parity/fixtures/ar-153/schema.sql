-- Fixture for statement: ar-153
-- Query: Book.joins(Book.arel_table.join(Author.arel_table).on(Book.arel_table[:author_id].eq(Author.arel_table[:id]).and(Author.arel_table[:active].eq(1))).join_sources).select("books.*, authors.name AS author_name")

CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER REFERENCES authors(id));
