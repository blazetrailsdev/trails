-- Fixture for statement: ar-131
-- Query: Book.with(avg_ratings: Review.select(:book_id, Arel.sql("ROUND(AVG(rating), 1) AS avg_score")).group(:book_id)).joins("INNER JOIN avg_ratings ON avg_ratings.book_id = books.id").where("avg_ratings.avg_score >= 4").select("books.id, books.title, avg_ratings.avg_score").order("avg_ratings.avg_score DESC")

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  book_id INTEGER REFERENCES books(id),
  rating INTEGER NOT NULL
);
