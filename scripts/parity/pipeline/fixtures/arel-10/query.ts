import { Table } from "@blazetrails/arel";
const users = new Table("users");
export default users.get("age").gt(10);
