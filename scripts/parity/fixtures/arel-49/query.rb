users = Arel::Table.new(:users)
users.project(Arel.star).order(
  users[:age],
  Arel.sql('ARRAY_AGG(DISTINCT users.name)')
)
