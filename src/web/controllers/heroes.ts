import type { RequestHandler } from 'express';
import { z } from 'zod';
import { TRANSCEND_PERKS } from '../../data/transcend.js';
import { HERO_SLOTS } from '../../types.js';
import { RAID_CLASS_IDS } from '../../constants/index.js';
import { HERO_LOADOUTS, PERK_PAGES_MAX, SALVAGE_PARTS, SALVAGE_STARS_MAX, SALVAGE_TIERS, TM_ACCESSORIES, TM_CRAFT_PARTS, type HeroPart } from '../../protocol/heroes.js';
import { ApiError } from '../lib/errors.js';
import type { HeroService } from '../services/heroes.js';
import { CopyId, parse, UserId } from '../lib/validate.js';
import { SELL_MAX } from './gear.js';
import { LOOT_OPEN_MOST } from '../../services/loot-boxes.js';

/* The heroes' requests (the shop's and the heroes page's). Each runs after middleware/auth.ts's member: res.locals has the server and who's asking. */

const Hero = z.object({ hero: z.string().max(64) });
const Slot = z.enum(HERO_SLOTS as [string, ...string[]]);
const Equip = Hero.extend({ slot: Slot, copy: CopyId });
const Refine = z.object({ copy: CopyId });
/** `locked`: locked copies are sold too (the page asked them first). */
const Sell = z.object({ copies: z.array(CopyId).min(1).max(SELL_MAX), locked: z.boolean().optional(), salvage: z.boolean().optional() });
const Lock = z.object({ copy: CopyId, locked: z.boolean() });
/** A rune into a copy's socket, or (null) the one in it out. */
const Rune = z.object({ copy: CopyId, socket: z.number().int().min(0).max(8), rune: z.string().max(64).nullable() });
/** One of a copy's options (from 0), or its unique option. */
const Reroll = z.object({ copy: CopyId, option: z.union([z.number().int().min(0).max(8), z.literal('unique')]) });
/** One of a copy's options (from 0), its amount rolled again. */
const Upgrade = z.object({ copy: CopyId, option: z.number().int().min(0).max(8) });
/** A TechnoMagic copy's rerolled additional skill kept ('new'), or the one it had ('old'); with `option` (its index), its rerolled option. */
const Keep = z.object({ copy: CopyId, keep: z.enum(['old', 'new']), option: z.union([z.literal('unique'), z.number().int().min(0).max(8)]).default('unique') });
/** One slot, or (left out) all of them. */
const Unequip = Hero.extend({ slot: Slot.nullish() });
/** The rule their drops are salvaged by (protocol/heroes.ts SalvageRule), or (null) none. */
const AutoSalvage = z.object({
  rule: z
    .object({
      tiers: z.array(z.number().int().refine((tier) => SALVAGE_TIERS.includes(tier))).max(SALVAGE_TIERS.length),
      stars: z.number().int().min(0).max(SALVAGE_STARS_MAX),
      parts: z.array(z.enum(SALVAGE_PARTS as [HeroPart, ...HeroPart[]])).max(SALVAGE_PARTS.length),
      classes: z.array(z.enum(RAID_CLASS_IDS)).max(RAID_CLASS_IDS.length),
    })
    .nullable(),
});
/** A TechnoMagic piece to craft: its set, and any of its pieces, a part picked, or a class's part picked (protocol/heroes.ts TmCraftKind); an accessory, of the kind picked (none: any). */
const Craft = z.object({
  set: z.enum(['perseverance', 'hope', 'authority']),
  kind: z.enum(['any', 'part', 'exact']),
  part: z.enum(TM_CRAFT_PARTS as [HeroPart, ...HeroPart[]]).nullish(),
  class: z.enum(RAID_CLASS_IDS).nullish(),
  accessory: z.enum(TM_ACCESSORIES).nullish(),
});
/** Transcendence Scrolls to craft: the set whose Boss Crystals pay, and how many (the Craft tab's most at once). */
const CraftScrolls = z.object({ set: z.enum(['perseverance', 'hope', 'authority']), count: z.number().int().min(1).max(1000) });
/** Dispatch Battle Loot to open: the box (King's Raid's code), and how many (at most LOOT_OPEN_MOST at once). */
const OpenBox = z.object({ box: z.string().max(64), count: z.number().int().min(1).max(LOOT_OPEN_MOST) });
/** One of a hero's perk pages (protocol/heroes.ts PERK_PAGES_MAX). */
const PerkPage = Hero.extend({ page: z.number().int().min(1).max(PERK_PAGES_MAX) });
/** One of their hero gear loadouts (protocol/heroes.ts HERO_LOADOUTS). */
const Loadout = z.object({ loadout: z.number().int().min(1).max(HERO_LOADOUTS.most) });
/** One of them, and the hero shown (to save what it wears, or to put it on). */
const HeroLoadout = Hero.extend(Loadout.shape);
/** One of them, and its new name (empty: none). Longer than a name can be is the store's to refuse, saying so. */
const LoadoutName = Loadout.extend({ name: z.string().max(200) });
/** Every perk picked (data/transcend.ts's). */
const Perks = Hero.extend({ perks: z.array(z.enum(TRANSCEND_PERKS.map((perk) => perk.id) as [string, ...string[]])).max(TRANSCEND_PERKS.length) });

export function heroController(heroes: HeroService) {
  return {
    /** Their own heroes, or (?user=…) someone else's in the server, to look at. */
    async view(req, res) {
      const { guildId, session } = res.locals;
      const other = req.query.user;
      if (other === undefined || other === session.userId) return void res.json(await heroes.view(guildId, session.userId));
      const user = UserId.safeParse(other).data;
      if (user === undefined) throw new ApiError('not_found');
      res.json(await heroes.peek(guildId, user));
    },

    async members(_req, res) {
      res.json(await heroes.members(res.locals.guildId, res.locals.session));
    },

    async buy(req, res) {
      const { hero } = parse(Hero, req.body);
      res.json(await heroes.buy(res.locals.guildId, res.locals.session.userId, hero));
    },

    async equip(req, res) {
      const { hero, slot, copy } = parse(Equip, req.body);
      res.json(await heroes.equip(res.locals.guildId, res.locals.session.userId, hero, slot as (typeof HERO_SLOTS)[number], copy));
    },

    async unequip(req, res) {
      const { hero, slot } = parse(Unequip, req.body);
      res.json(await heroes.unequip(res.locals.guildId, res.locals.session.userId, hero, (slot ?? null) as (typeof HERO_SLOTS)[number] | null));
    },

    async perks(req, res) {
      const { hero, perks } = parse(Perks, req.body);
      res.json(await heroes.perks(res.locals.guildId, res.locals.session.userId, hero, perks));
    },

    async perkPage(req, res) {
      const { hero, page } = parse(PerkPage, req.body);
      res.json(await heroes.perkPage(res.locals.guildId, res.locals.session.userId, hero, page));
    },

    async buyPerkPage(req, res) {
      const { hero, page } = parse(PerkPage, req.body);
      res.json(await heroes.buyPerkPage(res.locals.guildId, res.locals.session.userId, hero, page));
    },

    async transcend(req, res) {
      const { hero } = parse(Hero, req.body);
      res.json(await heroes.transcend(res.locals.guildId, res.locals.session.userId, hero));
    },

    async craftScrolls(req, res) {
      const { set, count } = parse(CraftScrolls, req.body);
      res.json(await heroes.craftScrolls(res.locals.guildId, res.locals.session.userId, set, count));
    },

    async scroll(req, res) {
      const { hero } = parse(Hero, req.body);
      res.json(await heroes.scroll(res.locals.guildId, res.locals.session.userId, hero));
    },

    async refine(req, res) {
      const { copy } = parse(Refine, req.body);
      res.json(await heroes.refine(res.locals.guildId, res.locals.session.userId, copy));
    },

    async rune(req, res) {
      const { copy, socket, rune } = parse(Rune, req.body);
      res.json(await heroes.rune(res.locals.guildId, res.locals.session.userId, copy, socket, rune));
    },

    async reroll(req, res) {
      const { copy, option } = parse(Reroll, req.body);
      res.json(await heroes.reroll(res.locals.guildId, res.locals.session.userId, copy, option));
    },

    async keep(req, res) {
      const { copy, keep, option } = parse(Keep, req.body);
      res.json(await heroes.keep(res.locals.guildId, res.locals.session.userId, copy, keep, option));
    },

    async upgrade(req, res) {
      const { copy, option } = parse(Upgrade, req.body);
      res.json(await heroes.upgrade(res.locals.guildId, res.locals.session.userId, copy, option));
    },

    async sell(req, res) {
      const { copies, locked, salvage } = parse(Sell, req.body);
      res.json(await heroes.sell(res.locals.guildId, res.locals.session.userId, copies, locked, salvage));
    },

    async lock(req, res) {
      const { copy, locked } = parse(Lock, req.body);
      res.json(await heroes.lock(res.locals.guildId, res.locals.session.userId, copy, locked));
    },

    async craft(req, res) {
      const { set, kind, part, class: cls, accessory } = parse(Craft, req.body);
      res.json(await heroes.craft(res.locals.guildId, res.locals.session.userId, set, kind, part ?? null, cls ?? null, accessory ?? null));
    },

    async openBox(req, res) {
      const { box, count } = parse(OpenBox, req.body);
      res.json(await heroes.openBox(res.locals.guildId, res.locals.session.userId, box, count));
    },

    async loadoutSave(req, res) {
      const { hero, loadout } = parse(HeroLoadout, req.body);
      res.json(await heroes.loadoutSave(res.locals.guildId, res.locals.session.userId, hero, loadout));
    },

    async loadoutEquip(req, res) {
      const { hero, loadout } = parse(HeroLoadout, req.body);
      res.json(await heroes.loadoutEquip(res.locals.guildId, res.locals.session.userId, hero, loadout));
    },

    async loadoutReset(req, res) {
      const { loadout } = parse(Loadout, req.body);
      res.json(await heroes.loadoutReset(res.locals.guildId, res.locals.session.userId, loadout));
    },

    async loadoutName(req, res) {
      const { loadout, name } = parse(LoadoutName, req.body);
      res.json(await heroes.loadoutName(res.locals.guildId, res.locals.session.userId, loadout, name));
    },

    async loadoutBuy(_req, res) {
      res.json(await heroes.loadoutBuy(res.locals.guildId, res.locals.session.userId));
    },

    async autoSalvage(req, res) {
      const { rule } = parse(AutoSalvage, req.body);
      res.json(await heroes.autoSalvage(res.locals.guildId, res.locals.session.userId, rule));
    },
  } satisfies Record<string, RequestHandler>;
}
