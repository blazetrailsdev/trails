import { Table, Nodes } from "@blazetrails/arel";
const users = new Table("users");
new Nodes.NamedFunction("IF", [users.get("name").eq(null), users.get("email"), users.get("name")]);
