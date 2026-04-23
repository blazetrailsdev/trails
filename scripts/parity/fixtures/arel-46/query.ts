import { Table } from "@blazetrails/arel";
const users = new Table("users");
users.group(users.get("id"), users.get("name"));
