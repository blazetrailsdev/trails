users = Arel::Table.new(:users)
users.order(users[:id].desc)
