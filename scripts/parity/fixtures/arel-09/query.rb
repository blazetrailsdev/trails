users = Arel::Table.new(:users)
users[:age].lt(10)
