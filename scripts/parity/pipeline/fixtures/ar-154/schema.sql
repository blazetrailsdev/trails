-- Fixture for statement: ar-154
-- Query: Book.group(Arel::Nodes::NamedFunction.new("LENGTH", [Book.arel_table[:title]])).select("LENGTH(title) AS title_length, COUNT(*) AS cnt").order("title_length")

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
