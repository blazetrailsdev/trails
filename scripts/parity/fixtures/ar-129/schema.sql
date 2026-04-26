-- Fixture for statement: ar-129
-- Query: Book.select(Arel::Nodes::NamedFunction.new("COALESCE", [Book.arel_table[:subtitle], Book.arel_table[:title]]).as("display_title"), Book.arel_table[:id]).order(:id).limit(5)

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT
);
