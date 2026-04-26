Book.where(active: true).select("COUNT(*) AS total")
