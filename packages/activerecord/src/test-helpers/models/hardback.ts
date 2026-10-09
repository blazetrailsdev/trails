import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Hardback extends Base {}
registerConstant("Hardback", Hardback);

export class BestHardback extends Hardback {}
registerConstant("BestHardback", BestHardback);
