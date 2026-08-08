Book.where(Book.arel_table[:title].does_not_match("%draft%"))
