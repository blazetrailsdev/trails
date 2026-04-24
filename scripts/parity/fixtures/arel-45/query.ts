import { Table } from "@blazetrails/arel";
const users = new Table("users");
const employees = users.alias("employees");
export default users.join(employees).on(
  employees
    .get("id")
    .notEq(users.get("id"))
    .and(employees.get("name").eq(users.get("name"))),
);
