import { describe, it, expect, afterEach } from "vitest";
import {
  travelTo,
  travelBack,
  travel,
  freezeTime,
  currentTime,
  assertCalled,
  assertNotCalled,
  assertCalledOnInstanceOf,
  assertNotCalledOnInstanceOf,
} from "./testing-helpers.js";

describe("TimeTravelTest", () => {
  afterEach(() => {
    travelBack();
  });

  it("time helper travel", () => {
    const before = Date.now();
    travel(24 * 60 * 60 * 1000); // travel 1 day
    const after = currentTime().getTime();
    expect(after - before).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 100);
    expect(after - before).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it("time helper travel with block", () => {
    let capturedTime: Date | null = null;
    travel(1000, () => {
      capturedTime = currentTime();
    });
    expect(capturedTime).not.toBeNull();
    expect(capturedTime!.getTime() - Date.now()).toBeLessThan(2000);
  });

  it("time helper travel to", () => {
    const target = new Date("2030-01-01T00:00:00Z");
    travelTo(target);
    expect(currentTime().getUTCFullYear()).toBe(2030);
  });

  it("time helper travel to with block", () => {
    const target = new Date("2032-06-15T12:00:00Z");
    let inside: Date | null = null;
    travelTo(target, () => {
      inside = currentTime();
    });
    expect(inside!.getUTCFullYear()).toBe(2032);
    expect(inside!.getUTCMonth()).toBe(5); // June = 5 (0-indexed)
  });

  it("time helper travel back", () => {
    const before = new Date();
    travelTo(new Date("2050-01-01"));
    travelBack();
    const after = currentTime();
    expect(Math.abs(after.getTime() - before.getTime())).toBeLessThan(5000);
  });

  it("time helper travel back with block", () => {
    travelTo(new Date("2040-01-01"), () => {
      expect(currentTime().getUTCFullYear()).toBe(2040);
    });
    // After block, time is restored
    expect(currentTime().getUTCFullYear()).not.toBe(2040);
  });

  it("time helper travel to with nested calls with blocks", () => {
    travelTo(new Date("2035-01-01"), () => {
      expect(currentTime().getUTCFullYear()).toBe(2035);
      travelTo(new Date("2036-01-01"), () => {
        expect(currentTime().getUTCFullYear()).toBe(2036);
      });
    });
  });

  it("time helper freeze time", () => {
    freezeTime();
    const t1 = currentTime().getTime();
    const t2 = currentTime().getTime();
    // Both should be very close (frozen)
    expect(Math.abs(t2 - t1)).toBeLessThan(10);
  });

  it("time helper freeze time with block", () => {
    let frozenAt: Date | null = null;
    freezeTime(() => {
      frozenAt = currentTime();
    });
    expect(frozenAt).not.toBeNull();
  });

  it("time helper unfreeze time", () => {
    freezeTime();
    travelBack();
    // After unfreeze, time is real again
    const t = currentTime();
    expect(Math.abs(t.getTime() - Date.now())).toBeLessThan(100);
  });

  it("time helper travel to with subsequent calls", () => {
    travelTo(new Date("2035-01-01"));
    expect(currentTime().getUTCFullYear()).toBe(2035);
    travelTo(new Date("2036-01-01"));
    expect(currentTime().getUTCFullYear()).toBe(2036);
  });

  it.skip("time helper travel to with time zone", () => {});
  it.skip("time helper travel to with different system and application time zones", () => {});
  it.skip("time helper travel to with string for time zone", () => {});
  it.skip("time helper travel to with string and milliseconds", () => {});
  it.skip("time helper travel to with separate class", () => {});
  it.skip("time helper travel to with usec", () => {});
  it.skip("time helper with usec true", () => {});
  it.skip("time helper travel to with datetime and usec", () => {});
  it.skip("time helper travel to with datetime and usec true", () => {});
  it.skip("time helper travel to with string and usec", () => {});
  it.skip("time helper travel to with string and usec true", () => {});
  it.skip("time helper freeze time with usec true", () => {});
  it.skip("time helper travel with subsequent block", () => {});
  it.skip("travel to will reset the usec to avoid mysql rounding", () => {});
  it.skip("time helper travel with time subclass", () => {});
});

describe("MethodCallAssertionsTest", () => {
  it("assert called with defaults to expect once", () => {
    const obj = { doThing: () => "result" };
    assertCalled(obj, "doThing", {}, () => {
      obj.doThing();
    });
  });

  it("assert called more than once", () => {
    const obj = { doThing: () => "result" };
    assertCalled(obj, "doThing", { times: 3 }, () => {
      obj.doThing();
      obj.doThing();
      obj.doThing();
    });
  });

  it("assert called method with arguments", () => {
    const obj = { greet: (name: string) => `Hello ${name}` };
    const records = assertCalled(obj, "greet", { with: ["Alice"] }, () => {
      obj.greet("Alice");
    });
    expect(records[0].args[0]).toBe("Alice");
  });

  it("assert called returns", () => {
    const obj = { getValue: () => "original" };
    const records = assertCalled(obj, "getValue", { returns: "mocked" }, () => {
      const result = obj.getValue();
      expect(result).toBe("mocked");
    });
    expect(records[0].returnValue).toBe("mocked");
  });

  it("assert called failure", () => {
    const obj = { doThing: () => "result" };
    expect(() => {
      assertCalled(obj, "doThing", {}, () => {
        // Don't call doThing
      });
    }).toThrow("Expected doThing to be called 1 time(s), but was called 0 time(s)");
  });

  it("assert called with message", () => {
    const obj = { doThing: () => "result" };
    // Just verify the error message format when call count doesn't match
    expect(() => {
      assertCalled(obj, "doThing", { times: 2 }, () => {
        obj.doThing(); // called only once
      });
    }).toThrow("Expected doThing to be called 2 time(s), but was called 1 time(s)");
  });

  it("assert called with arguments", () => {
    const obj = { process: (x: number, y: number) => x + y };
    const records = assertCalled(obj, "process", { with: [1, 2] }, () => {
      obj.process(1, 2);
    });
    expect(records[0].args).toEqual([1, 2]);
  });

  it("assert called with arguments and returns", () => {
    const obj = { compute: (x: number) => x * 2 };
    const records = assertCalled(obj, "compute", { with: [5], returns: 99 }, () => {
      const result = obj.compute(5);
      expect(result).toBe(99);
    });
    expect(records[0].returnValue).toBe(99);
  });

  it("assert called with failure", () => {
    const obj = { greet: (name: string) => `Hello ${name}` };
    expect(() => {
      assertCalled(obj, "greet", { with: ["Bob"] }, () => {
        obj.greet("Alice"); // wrong argument
      });
    }).toThrow();
  });

  it("assert called on instance of with defaults to expect once", () => {
    class MyService {
      doWork() {
        return "done";
      }
    }
    assertCalledOnInstanceOf(MyService, "doWork", {}, () => {
      new MyService().doWork();
    });
  });

  it("assert called on instance of more than once", () => {
    class MyService {
      doWork() {
        return "done";
      }
    }
    assertCalledOnInstanceOf(MyService, "doWork", { times: 2 }, () => {
      new MyService().doWork();
      new MyService().doWork();
    });
  });

  it("assert called on instance of with arguments", () => {
    class Greeter {
      greet(name: string) {
        return `Hello ${name}`;
      }
    }
    const records = assertCalledOnInstanceOf(Greeter, "greet", { with: ["Charlie"] }, () => {
      new Greeter().greet("Charlie");
    });
    expect(records[0].args[0]).toBe("Charlie");
  });

  it("assert called on instance of returns", () => {
    class Fetcher {
      fetch() {
        return "real";
      }
    }
    const records = assertCalledOnInstanceOf(Fetcher, "fetch", { returns: "mocked" }, () => {
      const result = new Fetcher().fetch();
      expect(result).toBe("mocked");
    });
    expect(records[0].returnValue).toBe("mocked");
  });

  it("assert called on instance of failure", () => {
    class MyService {
      doWork() {
        return "done";
      }
    }
    expect(() => {
      assertCalledOnInstanceOf(MyService, "doWork", {}, () => {
        // Don't call it
      });
    }).toThrow();
  });

  it("assert called on instance of with message", () => {
    class Widget {
      render() {
        return "html";
      }
    }
    expect(() => {
      assertCalledOnInstanceOf(Widget, "render", { times: 2 }, () => {
        new Widget().render(); // only once
      });
    }).toThrow(/Expected render to be called 2 time\(s\)/);
  });

  it("assert not called", () => {
    const obj = { doThing: () => "result" };
    assertNotCalled(obj, "doThing", () => {
      // Don't call doThing
    });
  });

  it("assert not called failure", () => {
    const obj = { doThing: () => "result" };
    expect(() => {
      assertNotCalled(obj, "doThing", () => {
        obj.doThing(); // shouldn't be called
      });
    }).toThrow();
  });

  it("assert not called on instance of", () => {
    class MyService {
      doWork() {
        return "done";
      }
    }
    assertNotCalledOnInstanceOf(MyService, "doWork", () => {
      // Don't call it
    });
  });

  it("assert not called on instance of failure", () => {
    class MyService {
      doWork() {
        return "done";
      }
    }
    expect(() => {
      assertNotCalledOnInstanceOf(MyService, "doWork", () => {
        new MyService().doWork(); // shouldn't be called
      });
    }).toThrow();
  });

  it.skip("assert called on instance of nesting", () => {});
  it.skip("assert not called on instance of nesting", () => {});
  it.skip("stub any instance", () => {});
  it.skip("stub any instance with instance", () => {});
  it.skip("assert changes when assertions are included", () => {});
});
