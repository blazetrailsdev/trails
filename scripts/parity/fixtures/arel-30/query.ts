import { Table, Nodes } from "@blazetrails/arel";
const users = new Table("users");
new Nodes.BitwiseNot(users.get("bitmap")).gt(0);
