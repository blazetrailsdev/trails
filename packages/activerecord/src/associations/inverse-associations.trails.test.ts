/**
 * trails-specific automatic-inverse invariants with no counterpart in Rails'
 * inverse_associations_test.rb. These exercise the same automatic-inverse
 * machinery (through, polymorphic belongs_to, `inverseOf: false`, scope +
 * automatic scope inversing, scoped belongs_to side) but have no verbatim Rails
 * analog, so they live in the `.trails.test.ts` sibling rather than inflating
 * the convention file's `extra` count. Their inline models use bespoke names
 * (registered under unique keys) so they never clobber canonical models.
 */
import { describe, it, expect } from "vitest";
import { Base, reflectOnAssociation, registerModel } from "../index.js";
import type { AssociationProxy } from "./collection-proxy.js";
import { fixtures } from "../test-helpers/fixtures.js";

fixtures({});

describe("AutomaticInverseFindingTests", () => {
  it("through association should not find inverse automatically", () => {
    class Doctor extends Base {
      declare appointments: AssociationProxy<Appointment>;
      declare patients: AssociationProxy<Base>;

      static {
        this.attribute("id", "integer");
        this.hasMany("appointments", {});
        this.hasMany("patients", { through: "appointments" });
      }
    }
    class Appointment extends Base {
      declare doctor_id: number | null;
      declare patient_id: number | null;
      declare doctor: Doctor | null;
      declare patient: Patient | null;
      declare loadBelongsTo: ((name: "doctor") => Promise<Doctor | null>) &
        ((name: "patient") => Promise<Patient | null>);

      static {
        this.attribute("id", "integer");
        this.attribute("doctor_id", "integer");
        this.attribute("patient_id", "integer");
        this.belongsTo("doctor", {});
        this.belongsTo("patient", {});
      }
    }
    class Patient extends Base {
      static {
        this.attribute("id", "integer");
      }
    }
    registerModel(Doctor);
    registerModel(Appointment);
    registerModel(Patient);

    const patientsRef = reflectOnAssociation(Doctor, "patients")!;
    expect(patientsRef.hasInverse()).toBe(false);
  });

  it("polymorphic belongs to should not find inverse automatically", () => {
    class Tag extends Base {
      declare taggable_id: number | null;
      declare taggable_type: string | null;

      static {
        this.attribute("id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.belongsTo("taggable", { polymorphic: true });
      }
    }
    class PolyPost extends Base {
      static {
        this.attribute("id", "integer");
        this.hasMany("tags", { as: "taggable" });
      }
    }
    registerModel(Tag);
    registerModel(PolyPost);

    const taggableRef = reflectOnAssociation(Tag, "taggable")!;
    expect(taggableRef.hasInverse()).toBe(false);
  });

  it("explicit inverse of false disables automatic detection", () => {
    class Parent extends Base {
      static {
        this.attribute("id", "integer");
        this.hasMany("children", { className: "Child", inverseOf: false });
      }
    }
    class Child extends Base {
      declare parent_id: number | null;

      static {
        this.attribute("id", "integer");
        this.attribute("parent_id", "integer");
        this.belongsTo("parent", {});
      }
    }
    registerModel(Parent);
    registerModel(Child);

    const childrenRef = reflectOnAssociation(Parent, "children")!;
    expect(childrenRef.hasInverse()).toBe(false);
  });

  it("has many with scope should not find inverse automatically unless automatic scope inversing", () => {
    // Without automatic_scope_inversing, scoped associations should not find inverse
    {
      class ScopeCompany extends Base {
        static {
          this.attribute("id", "integer");
          this.hasMany("scopeContracts", {
            scope: (rel: unknown) => rel,
            className: "ScopeContract",
          });
        }
      }
      class ScopeContract extends Base {
        declare scopeCompany_id: number | null;
        declare scopeCompany: ScopeCompany | null;
        declare loadBelongsTo: (name: "scopeCompany") => Promise<ScopeCompany | null>;

        static {
          this.attribute("id", "integer");
          this.attribute("scopeCompany_id", "integer");
          this.belongsTo("scopeCompany", { className: "ScopeCompany" });
        }
      }
      registerModel(ScopeCompany);
      registerModel(ScopeContract);

      const contractsRef = reflectOnAssociation(ScopeCompany, "scopeContracts")!;
      expect(contractsRef.hasInverse()).toBe(false);
    }

    // With automatic_scope_inversing enabled, scoped associations should find inverse
    {
      class Company2 extends Base {
        static {
          this.attribute("id", "integer");
          this.hasMany("contract2s", {
            scope: (rel: unknown) => rel,
            className: "Contract2",
          });
        }
      }
      class Contract2 extends Base {
        declare company2_id: number | null;
        declare company2: Company2 | null;
        declare loadBelongsTo: (name: "company2") => Promise<Company2 | null>;

        static automaticScopeInversing = true;
        static {
          this.attribute("id", "integer");
          this.attribute("company2_id", "integer");
          this.belongsTo("company2", { className: "Company2" });
        }
      }
      registerModel("Company2", Company2);
      registerModel("Contract2", Contract2);

      const contractsRef = reflectOnAssociation(Company2, "contract2s")!;
      expect(contractsRef.hasInverse()).toBe(true);
      expect(contractsRef.inverseOf()!.name).toBe("company2");
    }
  });

  it("scoped belongs to on inverse side blocks automatic inverse", () => {
    // Scopes on the inverse (belongs_to) side always block automatic detection,
    // even when automatic_scope_inversing is enabled
    class Publisher extends Base {
      declare magazines: AssociationProxy<Magazine>;

      static automaticScopeInversing = true;
      static {
        this.attribute("id", "integer");
        this.hasMany("magazines", {});
      }
    }
    class Magazine extends Base {
      declare publisher_id: number | null;

      static automaticScopeInversing = true;
      static {
        this.attribute("id", "integer");
        this.attribute("publisher_id", "integer");
        this.belongsTo("publisher", { scope: (rel: unknown) => rel });
      }
    }
    registerModel(Publisher);
    registerModel(Magazine);

    const magazinesRef = reflectOnAssociation(Publisher, "magazines")!;
    expect(magazinesRef.hasInverse()).toBe(false);
  });
});
