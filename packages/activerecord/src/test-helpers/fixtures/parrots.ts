const DEAD_PARROT = {
  parrot_sti_class: "DeadParrot",
};

export const parrotFixtureData = {
  _fixture: {
    ignore: "DEAD_PARROT",
  },
  DEAD_PARROT,
  george: {
    name: "Curious George",
    treasures: "diamond, sapphire",
    parrot_sti_class: "LiveParrot",
    breed: "australian",
  },
  louis: {
    name: "King Louis",
    treasures: ["diamond", "sapphire"],
    parrot_sti_class: "LiveParrot",
    breed: "african",
  },
  frederick: {
    name: "frederick",
    parrot_sti_class: "LiveParrot",
    breed: "african",
  },
  polly: {
    id: 4,
    name: "polly",
    killer: "blackbeard",
    treasures: "sapphire, ruby",
    ...DEAD_PARROT,
  },
  DEFAULTS: {
    treasures: "sapphire, ruby",
    parrot_sti_class: "LiveParrot",
    breed: "australian",
  },
  davey: {
    treasures: "sapphire, ruby",
    parrot_sti_class: "LiveParrot",
    breed: "australian",
  },
};
