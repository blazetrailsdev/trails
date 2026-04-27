-- Fixture for statement: ar-164
-- Query: Book.select(Arel::Nodes::Max.new([Book.arel_table[:pages]]).as("max_pages"), Arel::Nodes::Min.new([Book.arel_table[:pages]]).as("min_pages"), Book.arel_table[:author_id]).group(:author_id)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER, pages INTEGER NOT NULL DEFAULT 0);
