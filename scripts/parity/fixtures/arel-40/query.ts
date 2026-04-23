import { Table, Nodes } from "@blazetrails/arel";
const posts = new Table("posts");
new Nodes.NamedFunction("DATE_FORMAT", [posts.get("created_at"), new Nodes.Quoted("%Y%m")]);
