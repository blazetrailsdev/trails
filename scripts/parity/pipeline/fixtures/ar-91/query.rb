Book.where(Book.arel_table[:status].in(["active", "archived"]))
