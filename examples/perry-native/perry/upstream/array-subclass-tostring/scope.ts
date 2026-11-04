class ArrSub extends Array<number> {
  toString(): string { return "ARR-OVERRIDE"; }
  join(): string { return "JOIN-OVERRIDE"; }
  valueOf(): unknown { return "VALUEOF-OVERRIDE"; }
}
class MapSub extends Map<string, string> {
  toString(): string { return "MAP-OVERRIDE"; }
}
class ErrSub extends Error {
  toString(): string { return "ERR-OVERRIDE"; }
}
class Plain {
  toString(): string { return "PLAIN-OVERRIDE"; }
}

const a = new ArrSub(); a.push(1, 2);
console.log("Array  toString:", a.toString(), "| join:", a.join(), "| String():", String(a));
console.log("Map    toString:", new MapSub().toString(), "| String():", String(new MapSub()));
console.log("Error  toString:", new ErrSub().toString(), "| String():", String(new ErrSub()));
console.log("Plain  toString:", new Plain().toString(), "| String():", String(new Plain()));
console.log("Array  via lookup:", (a as { toString: () => string }).toString());
