import { CURRENCY_EMOJI } from '../core.js';

/** An already formatted amount in bold with the currency emoji after it: "1,500" -> "**1,500** <:zeiucoin:...>". */
export const boldMoney = (amount: string): string => `**${amount}** ${CURRENCY_EMOJI}`;
