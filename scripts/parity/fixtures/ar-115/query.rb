Author.joins(:books).group("authors.id").having("COUNT(books.id) >= 2")
