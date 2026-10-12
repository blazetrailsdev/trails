// Plain classes, getters/setters, static blocks — the shapes trails models use.
class Model {
  static registry: string[] = [];
  static {
    Model.registry.push("Model");
  }
  #name = "";
  get name(): string {
    return this.#name;
  }
  set name(v: string) {
    this.#name = v.trim();
  }
}
const m = new Model();
m.name = "  trail  ";
console.log(`[02] name=${m.name} registry=${Model.registry.join(",")}`);
