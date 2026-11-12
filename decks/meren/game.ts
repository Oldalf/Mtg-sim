/**
 * The Meren of Clan Nel Toth deck's AI (Golgari reanimator): the rules of its cards, what it wants to
 * do each turn, Meren's end-step loop, and the goldfish combat rules agreed for this deck (see PLAN.md).
 *
 * Files:
 *   cards.ts       the card names and the facts about them (values, which creatures do what)
 *   game.ts        this file: MerenGame, its state, the win check, turn steps, combat and tutors
 *   triggers.ts    what happens when a permanent enters the battlefield or dies
 *   candidates.ts  everything the AI may do now, with a score each
 *   actions.ts     what the abilities and spells do when the AI picks them
 *
 * Win: 2 opponents dead, or cfg.win_damage damage dealt in total. Second measure: first opponent dead.
 * The game itself (mana, zones, casting, turns, combat) is the shared engine in engine/game-core.ts.
 */
import {
  DEATH_VALUE,
  EDICT_ETB,
  FREE_OUTLETS,
  GRAY_MERCHANT,
  HOLD,
  MANA_ELVES,
  MEREN,
  TOKENS,
  VALUE,
} from './cards';
import { buildCandidates } from './candidates';
import { onPermanentDied, onPermanentEntered } from './triggers';
import { CardDef, Cost } from '../../engine/cards';
import { Cand, LogBoardView, Perm, Zone } from '../../engine/game-types';
import { GameWithoutKillSearch } from '../../engine/game';
import { firstMax, removeIfPresent, sortDesc } from '../../engine/lists';
import { MulliganRule } from '../../engine/mulligan';
import { MULLIGAN } from './mulligan';

export class MerenGame extends GameWithoutKillSearch {
  override mulliganRule(): MulliganRule | null {
    return this.cfg.smart_mulligan ? MULLIGAN : null;
  }
  override colors = ['B', 'G'];
  experience = 0; // Meren's experience counters
  merenCasts = 0;
  // ---- measures for --diag (they change nothing in the game)
  merenOut: number | null = null; // the turn Meren first entered the battlefield
  permanentsAtTurnEnd: number[] = []; // nonland permanents (tokens too) at the end of turns 4-6
  reanimated = 0; // creature cards that came back from a graveyard to the battlefield (Meren, Unearth, Reanimate...)
  reanimatedAtTurnEnd: number[] = []; // ... at the end of turns 4-6
  experienceAtTurnEnd: number[] = []; // Meren's experience at the end of turns 4-6
  override diag(): Record<string, number | null> {
    return {
      merenOut: this.merenOut,
      spent5: this.spentEnd[5] ?? null,
      spent6: this.spentEnd[6] ?? null,
      perms5: this.permanentsAtTurnEnd[5] ?? null,
      perms6: this.permanentsAtTurnEnd[6] ?? null,
      reanim5: this.reanimatedAtTurnEnd[5] ?? null,
      reanim6: this.reanimatedAtTurnEnd[6] ?? null,
      exp5: this.experienceAtTurnEnd[5] ?? null,
      exp6: this.experienceAtTurnEnd[6] ?? null,
    };
  }
  morbidUsed = false; // Morbid Opportunist: once each turn
  divinerUsed = false; // Twilight Diviner: once each turn
  leftThisTurn = false; // a nonland permanent left the battlefield this turn (Decode Transmissions' void)
  prepared = new Set<Perm>(); // Studious First-Year / Grave Researcher can cast their spell copy
  lilianaUsed = false;
  gristUsed = false; // Grist: one loyalty ability per turn
  exileAtEnd: Perm[] = []; // Puppeteer Clique's stolen creature
  sacAtEnd: Perm[] = []; // Mobilize warriors

  // ================================================================ the win condition
  hasWon(): boolean {
    let dead = 0;
    for (let i = 0; i < this.life.length; i++) if (this.life[i] <= 0) dead++;
    return (
      dead >= (this.cfg.win_dead as number) ||
      this.damageDealt >= (this.cfg.win_damage as number)
    );
  }

  override oppsBeaten(): boolean {
    return this.hasWon();
  }

  override winsWith(dmg: number): boolean {
    const life = this.life.slice();
    let left = dmg,
      dealt = this.damageDealt;
    while (left > 0) {
      let weakestIndex = -1;
      for (let i = 0; i < life.length; i++)
        if (life[i] > 0 && (weakestIndex < 0 || life[i] < life[weakestIndex]))
          weakestIndex = i;
      if (weakestIndex < 0) break;
      const hit = Math.min(left, life[weakestIndex]);
      life[weakestIndex] -= hit;
      dealt += hit;
      left -= hit;
    }
    return (
      life.filter((life) => life <= 0).length >=
        (this.cfg.win_dead as number) ||
      dealt >= (this.cfg.win_damage as number)
    );
  }

  override checkKill(): number {
    if (this.died) return 2; // the game is over (lost)
    if (this.hasWon()) {
      if (this.unprot === null) {
        this.unprot = this.turn;
        this.say(
          `WIN: opp life [${this.life.join(', ')}], ${this.damageDealt} damage dealt`,
        );
      }
      return 2;
    }
    return 0;
  }

  override play(): [number | null, number | null] {
    super.play();
    return [this.died ? null : this.unprot, this.firstOppDead];
  }

  // ---------------------------------------------------------------- log analyzer hooks
  override syncFromLog(board: LogBoardView): void {
    this.experience = board.trackers['Start Your Engines!'] ?? 0;
  }

  override logToken(name: string): CardDef | null {
    const lowerCaseName = name.toLowerCase();
    if (lowerCaseName.includes('demon') || lowerCaseName.includes('stolen'))
      return TOKENS.stolen; // Pontus plays stolen creatures as 5/5 Demons
    if (lowerCaseName.includes('insect')) return TOKENS.insect;
    if (lowerCaseName.includes('zombie')) return TOKENS.zombie;
    if (lowerCaseName.includes('goat')) return TOKENS.goat;
    if (lowerCaseName.includes('warrior')) return TOKENS.warrior;
    if (lowerCaseName.includes('beast')) return TOKENS.beast;
    return null;
  }

  /** Copies also need Meren's own references to permanents pointing at the copied permanents. */
  override clone(): this {
    const copy = super.clone();
    const map = new Map(
      this.bf.map((permanent, i) => [permanent, copy.bf[i]] as [Perm, Perm]),
    );
    const toCopy = (permanent: Perm) => map.get(permanent) ?? permanent;
    copy.prepared = new Set([...this.prepared].map(toCopy));
    copy.exileAtEnd = this.exileAtEnd.map(toCopy);
    copy.sacAtEnd = this.sacAtEnd.map(toCopy);
    return copy;
  }

  /** The planner's score for a position with no win yet (higher is better). */
  override positionValue(): number {
    if (this.died) return -5000;
    let value = 0;
    // progress to the win: total damage, and the two opponents closest to dead
    value += 5 * Math.min(this.cfg.win_damage as number, this.damageDealt);
    const lives = this.life.slice().sort((first, second) => first - second);
    const start = this.cfg.opp_life as number;
    for (let i = 0; i < (this.cfg.win_dead as number); i++)
      value += 3 * (start - Math.max(0, lives[i]));
    // the board: attackers, Gray Merchant's devotion, Meren and her experience
    for (const permanent of this.creatures()) {
      if (permanent.cd.name === 'Spore Frog') value += 25;
      else
        value +=
          7 * this.power(permanent) * (permanent.cd.flying ? 1.5 : 1) +
          0.25 * this.battlefieldValue(permanent.cd);
    }
    value += 10 * Math.min(12, this.devotion('B'));
    if (this.onBf(MEREN)) value += 90 + 12 * Math.min(8, this.experience);
    else value += 6 * Math.min(8, this.experience);
    for (const battlefieldPermanent of this.bf)
      if (
        battlefieldPermanent.land === null &&
        !battlefieldPermanent.isCreature
      )
        value += 0.4 * this.battlefieldValue(battlefieldPermanent.cd);
    // resources: creature cards to bring back, mana, cards in hand
    value += 6 * Math.min(10, this.creaturesInGraveyard());
    value += 25 * Math.min(10, this.manaSources());
    value +=
      0.4 * this.hand.reduce((total, card) => total + this.cardValue(card), 0);
    // our life after the crackback that's coming
    const life = this.myLife - (this.fogUsed ? 0 : this.pendingCrackback);
    value +=
      life <= 0
        ? -3000
        : life < 20
          ? -10 * (20 - life)
          : 0.5 * Math.min(60, life - 20);
    return value;
  }

  // ================================================================ card values
  battlefieldValue(card: CardDef): number {
    if (card.name === 'Lotleth Giant')
      return Math.min(95, 10 * this.creaturesInGraveyard());
    return VALUE[card.name] ?? (card.isCreature ? 40 : 30);
  }

  override cardValue(card: CardDef): number {
    if (card.land !== null) {
      const manaAndLands = this.manaSources() + this.countLandsHand();
      return manaAndLands <= 3
        ? 80
        : manaAndLands <= 6
          ? 60
          : manaAndLands <= 8
            ? 40
            : 15;
    }
    if (card.isCreature) return this.battlefieldValue(card);
    if (HOLD.has(card.name)) return 20;
    return 45;
  }

  override discardValue(card: CardDef): number {
    // creature cards in the graveyard are fine: Meren and reanimation get them back
    return this.cardValue(card) - (card.isCreature ? 25 : 0);
  }

  creaturesInGraveyard(): number {
    return this.gy.filter((card) => card.isCreature).length;
  }

  override srcKind(permanent: Perm, ignoreSick = false): string | null {
    return super.srcKind(permanent, ignoreSick);
  }

  override commanderCost(card: CardDef, cost: Cost): Cost {
    return card.name === MEREN
      ? cost.withGeneric(cost.g + 2 * this.merenCasts)
      : cost;
  }
  override onCommanderCast(card: CardDef): void {
    if (card.name === MEREN) this.merenCasts++;
  }

  // ================================================================ zones
  millOurselves(count: number): void {
    for (let i = 0; i < count && this.library.length; i++)
      this.toGy(this.library.shift()!, true);
  }

  /** A basic land from the library onto the battlefield tapped. */
  fetchBasic(): void {
    const want =
      this.landsBf().filter((permanent) => permanent.land!.mana === 'G')
        .length <=
      this.landsBf().filter((permanent) => permanent.land!.mana === 'B').length
        ? 'Forest'
        : 'Swamp';
    const card =
      this.library.find((candidate) => candidate.name === want) ??
      this.library.find((candidate) => candidate.land?.basic) ??
      null;
    if (!card) return;
    removeIfPresent(this.library, card);
    this.shuffle();
    const basicLand = new Perm(card, card.land, true);
    basicLand.sick = false;
    this.bf.push(basicLand);
  }

  /** The best creature card in the graveyard for some purpose. */
  bestCreatureInGraveyard(
    isWanted: (card: CardDef) => boolean = () => true,
  ): CardDef | null {
    const cards = this.gy.filter((card) => card.isCreature && isWanted(card));
    return cards.length
      ? firstMax(cards, (card) => this.battlefieldValue(card))
      : null;
  }

  /** Put a creature card from our graveyard onto the battlefield. */
  reanimate(
    card: CardDef,
    opts: { tapped?: boolean; counters?: number } = {},
  ): Perm {
    removeIfPresent(this.gy, card);
    const permanent = this.enter(card, 'graveyard', { tapped: opts.tapped });
    if (opts.counters) permanent.counters += opts.counters;
    this.say('  reanimate', card);
    return permanent;
  }

  /** Our creatures in the order we'd sacrifice them (cheapest loss first). */
  sacrificeOrder(exclude: Perm[] = []): Perm[] {
    const sacValue = (permanent: Perm): number => {
      if (permanent.cd === TOKENS.stolen) return 80;
      if (permanent.token) return 5 + this.power(permanent);
      if (DEATH_VALUE.has(permanent.cd.name) && this.onBf(MEREN)) return 10;
      if (MANA_ELVES.has(permanent.cd.name) && this.turn >= 5) return 15;
      if (
        EDICT_ETB.has(permanent.cd.name) ||
        permanent.cd.name === 'Satyr Wayfinder' ||
        permanent.cd.name === 'Studious First-Year'
      )
        return 20;
      return this.battlefieldValue(permanent.cd);
    };
    return sortDesc(
      this.creatures().filter(
        (permanent) =>
          !exclude.includes(permanent) &&
          permanent.cd.name !== MEREN &&
          permanent.cd.name !== 'Spore Frog' &&
          permanent.cd.name !== 'Twilight Diviner',
      ),
      (permanent) => -sacValue(permanent),
    );
  }

  findFreeSacrificeOutlet(): Perm | null {
    for (const name of FREE_OUTLETS) {
      const permanent = this.perm(name);
      if (permanent) return permanent;
    }
    return null;
  }

  // ================================================================ triggers
  override onEnter(permanent: Perm, from: Zone): void {
    onPermanentEntered(this, permanent, from);
  }

  override onDies(permanent: Perm): void {
    onPermanentDied(this, permanent);
  }

  override powerBonus(permanent: Perm): number {
    return permanent.cd.name === 'Wight of the Reliquary'
      ? this.creaturesInGraveyard()
      : 0;
  }
  override toughnessBonus(permanent: Perm): number {
    return permanent.cd.name === 'Wight of the Reliquary'
      ? this.creaturesInGraveyard()
      : 0;
  }

  // ================================================================ turn steps
  override startTurn(): void {
    if (this.turn >= 4 && this.turn <= 6) {
      this.permanentsAtTurnEnd[this.turn] = this.bf.filter(
        (permanent) => permanent.land === null,
      ).length;
      this.reanimatedAtTurnEnd[this.turn] = this.reanimated;
      this.experienceAtTurnEnd[this.turn] = this.experience;
    }
    super.startTurn();
    this.morbidUsed =
      this.divinerUsed =
      this.leftThisTurn =
      this.gristUsed =
        false;
  }

  override upkeep(): void {
    // the opponents' turns happened: crackback, unless Spore Frog prevents it (then it's sacrificed)
    const frog = this.perm('Spore Frog');
    if (frog && this.fogUsed) {
      this.say('Spore Frog prevents the crackback');
      this.sacrifice(frog);
    } else if (this.pendingCrackback > 0) {
      this.loseLife(this.pendingCrackback);
      this.say(
        `crackback: we take ${this.pendingCrackback}, life ${this.myLife}`,
      );
    }
    this.pendingCrackback = 0;
    this.fogUsed = false;
    if (this.onBf('Phyrexian Arena')) {
      this.draw(1);
      this.loseLife(1);
    }
    // Ophiomancer: a deathtouch Snake at each of our upkeeps if we have none
    if (
      this.onBf('Ophiomancer') &&
      !this.bf.some((permanent) => permanent.cd === TOKENS.snake)
    )
      this.createTokens(TOKENS.snake);
    for (const researcher of this.bf.filter(
      (permanent) => permanent.cd.name === 'Grave Researcher',
    )) {
      this.scry(1, true);
      if (this.creaturesInGraveyard() >= 3) this.prepared.add(researcher);
    }
  }

  override endStep(): void {
    for (const permanent of this.sacAtEnd)
      if (this.bf.includes(permanent)) this.sacrifice(permanent);
    this.sacAtEnd = [];
    for (const exiledPermanent of this.exileAtEnd) {
      const i = this.bf.indexOf(exiledPermanent);
      if (i >= 0) {
        this.bf.splice(i, 1);
        this.leftThisTurn = true;
      }
    }
    this.exileAtEnd = [];
    if (this.onBf(MEREN)) this.feedMerenAtEndStep();
    this.checkKill();
  }

  /** Feed Meren with a free sacrifice outlet, then return the best creature card from the graveyard. */
  feedMerenAtEndStep(): void {
    const outlet = this.findFreeSacrificeOutlet();
    if (outlet) {
      // sacrifice tokens and creatures whose death is worth something: each one is an experience counter
      for (const permanent of this.sacrificeOrder()) {
        if (permanent === outlet && outlet.cd.name !== 'Viscera Seer') continue;
        if (
          permanent.cd === TOKENS.stolen ||
          FREE_OUTLETS.includes(permanent.cd.name)
        )
          continue;
        if (permanent.token || DEATH_VALUE.has(permanent.cd.name))
          this.sacrifice(permanent);
      }
      // the Gray Merchant loop: sacrifice it and let Meren bring it back (drain again)
      const grayMerchant = this.perm(GRAY_MERCHANT);
      if (grayMerchant && !grayMerchant.token && this.experience + 1 >= 5)
        this.sacrifice(grayMerchant);
    }
    const cands = this.gy.filter((card) => card.isCreature);
    if (!cands.length) return;
    const score = (card: CardDef) =>
      card.mv <= this.experience
        ? this.battlefieldValue(card)
        : this.battlefieldValue(card) * 0.4;
    const best = firstMax(cands, score);
    if (best.mv <= this.experience) {
      this.say(`Meren (${this.experience} experience) returns`, best);
      this.reanimate(best);
    } else {
      removeIfPresent(this.gy, best);
      this.hand.push(best);
      this.say(`Meren (${this.experience} experience) returns to hand`, best);
    }
  }

  // ================================================================ combat
  override canAttack(permanent: Perm): boolean {
    return super.canAttack(permanent) && permanent.cd.name !== 'Spore Frog';
  }
  override fogBlocker(): Perm | null {
    return this.perm('Spore Frog');
  }
  override onAttack(att: Perm[]): Perm[] {
    const extra: Perm[] = [];
    for (const permanent of att) {
      if (permanent.cd.name === 'Grave Titan')
        this.createTokens(TOKENS.zombie, 2);
      if (permanent.cd.name === 'Avenger of the Fallen') {
        // Mobilize X: tapped and attacking 1/1s, sacrificed at the end step
        for (const warrior of this.createTokens(
          TOKENS.warrior,
          this.creaturesInGraveyard(),
          {
            tapped: true,
          },
        )) {
          extra.push(warrior);
          this.sacAtEnd.push(warrior);
        }
      }
    }
    return extra;
  }
  override combat(): void {
    this.creatureCombat();
  }
  /** How close to winning the others think we are: Meren out, black devotion for Gray Merchant, a big graveyard. */
  override podClose(): number {
    let closeness = 0;
    if (this.onBf(MEREN)) closeness += 0.3;
    if (this.devotion('B') >= 8) closeness += 0.3;
    if (this.creaturesInGraveyard() >= 8) closeness += 0.2;
    if (
      this.onBf('Priest of Forgotten Gods') ||
      this.onBf('Zulaport Cutthroat')
    )
      closeness += 0.2;
    return Math.min(1, closeness);
  }
  /** A pod: Spore Frog is the fog, not a blocker. */
  override blockValue(permanent: Perm): number {
    return permanent.cd.name === 'Spore Frog'
      ? 500
      : super.blockValue(permanent);
  }
  /** A pod: sacrifice Spore Frog to prevent all combat damage this turn, when the hit is lethal or big (cfg.fog_at). */
  override fogPrevent(dmg: number, lethal: boolean): boolean {
    const frog = this.perm('Spore Frog');
    if (!frog || (!lethal && dmg < ((this.cfg.fog_at as number) ?? 6)))
      return false;
    this.sacrifice(frog);
    return true;
  }

  // ================================================================ tutors
  tutorPriorities(): string[] {
    const wantedNames: string[] = [];
    if (!this.findFreeSacrificeOutlet())
      wantedNames.push('Viscera Seer', 'Umbral Collar Zealot', 'Woe Strider');
    wantedNames.push(
      GRAY_MERCHANT,
      'Twilight Diviner',
      'Sepulchral Primordial',
      'Grave Titan',
      'Morbid Opportunist',
    );
    if (this.creaturesInGraveyard() >= 8) wantedNames.unshift('Lotleth Giant');
    return wantedNames;
  }

  override tutorTarget(
    allowed: (card: CardDef) => boolean,
    _toTop: boolean,
    _spent: string | null = null,
  ): CardDef | null {
    const cands = this.library.filter(allowed);
    if (!cands.length) return null;
    for (const name of this.tutorPriorities()) {
      const wantedCard = cands.find(
        (card) =>
          card.name === name &&
          !this.onBf(name) &&
          !this.hand.some((inHandCard) => inHandCard.name === name),
      );
      if (wantedCard) return wantedCard;
    }
    return firstMax(cands, (card) => this.cardValue(card));
  }

  /** A card from the library into the graveyard (Vile Entomber, Buried Alive). */
  tutorToGraveyard(allowed: (card: CardDef) => boolean): void {
    const cands = this.library.filter(
      (card) => allowed(card) && !this.gy.includes(card),
    );
    if (!cands.length) return;
    const order = [
      GRAY_MERCHANT,
      'Sepulchral Primordial',
      'Lotleth Giant',
      'Grave Titan',
      'Protean Hulk',
      'Rune-Scarred Demon',
    ];
    const chosen =
      order
        .map((name) => cands.find((card) => card.name === name))
        .find((card) => card) ??
      firstMax(cands, (card) => this.battlefieldValue(card));
    removeIfPresent(this.library, chosen);
    this.toGy(chosen, true);
    this.shuffle();
  }

  // ================================================================ spells
  override resolveOther(
    card: CardDef,
    _fromGy: boolean,
    mode: string | null,
  ): void {
    const name = card.name;
    if (name === 'Decode Transmissions') {
      this.draw(2);
      if (this.leftThisTurn) this.drainEach(2);
      else this.loseLife(2);
    } else if (name === 'Village Rites') this.draw(2);
    else if (name === 'Breach the Multiverse') {
      this.millOurselves(10);
      for (let i = 0; i < this.lib.length; i++)
        this.lib[i] = Math.max(0, this.lib[i] - 10);
      const best = this.bestCreatureInGraveyard();
      if (best) this.reanimate(best);
      for (let i = 0; i < this.oppsAlive(); i++)
        this.enter(TOKENS.stolen, 'graveyard', { token: true });
    } else if (name === 'Grisly Salvage') {
      const top = this.library.splice(0, 5);
      const keep = top.filter(
        (candidate) => candidate.isCreature || candidate.land !== null,
      );
      const kept = keep.length
        ? firstMax(keep, (candidate) => this.cardValue(candidate))
        : null;
      for (const c of top)
        if (c === kept) this.hand.push(c);
        else this.toGy(c, true);
    } else if (name === 'Persist') {
      const c = this.bestCreatureInGraveyard(
        (candidate) => !candidate.types.has('legendary'),
      );
      if (c) this.reanimate(c, { counters: -1 });
    } else if (name === 'Unearth') {
      const c = this.bestCreatureInGraveyard((candidate) => candidate.mv <= 3);
      if (c) this.reanimate(c);
    } else if (name === 'Victimize') {
      // (the sacrifice was paid when casting)
      for (let copyNumber = 0; copyNumber < 2; copyNumber++) {
        const c = this.bestCreatureInGraveyard();
        if (c) this.reanimate(c, { tapped: true });
      }
    } else if (name === 'Songs of the Damned')
      this.pool.B += this.creaturesInGraveyard();
    else if (name === 'Deadly Brew') {
      if (this.inArena()) this.arena!.edict(this, false);
      const permanent = this.sacrificeOrder()[0];
      if (permanent) {
        this.sacrifice(permanent);
        const back = this.gy.filter(
          (candidate) => candidate !== permanent.cd && candidate.land === null,
        );
        if (back.length) {
          const c = firstMax(back, (candidate) => this.cardValue(candidate));
          removeIfPresent(this.gy, c);
          this.hand.push(c);
        }
      }
    } else if (name === 'Buried Alive') {
      for (let copyNumber = 0; copyNumber < 3; copyNumber++)
        this.tutorToGraveyard((candidate) => candidate.isCreature);
    } else if (name === "Dina's Guidance") {
      if (mode === 'gy')
        this.tutorToGraveyard((candidate) => candidate.isCreature);
      else this.doTutor((candidate) => candidate.isCreature, false);
    }
  }
  candidates(main2: boolean): Cand[] {
    return buildCandidates(this, main2);
  }
}
