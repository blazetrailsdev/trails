-- Fixture for statement: ar-172
-- Query: Book.order(Arel::Nodes::NamedFunction.new("LENGTH", [Book.arel_table[:title]]).desc).limit(5)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
