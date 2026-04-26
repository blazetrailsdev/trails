Book.where(Book.arel_table[:title].does_not_match_any(["%draft%", "%archived%"]))
