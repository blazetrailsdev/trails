import { Table, Nodes } from "@blazetrails/arel";
const users = new Table("users");
const win = new Nodes.Window().order(users.get("name"));
users.get("id").count().over(win);
