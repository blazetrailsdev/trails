import { Trails } from "@blazetrails/trailties";
import { File } from "@blazetrails/ruby-compat";

export default {
  test: { service: "Disk", root: File.join(Trails.root()!, "tmp/storage") },
  local: { service: "Disk", root: File.join(Trails.root()!, "storage") },
};
