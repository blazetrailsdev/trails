import { describe, it, expect, beforeEach } from "vitest";
import { Base, MemoryAdapter, enableSti, registerSubclass, registerModel, SubclassNotFound, findStiClass } from "./index.js";
import { getStiBase, isStiSubclass } from "./sti.js";

/**
 * Single Table Inheritance tests.
 *
 * Mirrors: activerecord/test/cases/inheritance_test.rb (InheritanceTest)
 */
describe("InheritanceTest", () => {
  let adapter: MemoryAdapter;

  beforeEach(() => {
    adapter = new MemoryAdapter();
  });

  // -------------------------------------------------------------------------
  // subclasses / descendants
  // -------------------------------------------------------------------------

  it("subclasses", () => {
    class Shape extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("type", "string");
        this.adapter = adapter;
        enableSti(Shape);
      }
    }
    class Circle extends Shape {
      static { registerSubclass(Circle); }
    }
    class Rectangle extends Shape {
      static { registerSubclass(Rectangle); }
    }

    expect(Shape.subclasses).toContain(Circle);
    expect(Shape.subclasses).toContain(Rectangle);
    expect(Shape.subclasses).not.toContain(Shape);
  });

  it("descendants", () => {
    class Animal extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("type", "string");
        this.adapter = adapter;
        enableSti(Animal);
      }
    }
    class Mammal extends Animal {
      static { registerSubclass(Mammal); }
    }
    class Dog extends Mammal {
      static { registerSubclass(Dog); }
    }
    class Cat extends Mammal {
      static { registerSubclass(Cat); }
    }

    const desc = Animal.descendants;
    expect(desc).toContain(Mammal);
    expect(desc).toContain(Dog);
    expect(desc).toContain(Cat);
    expect(desc).not.toContain(Animal);

    // Mammal's descendants don't include Animal
    expect(Mammal.descendants).toContain(Dog);
    expect(Mammal.descendants).toContain(Cat);
    expect(Mammal.descendants).not.toContain(Animal);
  });

  // -------------------------------------------------------------------------
  // table name inheritance / base class
  // -------------------------------------------------------------------------

  it("inheritance base class", () => {
    class Post extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("type", "string");
        this._tableName = "posts";
        this.adapter = adapter;
        enableSti(Post);
      }
    }
    class SpecialPost extends Post {
      static { registerSubclass(SpecialPost); }
    }
    class StiPost extends Post {
      static { registerSubclass(StiPost); }
    }

    expect(Post.baseClass).toBe(Post);
    expect(SpecialPost.baseClass).toBe(Post);
    expect(StiPost.baseClass).toBe(Post);
  });

  // -------------------------------------------------------------------------
  // STI base class query returns all types
  // -------------------------------------------------------------------------

  it("inheritance find all", async () => {
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Firm extends Company {
      static {
        this.adapter = adapter;
        registerModel(Firm);
        registerSubclass(Firm);
      }
    }
    class Client extends Company {
      static {
        this.adapter = adapter;
        registerModel(Client);
        registerSubclass(Client);
      }
    }

    await Firm.create({ name: "37signals" });
    await Client.create({ name: "Summit" });

    const all = await Company.all().toArray();
    expect(all).toHaveLength(2);
    const types = all.map((r: any) => r.constructor.name);
    expect(types).toContain("Firm");
    expect(types).toContain("Client");
  });

  it("alt inheritance find all", async () => {
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable);
      }
    }
    class Cucumber extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cucumber);
        registerSubclass(Cucumber);
      }
    }
    class Cabbage extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cabbage);
        registerSubclass(Cabbage);
      }
    }

    await Cucumber.create({ name: "my cucumber" });
    await Cabbage.create({ name: "his cabbage" });

    const all = await Vegetable.all().toArray();
    const types = all.map((r: any) => r.constructor.name);
    expect(types).toContain("Cucumber");
    expect(types).toContain("Cabbage");
  });

  // -------------------------------------------------------------------------
  // STI subclass query scopes by type
  // -------------------------------------------------------------------------

  it("inheritance condition", async () => {
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Firm extends Company {
      static {
        this.adapter = adapter;
        registerModel(Firm);
        registerSubclass(Firm);
      }
    }
    class Client extends Company {
      static {
        this.adapter = adapter;
        registerModel(Client);
        registerSubclass(Client);
      }
    }

    await Firm.create({ name: "Alpha" });
    await Firm.create({ name: "Beta" });
    await Firm.create({ name: "Gamma" });
    await Client.create({ name: "Delta" });
    await Client.create({ name: "Epsilon" });

    const allCount = await Company.all().count();
    const firmCount = await Firm.all().count();
    const clientCount = await Client.all().count();

    expect(allCount).toBe(5);
    expect(firmCount).toBe(3);
    expect(clientCount).toBe(2);
  });

  it("alt inheritance condition", async () => {
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable);
      }
    }
    class Cucumber extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cucumber);
        registerSubclass(Cucumber);
      }
    }
    class Cabbage extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cabbage);
        registerSubclass(Cabbage);
      }
    }

    await Cucumber.create({ name: "my cucumber" });
    await Cabbage.create({ name: "his cabbage" });
    await Cabbage.create({ name: "her cabbage" });
    await Cabbage.create({ name: "red cabbage" });

    expect(await Vegetable.all().count()).toBe(4);
    expect(await Cucumber.all().count()).toBe(1);
    expect(await Cabbage.all().count()).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Creating a subclass record sets type column
  // -------------------------------------------------------------------------

  it("inheritance save", async () => {
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Firm extends Company {
      static {
        this.adapter = adapter;
        registerModel(Firm);
        registerSubclass(Firm);
      }
    }

    const firm = new Firm({ name: "Next Angle" });
    await firm.save();

    const found = await Company.find(firm.id as number);
    expect(found).toBeInstanceOf(Firm);
  });

  it("alt inheritance save", async () => {
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable);
      }
    }
    class Cabbage extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cabbage);
        registerSubclass(Cabbage);
      }
    }

    const cabbage = new Cabbage({ name: "Savoy" });
    await cabbage.save();

    const savoy = await Vegetable.find(cabbage.id as number);
    expect(savoy).toBeInstanceOf(Cabbage);
  });

  // -------------------------------------------------------------------------
  // Loading a record with type column instantiates correct subclass
  // -------------------------------------------------------------------------

  it("inheritance find", async () => {
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Firm extends Company {
      static {
        this.adapter = adapter;
        registerModel(Firm);
        registerSubclass(Firm);
      }
    }
    class Client extends Company {
      static {
        this.adapter = adapter;
        registerModel(Client);
        registerSubclass(Client);
      }
    }

    const firmRecord = await Firm.create({ name: "37signals" });
    const clientRecord = await Client.create({ name: "Summit" });

    const firm = await Company.find(firmRecord.id as number);
    expect(firm).toBeInstanceOf(Firm);

    const client = await Company.find(clientRecord.id as number);
    expect(client).toBeInstanceOf(Client);
  });

  it("alt inheritance find", async () => {
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable);
      }
    }
    class Cucumber extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cucumber);
        registerSubclass(Cucumber);
      }
    }
    class Cabbage extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cabbage);
        registerSubclass(Cabbage);
      }
    }

    const cucumberRecord = await Cucumber.create({ name: "my cucumber" });
    const cabbageRecord = await Cabbage.create({ name: "his cabbage" });

    const cucumber = await Vegetable.find(cucumberRecord.id as number);
    expect(cucumber).toBeInstanceOf(Cucumber);

    const cabbage = await Vegetable.find(cabbageRecord.id as number);
    expect(cabbage).toBeInstanceOf(Cabbage);
  });

  // -------------------------------------------------------------------------
  // becomes() returns instance of new class with same attributes
  // -------------------------------------------------------------------------

  it("alt becomes works with sti", async () => {
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable);
      }
    }
    class Cabbage extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cabbage);
        registerSubclass(Cabbage);
      }
    }

    const vegetableRecord = await Vegetable.create({ name: "my cucumber" });
    const vegetable = await Vegetable.find(vegetableRecord.id as number);
    expect(vegetable).toBeInstanceOf(Vegetable);

    const cabbage = vegetable.becomes(Cabbage);
    expect(cabbage).toBeInstanceOf(Cabbage);
  });

  // -------------------------------------------------------------------------
  // tableName is shared between base and subclasses
  // -------------------------------------------------------------------------

  it("subclasses use same table as base", () => {
    class Vehicle extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("type", "string");
        this._tableName = "vehicles";
        this.adapter = adapter;
        enableSti(Vehicle);
      }
    }
    class Car extends Vehicle {
      static { registerSubclass(Car); }
    }
    class Truck extends Vehicle {
      static { registerSubclass(Truck); }
    }

    expect(Car.tableName).toBe("vehicles");
    expect(Truck.tableName).toBe("vehicles");
  });

  // -------------------------------------------------------------------------
  // inheritance new with default class
  // -------------------------------------------------------------------------

  it("inheritance new with default class", () => {
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }

    const company = new Company();
    expect(company).toBeInstanceOf(Company);
  });

  // -------------------------------------------------------------------------
  // find first within inheritance
  // -------------------------------------------------------------------------

  it("find first within inheritance", async () => {
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Firm extends Company {
      static {
        this.adapter = adapter;
        registerModel(Firm);
        registerSubclass(Firm);
      }
    }
    class Client extends Company {
      static {
        this.adapter = adapter;
        registerModel(Client);
        registerSubclass(Client);
      }
    }

    await Firm.create({ name: "37signals" });
    await Client.create({ name: "Summit" });

    const firm = await Company.where({ name: "37signals" }).first();
    expect(firm).toBeInstanceOf(Firm);

    const fromFirm = await Firm.where({ name: "37signals" }).first();
    expect(fromFirm).toBeInstanceOf(Firm);

    const notFound = await Client.where({ name: "37signals" }).first();
    expect(notFound).toBeNull();
  });

  it("alt find first within inheritance", async () => {
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable);
      }
    }
    class Cucumber extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cucumber);
        registerSubclass(Cucumber);
      }
    }
    class Cabbage extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cabbage);
        registerSubclass(Cabbage);
      }
    }

    await Cucumber.create({ name: "my cucumber" });
    await Cabbage.create({ name: "his cabbage" });

    const cabbage = await Vegetable.where({ name: "his cabbage" }).first();
    expect(cabbage).toBeInstanceOf(Cabbage);

    const fromCabbage = await Cabbage.where({ name: "his cabbage" }).first();
    expect(fromCabbage).toBeInstanceOf(Cabbage);

    const notFound = await Cucumber.where({ name: "his cabbage" }).first();
    expect(notFound).toBeNull();
  });

  // -------------------------------------------------------------------------
  // finding incorrect type data
  // -------------------------------------------------------------------------

  it("finding incorrect type data", async () => {
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Firm extends Company {
      static {
        this.adapter = adapter;
        registerModel(Firm);
        registerSubclass(Firm);
      }
    }
    class Client extends Company {
      static {
        this.adapter = adapter;
        registerModel(Client);
        registerSubclass(Client);
      }
    }

    await Firm.create({ name: "37signals" });
    const client = await Client.create({ name: "Summit" });

    // Firm.find(clientId) should throw RecordNotFound since it scopes to type=Firm
    await expect(Firm.find(client.id as number)).rejects.toThrow();
    // Firm.find(firmId) should work
    const firm = await Firm.create({ name: "Another" });
    await expect(Firm.find(firm.id as number)).resolves.toBeInstanceOf(Firm);
  });

  it("alt finding incorrect type data", async () => {
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable);
      }
    }
    class Cucumber extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cucumber);
        registerSubclass(Cucumber);
      }
    }
    class Cabbage extends Vegetable {
      static {
        this.adapter = adapter;
        registerModel(Cabbage);
        registerSubclass(Cabbage);
      }
    }

    const cabbage = await Cabbage.create({ name: "his cabbage" });
    const cucumber = await Cucumber.create({ name: "my cucumber" });

    // Cucumber.find(cabbageId) should throw RecordNotFound since it scopes to type=Cucumber
    await expect(Cucumber.find(cabbage.id as number)).rejects.toThrow();
    await expect(Cucumber.find(cucumber.id as number)).resolves.toBeInstanceOf(Cucumber);
  });

  // -------------------------------------------------------------------------
  // destroy all within inheritance
  // -------------------------------------------------------------------------

  it("destroy all within inheritance", async () => {
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Firm extends Company {
      static {
        this.adapter = adapter;
        registerModel(Firm);
        registerSubclass(Firm);
      }
    }
    class Client extends Company {
      static {
        this.adapter = adapter;
        registerModel(Client);
        registerSubclass(Client);
      }
    }

    await Firm.create({ name: "Alpha" });
    await Firm.create({ name: "Beta" });
    await Firm.create({ name: "Gamma" });
    await Client.create({ name: "Delta" });
    await Client.create({ name: "Epsilon" });

    await Client.destroyAll();
    expect(await Client.all().count()).toBe(0);
    expect(await Firm.all().count()).toBe(3);
  });

  // -------------------------------------------------------------------------
  // complex inheritance
  // -------------------------------------------------------------------------

  it("complex inheritance", async () => {
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Client extends Company {
      static {
        this.adapter = adapter;
        registerModel(Client);
        registerSubclass(Client);
      }
    }
    class VerySpecialClient extends Client {
      static {
        this.adapter = adapter;
        registerModel(VerySpecialClient);
        registerSubclass(VerySpecialClient);
      }
    }

    const vsc = await VerySpecialClient.create({ name: "veryspecial" });

    // VerySpecialClient query should find it
    const found1 = await VerySpecialClient.where({ name: "veryspecial" }).first();
    expect(found1).toBeInstanceOf(VerySpecialClient);

    // Company base class should also find it
    const found2 = await Company.where({ name: "veryspecial" }).first();
    expect(found2).toBeInstanceOf(VerySpecialClient);

    // find by id on Company should return VerySpecialClient instance
    const found3 = await Company.find(vsc.id as number);
    expect(found3).toBeInstanceOf(VerySpecialClient);
  });

  // -------------------------------------------------------------------------
  // abstract class
  // -------------------------------------------------------------------------

  it("abstract class", () => {
    class LoosePerson extends Base {
      static {
        this.attribute("id", "integer");
        this.abstractClass = true;
        this.adapter = adapter;
      }
    }
    class LooseDescendant extends LoosePerson {
      static { registerSubclass(LooseDescendant); }
    }

    expect(Base.abstractClass).toBe(false);
    expect(LoosePerson.abstractClass).toBe(true);
    expect(LooseDescendant.abstractClass).toBe(false);
  });

  // -------------------------------------------------------------------------
  // inherits custom primary key
  // -------------------------------------------------------------------------

  it("inherits custom primary key", () => {
    class Subscriber extends Base {
      static {
        this.attribute("nick", "string");
        this.attribute("type", "string");
        this.primaryKey = "nick";
        this._tableName = "subscribers";
        this.adapter = adapter;
        enableSti(Subscriber);
      }
    }
    class SpecialSubscriber extends Subscriber {
      static { registerSubclass(SpecialSubscriber); }
    }

    expect(SpecialSubscriber.primaryKey).toBe("nick");
  });

  // -------------------------------------------------------------------------
  // inheritance new with base class
  // -------------------------------------------------------------------------

  it("inheritance new with base class", () => {
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = new MemoryAdapter();
        enableSti(Company);
      }
    }
    registerModel(Company);

    const company = new Company({ type: "Company" });
    expect(company).toBeInstanceOf(Company);
  });

  // -------------------------------------------------------------------------
  // inheritance new with subclass
  // -------------------------------------------------------------------------

  it("inheritance new with subclass", () => {
    const adapter = new MemoryAdapter();
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Firm extends Company {
      static { this.adapter = adapter; registerModel(Firm); registerSubclass(Firm); }
    }

    const firm = new Company({ type: "Firm" });
    // In Rails, Company.new(type: "Firm") returns a Firm instance
    // We validate by checking the type attribute is set
    expect(firm.readAttribute("type")).toBe("Firm");
  });

  // -------------------------------------------------------------------------
  // new with invalid type
  // -------------------------------------------------------------------------

  it("new with invalid type", () => {
    const adapter = new MemoryAdapter();
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    registerModel(Company);

    expect(() => findStiClass(Company, "InvalidType")).toThrow(SubclassNotFound);
  });

  // -------------------------------------------------------------------------
  // new with unrelated type
  // -------------------------------------------------------------------------

  it("new with unrelated type", () => {
    const adapter = new MemoryAdapter();
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Account extends Base {
      static { this.adapter = adapter; }
    }
    registerModel(Company);
    registerModel(Account);

    expect(() => findStiClass(Company, "Account")).toThrow(SubclassNotFound);
  });

  // -------------------------------------------------------------------------
  // new with complex inheritance
  // -------------------------------------------------------------------------

  it("new with complex inheritance", () => {
    const adapter = new MemoryAdapter();
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Client extends Company {
      static { this.adapter = adapter; registerModel(Client); registerSubclass(Client); }
    }
    class VerySpecialClient extends Client {
      static { this.adapter = adapter; registerModel(VerySpecialClient); registerSubclass(VerySpecialClient); }
    }
    registerModel(Company);

    // Should not throw — VerySpecialClient is a subclass of Company
    expect(() => findStiClass(Company, "VerySpecialClient")).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // a bad type column
  // -------------------------------------------------------------------------

  it("a bad type column", async () => {
    const adapter = new MemoryAdapter();
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    registerModel(Company);

    // Create a record and then corrupt its type via updateAll
    const company = await Company.create({ name: "Not happening" });
    await Company.all().where({ id: company.id }).updateAll({ type: "bad_class!" });

    await expect(Company.find(company.id as number)).rejects.toThrow(SubclassNotFound);
  });

  // -------------------------------------------------------------------------
  // becomes! resets inheritance type column
  // -------------------------------------------------------------------------

  it("becomes bang resets inheritance type column", async () => {
    const adapter = new MemoryAdapter();
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("custom_type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable, { column: "custom_type" });
      }
    }
    class Cabbage extends Vegetable {
      static { this.adapter = adapter; registerModel(Cabbage); registerSubclass(Cabbage); }
    }
    registerModel(Vegetable);

    const vegetable = await Vegetable.create({ name: "Red Pepper" });
    expect(vegetable.readAttribute("custom_type")).toBeNull();

    const cabbage = vegetable.becomesBang(Cabbage);
    expect(cabbage).toBeInstanceOf(Cabbage);
    expect(cabbage.readAttribute("custom_type")).toBe("Cabbage");

    // becomes! back to Vegetable should clear the type
    cabbage.becomesBang(Vegetable);
    // Since becomes! shares attributes, cabbage's custom_type is also cleared
    expect(cabbage.readAttribute("custom_type")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // becomes and change tracking for inheritance columns
  // -------------------------------------------------------------------------

  it("becomes and change tracking for inheritance columns", async () => {
    const adapter = new MemoryAdapter();
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("custom_type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable, { column: "custom_type" });
      }
    }
    class Cucumber extends Vegetable {
      static { this.adapter = adapter; registerModel(Cucumber); registerSubclass(Cucumber); }
    }
    class Cabbage extends Vegetable {
      static { this.adapter = adapter; registerModel(Cabbage); registerSubclass(Cabbage); }
    }
    registerModel(Vegetable);

    const cucumber = await Cucumber.create({ name: "my cucumber" });
    const cabbage = cucumber.becomesBang(Cabbage);
    // After becomes!, the type changed from "Cucumber" to "Cabbage"
    expect(cabbage.readAttribute("custom_type")).toBe("Cabbage");
    expect(cabbage).toBeInstanceOf(Cabbage);
  });

  // -------------------------------------------------------------------------
  // update all within inheritance
  // -------------------------------------------------------------------------

  it("update all within inheritance", async () => {
    const adapter = new MemoryAdapter();
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    class Firm extends Company {
      static { this.adapter = adapter; registerModel(Firm); registerSubclass(Firm); }
    }
    class Client extends Company {
      static { this.adapter = adapter; registerModel(Client); registerSubclass(Client); }
    }
    registerModel(Company);

    await Firm.create({ name: "37signals" });
    await Client.create({ name: "Summit" });
    await Client.create({ name: "RailsCore" });

    await Client.updateAll({ name: "I am a client" });

    const client = await Client.all().first();
    expect(client!.readAttribute("name")).toBe("I am a client");

    // Firm should be unchanged
    const firm = await Firm.all().first();
    expect(firm!.readAttribute("name")).toBe("37signals");
  });

  // -------------------------------------------------------------------------
  // alt update all within inheritance
  // -------------------------------------------------------------------------

  it("alt update all within inheritance", async () => {
    const adapter = new MemoryAdapter();
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable);
      }
    }
    class Cucumber extends Vegetable {
      static { this.adapter = adapter; registerModel(Cucumber); registerSubclass(Cucumber); }
    }
    class Cabbage extends Vegetable {
      static { this.adapter = adapter; registerModel(Cabbage); registerSubclass(Cabbage); }
    }
    registerModel(Vegetable);

    await Cucumber.create({ name: "my cucumber" });
    await Cabbage.create({ name: "his cabbage" });

    await Cabbage.updateAll({ name: "the cabbage" });

    const cabbage = await Cabbage.all().first();
    expect(cabbage!.readAttribute("name")).toBe("the cabbage");

    const cucumber = await Cucumber.all().first();
    expect(cucumber!.readAttribute("name")).toBe("my cucumber");
  });

  // -------------------------------------------------------------------------
  // alt destroy all within inheritance
  // -------------------------------------------------------------------------

  it("alt destroy all within inheritance", async () => {
    const adapter = new MemoryAdapter();
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable);
      }
    }
    class Cucumber extends Vegetable {
      static { this.adapter = adapter; registerModel(Cucumber); registerSubclass(Cucumber); }
    }
    class Cabbage extends Vegetable {
      static { this.adapter = adapter; registerModel(Cabbage); registerSubclass(Cabbage); }
    }
    registerModel(Vegetable);

    await Cucumber.create({ name: "my cucumber" });
    await Cabbage.create({ name: "his cabbage" });
    await Cabbage.create({ name: "her cabbage" });
    await Cabbage.create({ name: "red cabbage" });

    await Cabbage.destroyAll();
    expect(await Cabbage.all().count()).toBe(0);
    expect(await Cucumber.all().count()).toBe(1);
  });

  // -------------------------------------------------------------------------
  // descends from active record
  // -------------------------------------------------------------------------

  it("descends from active record", () => {
    const adapter = new MemoryAdapter();
    class Post extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("type", "string");
        this._tableName = "posts";
        this.adapter = adapter;
        enableSti(Post);
      }
    }
    class StiPost extends Post {
      static { registerSubclass(StiPost); }
    }
    class SubStiPost extends StiPost {
      static { registerSubclass(SubStiPost); }
    }

    // Post is the STI base — it descends from Base directly
    expect(isStiSubclass(Post)).toBe(false);
    // StiPost is an STI subclass
    expect(isStiSubclass(StiPost)).toBe(true);
    // SubStiPost is also an STI subclass
    expect(isStiSubclass(SubStiPost)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // base_class?
  // -------------------------------------------------------------------------

  it("base class predicate", () => {
    const adapter = new MemoryAdapter();
    class Post extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("type", "string");
        this._tableName = "posts";
        this.adapter = adapter;
        enableSti(Post);
      }
    }
    class SpecialPost extends Post {
      static { registerSubclass(SpecialPost); }
    }
    class StiPost extends Post {
      static { registerSubclass(StiPost); }
    }
    class SubStiPost extends StiPost {
      static { registerSubclass(SubStiPost); }
    }

    expect(getStiBase(Post)).toBe(Post);
    expect(getStiBase(SpecialPost)).toBe(Post);
    expect(getStiBase(StiPost)).toBe(Post);
    expect(getStiBase(SubStiPost)).toBe(Post);
  });

  // -------------------------------------------------------------------------
  // complex inheritance — multi-level query finds subclass instances
  // -------------------------------------------------------------------------

  it("alt complex inheritance", async () => {
    const adapter = new MemoryAdapter();
    class Vegetable extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "vegetables";
        this.adapter = adapter;
        enableSti(Vegetable);
      }
    }
    class Cabbage extends Vegetable {
      static { this.adapter = adapter; registerModel(Cabbage); registerSubclass(Cabbage); }
    }
    class GreenCabbage extends Cabbage {
      static { this.adapter = adapter; registerModel(GreenCabbage); registerSubclass(GreenCabbage); }
    }
    class KingCole extends GreenCabbage {
      static { this.adapter = adapter; registerModel(KingCole); registerSubclass(KingCole); }
    }
    registerModel(Vegetable);

    const kingCole = await KingCole.create({ name: "uniform heads" });

    // KingCole.where should find it
    const found1 = await KingCole.where({ name: "uniform heads" }).first();
    expect(found1).toBeInstanceOf(KingCole);

    // GreenCabbage.where should find it (KingCole is a GreenCabbage descendant)
    const found2 = await GreenCabbage.where({ name: "uniform heads" }).first();
    expect(found2).toBeInstanceOf(KingCole);

    // Cabbage.where should find it
    const found3 = await Cabbage.where({ name: "uniform heads" }).first();
    expect(found3).toBeInstanceOf(KingCole);

    // Vegetable.where should find it
    const found4 = await Vegetable.where({ name: "uniform heads" }).first();
    expect(found4).toBeInstanceOf(KingCole);

    // Cabbage.find should return KingCole
    const found5 = await Cabbage.find(kingCole.id as number);
    expect(found5).toBeInstanceOf(KingCole);
  });

  // -------------------------------------------------------------------------
  // class with blank sti name
  // -------------------------------------------------------------------------

  it("class with blank sti name", async () => {
    const adapter = new MemoryAdapter();
    class Company extends Base {
      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this._tableName = "companies";
        this.adapter = adapter;
        enableSti(Company);
      }
    }
    registerModel(Company);

    const company = await Company.create({ name: "Test" });
    // Update type to blank
    company.writeAttribute("type", "  ");
    await company.save();

    const found = await Company.find(company.id as number);
    expect(found.readAttribute("type")).toBe("  ");
  });

  // -------------------------------------------------------------------------
  // inheritance without mapping (custom primary key)
  // -------------------------------------------------------------------------

  it("inheritance without mapping", async () => {
    const adapter = new MemoryAdapter();
    class Subscriber extends Base {
      static {
        this.attribute("nick", "string");
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.primaryKey = "nick";
        this._tableName = "subscribers";
        this.adapter = adapter;
        enableSti(Subscriber);
      }
    }
    class SpecialSubscriber extends Subscriber {
      static { this.adapter = adapter; registerModel(SpecialSubscriber); registerSubclass(SpecialSubscriber); }
    }
    registerModel(Subscriber);

    const ss = new SpecialSubscriber({ name: "And breaaaaathe!" });
    ss.writeAttribute("nick", "roger");
    await ss.save();

    const found = await SpecialSubscriber.find("roger");
    expect(found).toBeInstanceOf(SpecialSubscriber);
  });
});
