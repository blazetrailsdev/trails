subquery = Review.select(:book_id).where("rating > 4").arel
Book.where(Book.arel_table[:id].in(subquery))
