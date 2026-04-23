import { Table } from "@blazetrails/arel";
const users = new Table("users");
users
  .get("id")
  .eq(2)
  .and(users.get("last_name").eq("doe").or(users.get("first_name").eq("john")));
