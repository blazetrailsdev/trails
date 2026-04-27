Book.select(Arel::Nodes::Multiplication.new(Book.arel_table[:pages], 2).as("double_pages"), Book.arel_table[:id]).where(Book.arel_table[:pages].gt(0)).order(:id).limit(5)
