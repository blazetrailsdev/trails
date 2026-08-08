Book.where(Book.arel_table[:status].eq_any(["active", "featured"]))
