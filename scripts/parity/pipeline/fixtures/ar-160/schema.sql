-- Fixture for statement: ar-160
-- Query: Book.select(Arel::Nodes::Sum.new([Book.arel_table[:pages]]).as("total_pages"), Book.arel_table[:author_id]).group(:author_id).having(Arel::Nodes::Sum.new([Book.arel_table[:pages]]).gt(1000))

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER, pages INTEGER NOT NULL DEFAULT 0);
