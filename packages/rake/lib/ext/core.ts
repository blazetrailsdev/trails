import { puts, rbModMethodDefined, rbModName, stderr as $stderr } from "@blazetrails/ruby-compat";

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
