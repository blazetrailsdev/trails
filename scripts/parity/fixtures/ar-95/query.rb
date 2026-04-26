Book.where(Book.arel_table[:pages].gteq(200).and(Book.arel_table[:pages].lteq(400)))
