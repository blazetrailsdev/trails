Employee.with_recursive(hierarchy: [Employee.where(manager_id: nil), Employee.joins("INNER JOIN hierarchy ON employees.manager_id = hierarchy.id")]).from("hierarchy")
