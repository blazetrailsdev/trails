posts = Arel::Table.new(:posts)
posts[:id].eq(3).and(posts[:name].eq('hello'))
