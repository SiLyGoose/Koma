export const d20Text = {
    /** Shown while the die is still tumbling. `user` is a mention. */
    spinningTitle: 'The die is rolling...',
    spinning: (user) => `${user} rolls the D20...`,
    failTitle: 'Critical fail!',
    successTitle: 'Critical success!',
    /** Above a rob that rolled the top number. `bonus` is what the d3 rolled, `multiplier` like "3x". */
    critical: (roll, bonus, multiplier) => `Critical success! The D20 landed on **${roll}**, and the d3 rolled **${bonus}**: **${multiplier}**.`,
    /**
     * Above a rob that rolled a 1: caught, whatever the odds. `bonus` is what the d3 rolled,
     * `multiplier` like "3x" (what it added to the fine is on the receipt).
     */
    robFail: (roll, bonus, multiplier) => `The D20 landed on **${roll}**. Critical fail! No way this rob works, and the d3 rolled **${bonus}**: **${multiplier}** fine.`,
    /** Above a rob that rolled 2 up to one below the top. `multiplier` like "0.7x", `chance` the chance after it, like "35%". */
    robLanded: (roll, multiplier, chance) => `The D20 landed on **${roll}**: **${multiplier}** success chance (**${chance}**).`,
};
//# sourceMappingURL=d20.js.map