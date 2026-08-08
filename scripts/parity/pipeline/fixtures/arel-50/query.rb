users = Arel::Table.new(:users)
users.take(10).skip(5)
