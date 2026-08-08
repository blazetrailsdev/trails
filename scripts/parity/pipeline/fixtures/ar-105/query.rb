Book.where("EXISTS (SELECT 1 FROM reviews WHERE reviews.book_id = books.id AND reviews.rating > 3)")
