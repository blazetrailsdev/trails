Book.where(Book.arel_table[:status].not_eq("draft"))
