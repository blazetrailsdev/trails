export const LibxmlWorkarounds = {
  BROKEN_ESCAPING_ATTRIBUTES: new Set(["href", "action", "src", "name"]),
  BROKEN_ESCAPING_ATTRIBUTES_QUALIFYING_TAG: { name: "a" } as Record<string, string>,
};
