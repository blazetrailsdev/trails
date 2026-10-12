// An ActiveRecord model class definition (no connection opened).
import { Base } from "@blazetrails/activerecord";
class Trail extends Base {}
console.log(`[05] ${Trail.name} ${typeof Trail.all}`);
