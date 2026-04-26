Book.where(Book.arel_table[:status].not_in(["draft", "archived"]))
