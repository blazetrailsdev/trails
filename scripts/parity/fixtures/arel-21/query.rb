users = Arel::Table.new(:users)
users.where(users[:name].eq('bob').or(users[:age].lt(25)))
