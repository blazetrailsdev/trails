import { Employee } from "./models.js";

export default Employee.all()
  .withRecursive({
    hierarchy: [
      Employee.where({ manager_id: null }),
      Employee.joins("INNER JOIN hierarchy ON employees.manager_id = hierarchy.id"),
    ],
  })
  .from("hierarchy");
