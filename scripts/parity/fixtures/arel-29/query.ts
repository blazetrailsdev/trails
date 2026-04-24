import { Table } from "@blazetrails/arel";
const users = new Table("users");
export default users.get("bitmap").bitwiseShiftRight(1).gt(0);
