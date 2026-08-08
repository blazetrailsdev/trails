users = Arel::Table.new(:users)
users.group(users[:id], users[:name])
