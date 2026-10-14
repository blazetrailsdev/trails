import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Hardback extends Base {}
registerModel(Hardback);

export class BestHardback extends Hardback {}
registerModel(BestHardback);
