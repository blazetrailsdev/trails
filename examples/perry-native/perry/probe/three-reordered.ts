import { Trails } from "@blazetrails/trailties";
import "../../config/environment.js";
import { Handler } from "@blazetrails/rack";
console.log("[d] env before rack ok", typeof Handler, Trails.env);
