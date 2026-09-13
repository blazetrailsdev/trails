import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Face } from "./face.js";
import type { Interest } from "./interest.js";
import type { MixedCaseMonkey } from "./mixed-case-monkey.js";
import { Base } from "../../base.js";

export class Human extends Base {
  declare name: string;
  declare interests: AssociationProxy<Interest>;
  declare interestsWithCallbacks: AssociationProxy<Interest>;
  declare polymorphicInterests: AssociationProxy<Interest>;
  declare polymorphicInterestsWithCallbacks: AssociationProxy<Interest>;
  declare secretInterests: AssociationProxy<Interest>;

  static _tableName = "humans";

  declare addCallbackCalled: boolean;

  static {
    this.hasOne("face", { inverseOf: "human" });
    this.hasOne("autosaveFace", { className: "Face", autosave: true, inverseOf: "autosaveHuman" });
    this.hasOne("polymorphicFace", {
      className: "Face",
      as: "polymorphicHuman",
      inverseOf: "polymorphicHuman",
    });
    this.hasOne("polymorphicFaceWithoutInverse", {
      className: "Face",
      as: "polyHumanWithoutInverse",
    });
    this.hasMany("interests", { inverseOf: "human" });
    this.hasMany("interestsWithCallbacks", {
      className: "Interest",
      beforeAdd: (owner: any, r: any) => owner.addCalled(r),
      afterAdd: (owner: any, r: any) => owner.addCalled(r),
      inverseOf: "humanWithCallbacks",
    });
    this.hasMany("polymorphicInterests", {
      className: "Interest",
      as: "polymorphicHuman",
      inverseOf: "polymorphicHuman",
    });
    this.hasMany("polymorphicInterestsWithCallbacks", {
      className: "Interest",
      as: "polymorphicHuman",
      beforeAdd: (owner: any, r: any) => owner.addCalled(r),
      afterAdd: (owner: any, r: any) => owner.addCalled(r),
      inverseOf: "polymorphicHuman",
    });
    this.hasOne("confusedFace", { className: "Face", inverseOf: "cnffusedHuman" });
    this.hasMany("secretInterests", { className: "Interest", inverseOf: "secretHuman" });
    this.hasOne("mixedCaseMonkey");

    this.attribute("addCallbackCalled", "boolean", { default: false });
  }

  addCalled(_interest: unknown) {
    this.addCallbackCalled = true;
  }
}
export interface Human {
  get face(): Face | null | Promise<Face | null>;
  set face(value: Face | null);
  get autosaveFace(): Face | null | Promise<Face | null>;
  set autosaveFace(value: Face | null);
  get polymorphicFace(): Face | null | Promise<Face | null>;
  set polymorphicFace(value: Face | null);
  get polymorphicFaceWithoutInverse(): Face | null | Promise<Face | null>;
  set polymorphicFaceWithoutInverse(value: Face | null);
  get confusedFace(): Face | null | Promise<Face | null>;
  set confusedFace(value: Face | null);
  get mixedCaseMonkey(): MixedCaseMonkey | null | Promise<MixedCaseMonkey | null>;
  set mixedCaseMonkey(value: MixedCaseMonkey | null);
}

export class SuperHuman extends Human {}
