Book.select(Arel.sql("books.*, COUNT(reviews.id) AS review_count")).joins("LEFT JOIN reviews ON reviews.book_id = books.id").group("books.id")
