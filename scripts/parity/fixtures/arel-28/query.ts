import { Table } from "@blazetrails/arel";
const users = new Table("users");
users.get("bitmap").bitwiseShiftLeft(1).gt(0);
