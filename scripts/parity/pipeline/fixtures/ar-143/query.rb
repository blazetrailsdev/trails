Author.left_outer_joins(books: :reviews).select("authors.id, authors.name, COUNT(reviews.id) AS review_count").group("authors.id, authors.name")
