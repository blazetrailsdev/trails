-- Fixture for statement: ar-137
-- Query: Employee.with_recursive(hierarchy: [Employee.where(manager_id: nil), Employee.joins("INNER JOIN hierarchy ON employees.manager_id = hierarchy.id")]).from("hierarchy")

CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  manager_id INTEGER REFERENCES employees(id)
);
