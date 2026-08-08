import { Table, Nodes, star } from "@blazetrails/arel";
const users = new Table("users");
const photos = new Table("photos");
const cte = new Table("cte_photos");
const photosQuery = photos.project(star);
export default users
  .project(star)
  .join(cte)
  .on(cte.get("user_id").eq(users.get("id")))
  .with(new Nodes.As(cte, photosQuery));
