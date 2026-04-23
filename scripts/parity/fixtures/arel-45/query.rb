users     = Arel::Table.new(:users)
employees = users.alias(:employees)
users.join(employees)
     .on(employees[:id].not_eq(users[:id]).and(employees[:name].eq(users[:name])))
