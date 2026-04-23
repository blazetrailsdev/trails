users     = Arel::Table.new(:users)
employees = Arel::Table.new(:employees)
users[:age] / 3 - employees[:time_at_company]
