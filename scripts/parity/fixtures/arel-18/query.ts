import { Table } from "@blazetrails/arel";
const users = new Table("users");
const bots = new Table("bots");
users.get("name").eq(bots.get("name"));
