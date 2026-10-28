// #12958 verbatim. Node: base
function e() {
  class B extends Error {
    who() {
      return "base";
    }
  }
  return new B("m").who();
}
console.log(e());
