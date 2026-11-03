import { Handler } from "@blazetrails/rack";
import { Trails } from "@blazetrails/trailties";
import "../../config/environment.js";
console.log("[c] all three imports ok", typeof Handler, Trails.env);
