Book.select(Book.arel_table[:id], Book.arel_table[:title]).limit(3)
