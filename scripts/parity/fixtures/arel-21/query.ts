import { Table } from "@blazetrails/arel";
const users = new Table("users");
users.where(users.get("name").eq("bob").or(users.get("age").lt(25)));
