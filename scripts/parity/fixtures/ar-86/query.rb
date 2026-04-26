Book.where(Book.arel_table[:rating].lt(5))
