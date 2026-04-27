-- Fixture for statement: ar-163
-- Query: Book.select(Arel::Nodes::Count.new([Book.arel_table[:id]]).as("book_count"), Book.arel_table[:author_id]).group(:author_id).having(Arel::Nodes::Count.new([Book.arel_table[:id]]).gt(2))

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER);
