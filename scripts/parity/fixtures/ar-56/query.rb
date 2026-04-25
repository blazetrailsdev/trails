Book.where(id: 1).where(title: "Rails").unscope(where: :id)
