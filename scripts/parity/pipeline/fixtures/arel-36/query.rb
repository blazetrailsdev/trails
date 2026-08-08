users = Arel::Table.new(:users)
users[:created_at].extract('month')
