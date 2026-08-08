import { Table } from "@blazetrails/arel";
const users = new Table("users");
export default users.take(10).skip(5);
