-- Fixture for statement: ar-155
-- Query: Book.select(Arel::Nodes::Case.new(Book.arel_table[:status]).when("active").then("yes").when("draft").then("maybe").else("no").as("is_visible"), Book.arel_table[:id]).order(:id).limit(5)

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL, status TEXT NOT NULL);
