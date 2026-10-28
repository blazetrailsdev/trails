// #12957 verbatim. Node: child:base
function p6() {
  class B {
    who() {
      return "base";
    }
  }
  class C extends B {
    who() {
      return "child:" + super.who();
    }
  }
  return { C };
}
console.log(new (p6().C)().who());
