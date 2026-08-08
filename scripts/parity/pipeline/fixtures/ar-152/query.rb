Author.joins(:published_books).where("published_books.title LIKE ?", "%Rails%").select("authors.*, COUNT(published_books.id) AS book_count").group("authors.id")
