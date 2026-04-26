Author.joins(:books).select("authors.*, COUNT(books.id) AS books_count").group("authors.id")
