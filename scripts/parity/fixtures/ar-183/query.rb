Book.order(Arel::Nodes::Case.new(Book.arel_table[:status]).when("active").then(1).when("featured").then(2).else(3), Book.arel_table[:id]).limit(5)
