import { Table } from "@blazetrails/arel";
const users = new Table("users");
export default users.get("bitmap").bitwiseShiftLeft(1).gt(0);
