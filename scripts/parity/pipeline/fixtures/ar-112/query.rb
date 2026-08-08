Book.where(Book.arel_table[:title].matches_any(["%rails%", "%ruby%"]))
