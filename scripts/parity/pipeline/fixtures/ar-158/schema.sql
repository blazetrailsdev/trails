-- Fixture for statement: ar-158
-- Query: sub = Review.select(:book_id, Arel.sql("AVG(rating) AS avg_r")).group(:book_id).arel.as("sub"); Book.joins(Arel::Nodes::InnerJoin.new(sub, Arel::Nodes::On.new(sub[:book_id].eq(Book.arel_table[:id])))).select("books.*, sub.avg_r")

CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
CREATE TABLE reviews (id INTEGER PRIMARY KEY, book_id INTEGER REFERENCES books(id), rating INTEGER NOT NULL);
