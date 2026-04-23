import { Table } from "@blazetrails/arel";
const users = new Table("users");
users.get("age").average().as("mean_age");
