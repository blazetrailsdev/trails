-- Fixture for statement: ar-165
-- Query: Book.select(Arel::Nodes::Count.new([Book.arel_table[:author_id]], true).as("distinct_authors"))

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author_id INTEGER);
