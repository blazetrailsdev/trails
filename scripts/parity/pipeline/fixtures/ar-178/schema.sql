-- Fixture for statement: ar-178
-- Query: Book.select(Book.arel_table[:id], Arel::Nodes::Extract.new(Book.arel_table[:created_at], "year").as("yr")).order(Arel::Nodes::Extract.new(Book.arel_table[:created_at], "year").desc).limit(5)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, created_at DATETIME);
