posts = Arel::Table.new(:posts)
posts[:id].in([2, 3, 4])
