import { Table } from "@blazetrails/arel";
const users = new Table("users");
const bots = new Table("bots");
export default users.get("name").eq(bots.get("name"));
