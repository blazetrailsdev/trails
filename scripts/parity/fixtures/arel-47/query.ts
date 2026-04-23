import { Table } from "@blazetrails/arel";
const photos = new Table("photos");
photos.group(photos.get("user_id")).having(photos.get("id").count().gt(5));
