posts = Arel::Table.new(:posts)
posts[:answers_count] * 2
