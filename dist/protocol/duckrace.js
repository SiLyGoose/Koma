/*
 * What the duck race's web page (the Koma-UI repo) and the bot say to each other: the shared tables'
 * messages (./table.ts), with the ducks as the spots, its round (the race run), and what a winning
 * duck pays. The site keeps a copy (its `yarn sync`).
 */
/** The ducks in every race, in their lanes from the top: the spots a bet goes on. */
export const DUCK_IDS = ['yellow', 'red', 'blue', 'green'];
/** Each duck's name and colour, as the page draws it and the bot names it. */
export const DUCKS = {
    yellow: { name: 'Yarl', color: '#f7c948' },
    red: { name: 'Erlaf', color: '#e5484d' },
    blue: { name: 'Faruk', color: '#3e8ef7' },
    green: { name: 'Jabin', color: '#46b35f' },
};
//# sourceMappingURL=duckrace.js.map