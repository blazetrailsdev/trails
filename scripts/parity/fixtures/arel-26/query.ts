import { Table } from "@blazetrails/arel";
const users = new Table("users");
export default users.get("bitmap").bitwiseOr(16).gt(0);
