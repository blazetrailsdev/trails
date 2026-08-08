-- Fixture for statement: ar-130
-- Query: Author.joins(:books).joins("INNER JOIN reviews ON reviews.book_id = books.id").where("reviews.rating >= 4").group("authors.id, authors.name").select("authors.id, authors.name, COUNT(DISTINCT books.id) AS book_count, AVG(reviews.rating) AS avg_rating").having("COUNT(DISTINCT books.id) >= 2").order(Arel.sql("avg_rating DESC")).limit(5)

CREATE TABLE authors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE books (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  author_id INTEGER REFERENCES authors(id)
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY,
  book_id INTEGER REFERENCES books(id),
  rating INTEGER NOT NULL
);
