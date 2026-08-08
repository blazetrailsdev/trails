import { Table } from "@blazetrails/arel";
const users = new Table("users");
export default users.order(users.get("id").desc());
