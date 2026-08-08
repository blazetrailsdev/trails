import { Developer } from "./models.js";

const RANKED_DEV_SQL =
  "(SELECT id, name, commits AS hotness FROM developers ORDER BY commits DESC) developers";

export default Developer.from(RANKED_DEV_SQL).order({ hotness: "desc" }).limit(10);
