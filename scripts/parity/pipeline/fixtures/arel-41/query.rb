posts    = Arel::Table.new(:posts)
comments = Arel::Table.new(:comments)
posts.join(comments).on(posts[:id].eq(comments[:post_id]))
