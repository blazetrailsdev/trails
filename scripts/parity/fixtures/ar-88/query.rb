Book.select(Book.arel_table[:title].as("book_title"), Book.arel_table[:id])
