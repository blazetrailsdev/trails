import { Base } from "@blazetrails/activejob";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";

export class ApplicationJob extends Base {}
constSet(TopLevel, "ApplicationJob", ApplicationJob);
