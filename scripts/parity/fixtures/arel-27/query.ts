import { Table } from "@blazetrails/arel";
const users = new Table("users");
users.get("bitmap").bitwiseXor(16).gt(0);
