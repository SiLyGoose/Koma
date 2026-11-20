export const unequipText = {
    usage: (p) => `Which one? Use \`${p}unequip weapon\`, \`${p}unequip armor\`, \`${p}unequip treasure\` or \`${p}unequip all\`.`,
    tookOff: (names) => `You took off ${names.map((name) => `**${name}**`).join(' and ')}.`,
    nothingAtAll: "You aren't wearing anything.",
    noArmor: "You don't have any armor equipped.",
    noWeapon: "You don't have a weapon equipped.",
    noTreasure: "You don't have a treasure equipped.",
};
//# sourceMappingURL=unequip.js.map