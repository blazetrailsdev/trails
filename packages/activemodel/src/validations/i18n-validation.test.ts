import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { assertCalledWith } from "@blazetrails/activesupport";
import { Range } from "@blazetrails/ruby-compat";
import { Error as ModelError } from "../error.js";
import { I18n } from "../i18n.js";
import { Person as BasePerson } from "../test-helpers/models/person.js";

describe("I18nValidationTest", () => {
  let personStub: typeof BasePerson | undefined;
  let person: BasePerson & Record<string, any>;
  let oldLoadPath: (string | string[])[];
  let oldBackend: ReturnType<typeof I18n.backend>;
  let originalI18nCustomizeFullMessage: boolean;

  function personClass(): typeof BasePerson {
    return (personStub ??= class Person extends BasePerson {});
  }

  function setup(): void {
    BasePerson.clearValidatorsBang();
    personStub = undefined;
    person = new (personClass())();

    oldLoadPath = [...I18n.loadPath()];
    oldBackend = I18n.backend();
    I18n.loadPath().length = 0;
    I18n.setBackend(new I18n.Simple());
    I18n.backend().storeTranslations("en", { errors: { messages: { custom: null } } });

    originalI18nCustomizeFullMessage = ModelError.i18nCustomizeFullMessage;
    ModelError.i18nCustomizeFullMessage = true;
  }

  async function teardown(): Promise<void> {
    personClass().clearValidatorsBang();
    personStub = undefined;
    I18n.loadPath().splice(0, I18n.loadPath().length, ...oldLoadPath);
    I18n.setBackend(oldBackend);
    await I18n.backend().reloadBang();
    ModelError.i18nCustomizeFullMessage = originalI18nCustomizeFullMessage;
  }

  beforeEach(setup);
  afterEach(teardown);

  it("full message encoding", async () => {
    I18n.backend().storeTranslations("en", { errors: { messages: { too_short: "猫舌" } } });
    personClass().validatesLengthOf("title", { within: new Range(3, 5) });
    await person.isValid();
    expect(person.errors.fullMessages).toEqual(["Title 猫舌"]);
  });

  it("errors full messages translates human attribute name for model attributes", async () => {
    person.errors.add("name", "not found");
    await assertCalledWith(
      personClass(),
      "humanAttributeName",
      ["name", { default: "Name", base: person }],
      { returns: "Person's name" },
      () => {
        expect(person.errors.fullMessages).toEqual(["Person's name not found"]);
      },
    );
  });

  it("errors full messages uses format", () => {
    I18n.backend().storeTranslations("en", {
      errors: { format: "Field %{attribute} %{message}" },
    });
    person.errors.add("name", "empty");
    expect(person.errors.fullMessages).toEqual(["Field Name empty"]);
  });

  it("errors full messages doesnt use attribute format without config", () => {
    ModelError.i18nCustomizeFullMessage = false;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: { models: { person: { attributes: { name: { format: "%{message}" } } } } },
      },
    });

    const person = new (personClass())();
    expect(person.errors.fullMessage("name", "cannot be blank")).toEqual("Name cannot be blank");
    expect(person.errors.fullMessage("name_test", "cannot be blank")).toEqual(
      "Name test cannot be blank",
    );
  });

  it("errors full messages on nested error uses attribute format", () => {
    ModelError.i18nCustomizeFullMessage = true;
    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: { models: { person: { attributes: { gender: "Gender" } } } },
        attributes: { "person/contacts": { gender: "Gender" } },
      },
    });

    const person = new (personClass())();
    const error = new ModelError(person, "gender", "can't be blank");
    person.errors.import(error, { attribute: "person[0].contacts.gender" });
    expect(person.errors.fullMessages).toEqual(["Gender can't be blank"]);
  });

  it("errors full messages uses attribute format", () => {
    ModelError.i18nCustomizeFullMessage = true;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: { models: { person: { attributes: { name: { format: "%{message}" } } } } },
      },
    });

    const person = new (personClass())();
    expect(person.errors.fullMessage("name", "cannot be blank")).toEqual("cannot be blank");
    expect(person.errors.fullMessage("name_test", "cannot be blank")).toEqual(
      "Name test cannot be blank",
    );
  });

  it("errors full messages uses model format", () => {
    ModelError.i18nCustomizeFullMessage = true;

    I18n.backend().storeTranslations("en", {
      activemodel: { errors: { models: { person: { format: "%{message}" } } } },
    });

    const person = new (personClass())();
    expect(person.errors.fullMessage("name", "cannot be blank")).toEqual("cannot be blank");
    expect(person.errors.fullMessage("name_test", "cannot be blank")).toEqual("cannot be blank");
  });

  it("errors full messages uses deeply nested model attributes format", () => {
    ModelError.i18nCustomizeFullMessage = true;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: {
          models: {
            "person/contacts/addresses": { attributes: { street: { format: "%{message}" } } },
          },
        },
      },
    });

    const person = new (personClass())();
    expect(person.errors.fullMessage("contacts/addresses.street", "cannot be blank")).toEqual(
      "cannot be blank",
    );
    expect(person.errors.fullMessage("contacts/addresses.country", "cannot be blank")).toEqual(
      "Contacts/addresses country cannot be blank",
    );
  });

  it("errors full messages uses deeply nested model model format", () => {
    ModelError.i18nCustomizeFullMessage = true;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: { models: { "person/contacts/addresses": { format: "%{message}" } } },
      },
    });

    const person = new (personClass())();
    expect(person.errors.fullMessage("contacts/addresses.street", "cannot be blank")).toEqual(
      "cannot be blank",
    );
    expect(person.errors.fullMessage("contacts/addresses.country", "cannot be blank")).toEqual(
      "cannot be blank",
    );
  });

  it("errors full messages with indexed deeply nested attributes and attributes format", () => {
    ModelError.i18nCustomizeFullMessage = true;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: {
          models: {
            "person/contacts/addresses": { attributes: { street: { format: "%{message}" } } },
          },
        },
      },
    });

    const person = new (personClass())();
    expect(
      person.errors.fullMessage("contacts[0]/addresses[123].street", "cannot be blank"),
    ).toEqual("cannot be blank");
    expect(
      person.errors.fullMessage("contacts[0]/addresses[123].country", "cannot be blank"),
    ).toEqual("Contacts/addresses country cannot be blank");
  });

  it("errors full messages with indexed deeply nested attributes and model format", () => {
    ModelError.i18nCustomizeFullMessage = true;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: { models: { "person/contacts/addresses": { format: "%{message}" } } },
      },
    });

    const person = new (personClass())();
    expect(
      person.errors.fullMessage("contacts[0]/addresses[123].street", "cannot be blank"),
    ).toEqual("cannot be blank");
    expect(
      person.errors.fullMessage("contacts[0]/addresses[123].country", "cannot be blank"),
    ).toEqual("cannot be blank");
  });

  it("errors full messages with indexed deeply nested attributes and i18n attribute name", () => {
    ModelError.i18nCustomizeFullMessage = true;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        attributes: { "person/contacts/addresses": { country: "Country" } },
      },
    });

    const person = new (personClass())();
    expect(
      person.errors.fullMessage("contacts[0]/addresses[123].street", "cannot be blank"),
    ).toEqual("Contacts/addresses street cannot be blank");
    expect(
      person.errors.fullMessage("contacts[0]/addresses[123].country", "cannot be blank"),
    ).toEqual("Country cannot be blank");
  });

  it("errors full messages with indexed deeply nested attributes without i18n config", () => {
    ModelError.i18nCustomizeFullMessage = false;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: {
          models: {
            "person/contacts/addresses": { attributes: { street: { format: "%{message}" } } },
          },
        },
      },
    });

    const person = new (personClass())();
    expect(person.errors.fullMessage("contacts[0]/addresses[0].street", "cannot be blank")).toEqual(
      "Contacts[0]/addresses[0] street cannot be blank",
    );
    expect(
      person.errors.fullMessage("contacts[0]/addresses[0].country", "cannot be blank"),
    ).toEqual("Contacts[0]/addresses[0] country cannot be blank");
  });

  it("errors full messages with i18n attribute name without i18n config", () => {
    ModelError.i18nCustomizeFullMessage = false;

    I18n.backend().storeTranslations("en", {
      activemodel: {
        attributes: { "person/contacts[0]/addresses[0]": { country: "Country" } },
      },
    });

    const person = new (personClass())();
    expect(person.errors.fullMessage("contacts[0]/addresses[0].street", "cannot be blank")).toEqual(
      "Contacts[0]/addresses[0] street cannot be blank",
    );
    expect(
      person.errors.fullMessage("contacts[0]/addresses[0].country", "cannot be blank"),
    ).toEqual("Country cannot be blank");
  });

  const COMMON_CASES: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ["given no options", {}, {}],
    ["given custom message", { message: "custom" }, { message: "custom" }],
    ["given if condition", { if: () => true }, {}],
    ["given unless condition", { unless: () => false }, {}],
    ["given option that is not reserved", { format: "jpg" }, { format: "jpg" }],
  ];

  function validateAndReadMessages(): () => Promise<void> {
    return async () => {
      await person.isValid();
      void person.errors.messages;
    };
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_confirmation_of on generated message ${name}`, async () => {
      personClass().validatesConfirmationOf("title", validationOptions);
      person.titleConfirmation = "foo";
      const call = [
        "titleConfirmation",
        ":confirmation",
        person,
        { ...generateMessageOptions, attribute: "Title" },
      ];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_acceptance_of on generated message ${name}`, async () => {
      personClass().validatesAcceptanceOf("title", { ...validationOptions, allowNil: false });
      const call = ["title", ":accepted", person, generateMessageOptions];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_presence_of on generated message ${name}`, async () => {
      personClass().validatesPresenceOf("title", validationOptions);
      const call = ["title", ":blank", person, generateMessageOptions];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_length_of for :within on generated message when too short ${name}`, async () => {
      personClass().validatesLengthOf("title", { ...validationOptions, within: new Range(3, 5) });
      const call = ["title", ":too_short", person, { ...generateMessageOptions, count: 3 }];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_length_of for :too_long generated message ${name}`, async () => {
      personClass().validatesLengthOf("title", { ...validationOptions, within: new Range(3, 5) });
      person.title = "this title is too long";
      const call = ["title", ":too_long", person, { ...generateMessageOptions, count: 5 }];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_length_of for :is on generated message ${name}`, async () => {
      personClass().validatesLengthOf("title", { ...validationOptions, is: 5 });
      const call = ["title", ":wrong_length", person, { ...generateMessageOptions, count: 5 }];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_format_of on generated message ${name}`, async () => {
      personClass().validatesFormatOf("title", {
        ...validationOptions,
        with: /^[1-9][0-9]*$/,
      });
      person.title = "72x";
      const call = ["title", ":invalid", person, { ...generateMessageOptions, value: "72x" }];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_inclusion_of on generated message ${name}`, async () => {
      personClass().validatesInclusionOf("title", { ...validationOptions, in: ["a", "b", "c"] });
      person.title = "z";
      const call = ["title", ":inclusion", person, { ...generateMessageOptions, value: "z" }];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_inclusion_of using :within on generated message ${name}`, async () => {
      personClass().validatesInclusionOf("title", {
        ...validationOptions,
        within: ["a", "b", "c"],
      });
      person.title = "z";
      const call = ["title", ":inclusion", person, { ...generateMessageOptions, value: "z" }];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_exclusion_of generated message ${name}`, async () => {
      personClass().validatesExclusionOf("title", { ...validationOptions, in: ["a", "b", "c"] });
      person.title = "a";
      const call = ["title", ":exclusion", person, { ...generateMessageOptions, value: "a" }];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_exclusion_of using :within generated message ${name}`, async () => {
      personClass().validatesExclusionOf("title", {
        ...validationOptions,
        within: ["a", "b", "c"],
      });
      person.title = "a";
      const call = ["title", ":exclusion", person, { ...generateMessageOptions, value: "a" }];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_numericality_of generated message ${name}`, async () => {
      personClass().validatesNumericalityOf("title", validationOptions);
      person.title = "a";
      const call = ["title", ":not_a_number", person, { ...generateMessageOptions, value: "a" }];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_numericality_of for :only_integer on generated message ${name}`, async () => {
      personClass().validatesNumericalityOf("title", { ...validationOptions, onlyInteger: true });
      person.title = "0.0";
      const call = [
        "title",
        ":not_an_integer",
        person,
        { ...generateMessageOptions, value: "0.0" },
      ];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_numericality_of for :odd on generated message ${name}`, async () => {
      personClass().validatesNumericalityOf("title", {
        ...validationOptions,
        onlyInteger: true,
        odd: true,
      });
      (person as Record<string, unknown>).title = 0;
      const call = ["title", ":odd", person, { ...generateMessageOptions, value: 0 }];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  for (const [name, validationOptions, generateMessageOptions] of COMMON_CASES) {
    it(`validates_numericality_of for :less_than on generated message ${name}`, async () => {
      personClass().validatesNumericalityOf("title", {
        ...validationOptions,
        onlyInteger: true,
        lessThan: 0,
      });
      (person as Record<string, unknown>).title = 1;
      const call = [
        "title",
        ":less_than",
        person,
        { ...generateMessageOptions, value: 1, count: 0 },
      ];
      await assertCalledWith(ModelError, "generateMessage", call, {}, validateAndReadMessages());
    });
  }

  const VALIDATION_EXPECTATIONS: [
    string,
    string,
    (person: BasePerson & Record<string, any>, optionsToMerge: Record<string, unknown>) => void,
  ][] = [
    [
      "validates_confirmation_of",
      "confirmation",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesConfirmationOf("title", optionsToMerge);
        person.titleConfirmation = "foo";
      },
    ],
    [
      "validates_acceptance_of",
      "accepted",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesAcceptanceOf("title", {
          ...optionsToMerge,
          allowNil: false,
        });
      },
    ],
    [
      "validates_presence_of",
      "blank",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesPresenceOf("title", optionsToMerge);
      },
    ],
    [
      "validates_length_of",
      "too_short",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesLengthOf("title", {
          ...optionsToMerge,
          within: new Range(3, 5),
        });
      },
    ],
    [
      "validates_length_of",
      "too_long",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesLengthOf("title", {
          ...optionsToMerge,
          within: new Range(3, 5),
        });
        person.title = "too long";
      },
    ],
    [
      "validates_length_of",
      "wrong_length",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesLengthOf("title", {
          ...optionsToMerge,
          is: 5,
        });
      },
    ],
    [
      "validates_format_of",
      "invalid",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesFormatOf("title", {
          ...optionsToMerge,
          with: /^[1-9][0-9]*$/,
        });
      },
    ],
    [
      "validates_inclusion_of",
      "inclusion",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesInclusionOf("title", {
          ...optionsToMerge,
          in: ["a", "b", "c"],
        });
      },
    ],
    [
      "validates_exclusion_of",
      "exclusion",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesExclusionOf("title", {
          ...optionsToMerge,
          in: ["a", "b", "c"],
        });
        person.title = "a";
      },
    ],
    [
      "validates_numericality_of",
      "not_a_number",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesNumericalityOf("title", optionsToMerge);
        person.title = "a";
      },
    ],
    [
      "validates_numericality_of",
      "not_an_integer",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesNumericalityOf("title", {
          ...optionsToMerge,
          onlyInteger: true,
        });
        person.title = "1.0";
      },
    ],
    [
      "validates_numericality_of",
      "odd",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesNumericalityOf("title", {
          ...optionsToMerge,
          onlyInteger: true,
          odd: true,
        });
        (person as Record<string, unknown>).title = 0;
      },
    ],
    [
      "validates_numericality_of",
      "less_than",
      (person, optionsToMerge) => {
        (person.constructor as typeof BasePerson).validatesNumericalityOf("title", {
          ...optionsToMerge,
          onlyInteger: true,
          lessThan: 0,
        });
        (person as Record<string, unknown>).title = 1;
      },
    ],
  ];

  async function eachValidationExpectation(
    body: (
      attribute: string,
      errorType: string,
      blockThatSetsValidation: (
        person: BasePerson & Record<string, any>,
        optionsToMerge: Record<string, unknown>,
      ) => void,
    ) => Promise<void>,
  ): Promise<void> {
    for (const [, errorType, blockThatSetsValidation] of VALIDATION_EXPECTATIONS) {
      const attribute = errorType === "confirmation" ? "titleConfirmation" : "title";
      await teardown();
      setup();
      await body(attribute, errorType, blockThatSetsValidation);
    }
  }

  it("finds custom model key translation when", async () => {
    await eachValidationExpectation(async (attribute, errorType, block) => {
      I18n.backend().storeTranslations("en", {
        activemodel: {
          errors: {
            models: { person: { attributes: { [attribute]: { [errorType]: "custom message" } } } },
          },
        },
      });
      I18n.backend().storeTranslations("en", {
        errors: { messages: { [errorType]: "global message" } },
      });

      block(person, {});
      await person.isValid();
      expect(person.errors.get(attribute)).toEqual(["custom message"]);
    });
  });

  it("finds custom model key translation with interpolation when", async () => {
    await eachValidationExpectation(async (attribute, errorType, block) => {
      I18n.backend().storeTranslations("en", {
        activemodel: {
          errors: {
            models: {
              person: {
                attributes: { [attribute]: { [errorType]: "custom message with %{extra}" } },
              },
            },
          },
        },
      });
      I18n.backend().storeTranslations("en", {
        errors: { messages: { [errorType]: "global message" } },
      });

      block(person, { extra: "extra information" });
      await person.isValid();
      expect(person.errors.get(attribute)).toEqual(["custom message with extra information"]);
    });
  });

  it("finds global default key translation when", async () => {
    await eachValidationExpectation(async (attribute, errorType, block) => {
      I18n.backend().storeTranslations("en", {
        errors: { messages: { [errorType]: "global message" } },
      });

      block(person, {});
      await person.isValid();
      expect(person.errors.get(attribute)).toEqual(["global message"]);
    });
  });

  it("validations with message symbol must translate", async () => {
    I18n.backend().storeTranslations("en", {
      errors: { messages: { custom_error: "I am a custom error" } },
    });
    personClass().validatesPresenceOf("title", { message: ":custom_error" });
    person.title = null;
    await person.isValid();
    expect(person.errors.get("title")).toEqual(["I am a custom error"]);
  });

  it("validates with message symbol must translate per attribute", async () => {
    I18n.backend().storeTranslations("en", {
      activemodel: {
        errors: {
          models: { person: { attributes: { title: { custom_error: "I am a custom error" } } } },
        },
      },
    });
    personClass().validatesPresenceOf("title", { message: ":custom_error" });
    person.title = null;
    await person.isValid();
    expect(person.errors.get("title")).toEqual(["I am a custom error"]);
  });

  it("validates with message symbol must translate per model", async () => {
    I18n.backend().storeTranslations("en", {
      activemodel: { errors: { models: { person: { custom_error: "I am a custom error" } } } },
    });
    personClass().validatesPresenceOf("title", { message: ":custom_error" });
    person.title = null;
    await person.isValid();
    expect(person.errors.get("title")).toEqual(["I am a custom error"]);
  });

  it("validates with message string", async () => {
    personClass().validatesPresenceOf("title", { message: "I am a custom error" });
    person.title = null;
    await person.isValid();
    expect(person.errors.get("title")).toEqual(["I am a custom error"]);
  });
});
