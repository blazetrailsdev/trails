import { Table } from "@blazetrails/arel";
const users = new Table("users");
export default users.get("name").notInAny([["Mike"], ["Molly"]]);
