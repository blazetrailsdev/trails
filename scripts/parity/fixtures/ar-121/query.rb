Book.select(Book.arel_table[:id], Book.arel_table[:title], Book.arel_table[:status]).where(active: true)
