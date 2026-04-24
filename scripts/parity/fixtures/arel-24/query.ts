import { Table } from "@blazetrails/arel";
const users = new Table("users");
const employees = new Table("employees");
export default users.get("age").divide(3).subtract(employees.get("time_at_company"));
