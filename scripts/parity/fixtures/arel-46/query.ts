import { Table } from "@blazetrails/arel";
const users = new Table("users");
export default users.group(users.get("id"), users.get("name"));
