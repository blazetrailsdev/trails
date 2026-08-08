comments = Arel::Table.new(:comments)
replies  = comments.alias(:replies)
comments.join(replies).on(replies[:parent_id].eq(comments[:id]))
