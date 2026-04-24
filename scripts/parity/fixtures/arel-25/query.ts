import { Table } from "@blazetrails/arel";
const users = new Table("users");
export default users.get("bitmap").bitwiseAnd(16).gt(0);
