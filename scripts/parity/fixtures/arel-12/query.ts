import { Table } from "@blazetrails/arel";
const users = new Table("users");
export default users.get("age").gteq(10);
