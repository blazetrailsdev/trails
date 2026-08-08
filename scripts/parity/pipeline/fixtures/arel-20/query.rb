users = Arel::Table.new(:users)
users[:id].eq(2).and(users[:last_name].eq('doe').or(users[:first_name].eq('john')))
