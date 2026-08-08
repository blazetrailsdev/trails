Book.joins(:author).group("authors.name").select("authors.name, COUNT(*) AS c")
