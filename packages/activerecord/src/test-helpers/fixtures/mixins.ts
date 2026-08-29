import { ref } from "../../fixtures.js";

const sets = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [`set_${i + 1}`, { id: i + 3001 }]),
);

const treeRows: ReadonlyArray<readonly [number, number, number, number]> = [
  [4001, 0, 1, 20],
  [4002, 4001, 2, 7],
  [4003, 4002, 3, 4],
  [4004, 4002, 5, 6],
  [4005, 4001, 14, 13],
  [4006, 4005, 9, 10],
  [4007, 4005, 11, 12],
  [4008, 4001, 8, 19],
  [4009, 4008, 15, 16],
  [4010, 4008, 17, 18],
];

const trees = Object.fromEntries(
  treeRows.map(([id, parentId, lft, rgt]) => [
    `tree_${id}`,
    {
      id,
      parent_id: parentId === 0 ? 0 : ref("mixins", `tree_${parentId}`),
      type: "NestedSetWithStringScope",
      lft,
      rgt,
      root_id: 42,
    },
  ]),
);

export const mixinFixtureData = { ...sets, ...trees };
