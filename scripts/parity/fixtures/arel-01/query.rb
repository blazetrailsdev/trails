users = Arel::Table.new(:users)
users.project(Arel.star)
