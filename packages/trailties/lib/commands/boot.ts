import "../constants.boot.generated.js";
import { isPresent } from "@blazetrails/activesupport";
import { include, type Included } from "@blazetrails/ruby-compat/include";
import type { ThorClass } from "@blazetrails/thor";
import type { ThorOptions } from "@blazetrails/thor/core-ext/hash-with-indifferent-access";
import { environment } from "../command.js";
import { Base } from "../command/base.js";
import { EnvironmentArgument } from "../command/environment-argument.js";

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export interface BootCommand extends Included<typeof EnvironmentArgument> {
  /** @internal */
  _environment?: string;
  /** @internal */
  _environmentSpecified?: boolean;
  /** @internal */
  _availableEnvironments?: string[];
}

/* eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging */
export class BootCommand extends Base {
  declare options: ThorOptions<Record<string, unknown> & { environment?: string }>;

  static {
    const klass = this as unknown as ThorClass;
    include(this, EnvironmentArgument);
    klass.desc("boot", "Boot the application and exit");
    klass.methodAdded("perform");
  }

  /** @inlinedFrom Rails::Command::EnvironmentArgument#initialize rails/v8.0.5.2/railties/lib/rails/command/environment_argument.rb:16-26 */
  constructor(...args: ConstructorParameters<typeof Base>) {
    super(...args);

    this._environmentSpecified = isPresent(this.options.environment);

    if (!this._environmentSpecified) {
      this.options = this.options.merge({ environment: environment() });
    } else if (!this.availableEnvironments().includes(this.options.environment!)) {
      this.options = this.options.merge({
        environment: this.expandEnvironmentName(this.options.environment!),
      });
    }
  }

  async perform(..._args: unknown[]): Promise<void> {
    await this.bootApplicationBang();
  }
}
