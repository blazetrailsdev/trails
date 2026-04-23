import { Table, Nodes } from "@blazetrails/arel";
const users = new Table("users");
const bots = new Table("bots");
new Nodes.NamedFunction("COALESCE", [users.get("name"), bots.get("name")]);
