Book.where(active: true).merge(Book.order(:title))
