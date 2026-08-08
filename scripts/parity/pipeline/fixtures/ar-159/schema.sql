-- Fixture for statement: ar-159
-- Query: Book.select(Arel::Nodes::Multiplication.new(Book.arel_table[:pages], 2).as("double_pages"), Book.arel_table[:id]).where(Book.arel_table[:pages].gt(0)).order(:id).limit(5)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, pages INTEGER NOT NULL DEFAULT 0);
