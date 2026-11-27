import { puts } from "@blazetrails/ruby-compat/io";
import { rbModMethodDefined, rbModName } from "@blazetrails/ruby-compat/object";
import { stderr as $stderr } from "@blazetrails/ruby-compat/process-adapter";

export function rakeExtension(
  this: { prototype: object },
  method: string,
  block: () => unknown,
): void {
  if (rbModMethodDefined(this, method)) {
    puts.call(
      $stderr,
      "WARNING: Possible conflict with Rake extension: " +
        `${rbModName(this)}#${method} already exists`,
    );
  } else {
    block();
  }
}
