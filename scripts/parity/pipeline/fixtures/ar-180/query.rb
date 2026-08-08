Book.select(Book.arel_table[:pages].as("p"), Book.arel_table[:author_id]).where(Book.arel_table[:pages].gt(0)).order("p DESC").limit(5)
