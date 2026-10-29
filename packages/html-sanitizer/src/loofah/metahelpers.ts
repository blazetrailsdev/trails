export const MetaHelpers = {
  addDowncasedSetMembersToAllSetConstants(mojule: object): void {
    for (const constant of Object.values(mojule)) {
      if (!(constant instanceof Set)) continue;

      for (const member of [...constant]) {
        constant.add((member as string).toLowerCase());
      }
    }
  },
};
