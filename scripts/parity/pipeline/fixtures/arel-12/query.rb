users = Arel::Table.new(:users)
users[:age].gteq(10)
