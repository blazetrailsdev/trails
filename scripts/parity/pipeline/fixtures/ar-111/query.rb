Book.select(:author_id).distinct.order(author_id: :asc)
