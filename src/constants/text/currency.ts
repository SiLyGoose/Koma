import { CURRENCY_EMOJI, GEM_EMOJI, TOKEN_EMOJI } from '../core.js';
import { NUMBER_LOCALE } from '../formatting.js';

/** An already formatted amount in bold with the currency emoji after it: "1,500" -> "**1,500** <:zeiucoin:...>". */
export const boldMoney = (amount: string): string => `**${amount}** ${CURRENCY_EMOJI}`;

/** An amount of komaTokens in bold with the token emoji after it (no name, the emoji is the name): 3 -> "**3** <:zeiutoken:...>". */
/** An amount of komaGems in bold with the gem emoji after it: 5 -> "**5** <:komagem:...>". */
export const boldGems = (amount: number): string => `**${(Object.is(amount, -0) ? 0 : amount).toLocaleString(NUMBER_LOCALE)}** ${GEM_EMOJI}`;

export const boldTokens = (amount: number): string => `**${(Object.is(amount, -0) ? 0 : amount).toLocaleString(NUMBER_LOCALE)}** ${TOKEN_EMOJI}`;
