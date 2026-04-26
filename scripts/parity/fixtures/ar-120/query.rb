Book.joins(:reviews).where(Review.arel_table[:rating].gteq(4))
