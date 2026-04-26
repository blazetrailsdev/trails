authors = Author.arel_table
books   = Book.arel_table
join_node = books.join(authors).on(books[:author_id].eq(authors[:id])).join_sources
Book.joins(join_node)
