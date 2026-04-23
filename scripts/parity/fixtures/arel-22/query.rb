posts = Arel::Table.new(:posts)
(posts[:answers_count] + posts[:likes_count]).as('engagement')
