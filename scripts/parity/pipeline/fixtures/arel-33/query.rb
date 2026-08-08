users = Arel::Table.new(:users)
users[:age].average.as('mean_age')
