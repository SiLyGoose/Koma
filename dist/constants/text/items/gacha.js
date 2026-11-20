import { CURRENCY_EMOJI } from '../../core.js';
import { boldMoney, boldTokens } from '../currency.js';
import { MULTI_PULLS } from '../../items/gacha.js';
export const gachaText = {
    cantAfford: (p, cost, balance) => `A pull costs ${boldMoney(cost)} and you have ${boldMoney(balance)} Use \`${p}claim\` to earn more.`,
    /** `stars` is the star string, like "★★"; `slot` is the slot's emoji. */
    title: (name, slot) => `${name} ${slot}`,
    description: (itemDescription) => `*${itemDescription}*`,
    /** Added under the description when the pulled item is exclusive to other members. `owners` is mentions. */
    exclusive: (owners, share) => `Made for ${owners}. It only works at ${share} for you.`,
    author: (name) => `${name} pulled`,
    /** The same, for a pull from the limited banner. `banner` is its name. */
    authorLimited: (name, banner) => `${name} pulled from ${banner}`,
    /** The same, for a pull from the Hero Item banner. */
    authorHero: (name) => `${name} pulled from the Hero Item banner`,
    /** The message the shooting star plays in, before the result. */
    pullingTitle: 'A star is falling...',
    pulling: (user) => `${user} makes a wish...`,
    spentField: 'Spent',
    spent: (cost) => `${cost} ${CURRENCY_EMOJI}`,
    spentWithGear: (cost, saved) => `${cost} ${CURRENCY_EMOJI} (gear saved ${saved} ${CURRENCY_EMOJI})`,
    /** Pulls paid with komaTokens, alone or with points for the rest. `points` is what the points part says. */
    spentTokens: (tokens) => boldTokens(tokens),
    spentTokensAndPoints: (tokens, points) => `${boldTokens(tokens)} + ${points}`,
    balanceField: 'Balance',
    /** The balance field: points, and the komaTokens left under them (always shown, even at 0). */
    balanceWithTokens: (points, tokens) => `${points}\n${boldTokens(tokens)}`,
    /** Field showing how close the member is to a guaranteed top-tier item. `stars` is the star string. */
    pityField: (stars) => `Pity (${stars})`,
    /** The same field for a pull from the limited banner, which counts its own. */
    pityFieldLimited: (stars) => `Limited pity (${stars})`,
    /** The same for the Hero Item banner, whose top tier is the heroes' unique weapons. */
    pityFieldHero: (stars) => `Hero Item pity (${stars})`,
    pityProgress: (count, hardPity) => `${count} / ${hardPity}`,
    /** Field for the second item a pull gave for nothing (Pot of Greed); its value is the item's line. */
    extraField: 'Pot of Greed drew another',
    /** In a multi pull's list: an item a pull gave on top. `line` is the item's own line. */
    multiExtraLine: (line) => `+ ${line}`,
    footerNew: 'New item!',
    footerOwned: (count) => `You now own ${count}`,
    /** When the words after the command aren't "multi", "limited", "hero" or "banner". */
    usage: (p) => `Use \`${p}gacha\` for one pull, or \`${p}gacha multi\` for ${MULTI_PULLS} pulls at once. Add \`limited\` to pull from the limited banner (\`${p}gacha banner\` shows what is on it), or \`hero\` to pull from the Hero Item banner, for the heroes' unique weapons.`,
    /** A pull from the limited banner while it isn't open: none set, one on its way, and one that is over. */
    limitedNone: "There's no limited banner right now.",
    limitedOpens: (unix) => `The limited banner opens <t:${unix}:R>.`,
    limitedEnded: 'The limited banner has ended.',
    /** `gacha banner`: the limited banner. `name` is its name. */
    bannerTitle: (name) => `Limited banner: ${name}`,
    /** One line per featured item. `stars` is the star string; `slot` is the slot's emoji. */
    bannerFeatured: (name, slot) => `**${name}** ${slot}`,
    /** Under the featured items. `stars` is the star string, `chance` like "75%". */
    bannerOdds: (stars, chance) => `A ${stars} from this banner is one of these ${chance} of the time. After one that isn't, your next one is. Everything below ${stars} is the standard banner's.`,
    bannerWhenField: 'Open',
    bannerUntil: (unix) => `Until <t:${unix}:f> (<t:${unix}:R>)`,
    bannerNoEnd: 'Open, with no end set',
    bannerOpens: (unix) => `Opens <t:${unix}:f> (<t:${unix}:R>)`,
    bannerGuaranteeField: 'Guarantee',
    bannerGuaranteed: (stars) => `Your next ${stars} here is a featured item.`,
    bannerNotGuaranteed: (stars, chance) => `${chance} that your next ${stars} here is a featured item.`,
    bannerFooter: (p) => `Pull with ${p}gacha limited, or ${p}gacha limited multi for ${MULTI_PULLS}. Its pity is its own, and carries over to the next limited banner.`,
    multiCantAfford: (p, pulls, cost, balance) => `A multi pull (${pulls} pulls) costs ${boldMoney(cost)} and you have ${boldMoney(balance)} Use \`${p}claim\` to earn more.`,
    /** The same, when the member's komaTokens cover some of the pulls and points have to pay for the rest. */
    multiCantAffordWithTokens: (p, pulls, tokens, cost, balance) => `Your ${boldTokens(tokens)} cover ${tokens} of the ${pulls} pulls. The rest cost ${boldMoney(cost)} and you have ${boldMoney(balance)} Use \`${p}claim\` to earn more.`,
    multiTitle: (pulls) => `Multi pull x${pulls}`,
    /** One line per pull. `stars` is the star string; `slot` is the slot's emoji; `isNew` when it is the first copy the member has ever owned. */
    multiLine: (slot, name, isNew) => `${name} ${slot}${isNew ? ' · New!' : ''}`,
    /** Same, for a top-tier pull, which is set apart in bold. */
    multiLineTop: (slot, name, isNew) => `**${name}** ${slot}${isNew ? ' · New!' : ''}`,
    /** Added under the list for each pulled item that is exclusive to other members. `owners` is mentions. */
    multiExclusive: (name, owners, share) => `${name} is made for ${owners}. It only works at ${share} for you.`,
    multiSummaryField: 'Summary',
    /** One part of the summary: how many pulls gave items of a tier. `stars` is the star string. */
    multiTier: (stars, count) => `${stars} x${count}`,
    multiFooterNew: (count) => (count === 1 ? '1 new item!' : `${count} new items!`),
    multiFooterNoneNew: 'No new items',
};
//# sourceMappingURL=gacha.js.map