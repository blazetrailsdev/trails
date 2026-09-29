import { isPresent, pluralize } from "@blazetrails/activesupport";
import { NamedBase } from "../../named-base.js";

export class ResourceRouteGenerator extends NamedBase {
  static {
    this.commands().push("addResourceRoute");
  }

  async addResourceRoute(): Promise<void> {
    if (isPresent((this.options as { actions?: string[] }).actions)) return;
    await this.route(`mapper.resources(${JSON.stringify(pluralize(this.fileName))});`, {
      namespace: this.regularClassPath(),
    });
  }
}
