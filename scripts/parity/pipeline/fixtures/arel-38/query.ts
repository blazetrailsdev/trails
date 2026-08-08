import { Table, Nodes } from "@blazetrails/arel";
const users = new Table("users");
export default new Nodes.NamedFunction("CAST", [users.get("age").as("float")]);
