users = Arel::Table.new(:users)
users[:age].not_eq(10)
