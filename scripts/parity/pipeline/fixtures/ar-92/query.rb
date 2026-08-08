Book.where(Book.arel_table[:pages].between(100..500))
