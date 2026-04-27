Book.annotate("finding active books").optimizer_hints("SeqScan(books)").where(active: true).order(:id)
