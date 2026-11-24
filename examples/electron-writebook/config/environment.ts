import { setLoadImporter } from "@blazetrails/ruby-compat";
import { Trails } from "@blazetrails/trailties";

import "./application.ts";

Trails.autoloaders.each((loader) => {
  loader.importer = (url) => import(url);
});
setLoadImporter((url) => import(url));

export default await Trails.initialize();
