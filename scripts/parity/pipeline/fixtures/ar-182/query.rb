ids = Book.where(status: "active").select(:id).arel.union(Book.where(status: "featured").select(:id).arel)
Book.where(Book.arel_table[:id].in(ids)).order(:id)
