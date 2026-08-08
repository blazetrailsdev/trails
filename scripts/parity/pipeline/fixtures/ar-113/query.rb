Book.where(active: true).order(:title).unscope(:order)
