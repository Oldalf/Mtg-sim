/**
 * Mike's drawing: one card actually drawn (or what replaces a draw from an empty library: Laboratory Maniac and Jace
 * win, Ormos takes counters, Living Conundrum skips it, otherwise we lose), and what every card drawn triggers
 * (Psychosis Crawler, the counters of Skymage and Oneirophage, Ominous Seas' Krakens, Wizard Class, and on the second
 * draw of a turn Emrakul's Messenger, Mischievous Mystic and Krang). MikeGame's drawOne and drawTriggers call these.
 */
import {
  CLINQUANT_SKYMAGE,
  EMRAKULS_MESSENGER,
  JACE,
  KRANG,
  LABORATORY_MANIAC,
  LIVING_CONUNDRUM,
  MISCHIEVOUS_MYSTIC,
  OMINOUS_SEAS,
  ONEIROPHAGE,
  ORMOS_ARCHIVE_KEEPER,
  PSYCHOSIS_CRAWLER,
  TOK,
  WIZARD_CLASS,
} from './cards';
import type { MikeGame } from './game';

/** One card actually drawn (or the empty-library replacement). */
export function drawOneCard(game: MikeGame): void {
  if (!game.library.length) {
    if (
      game.countOnBattlefield(LABORATORY_MANIAC) > 0 ||
      game.isOnBattlefield(JACE)
    ) {
      game.milled = true;
      game.winHow = 'mill';
      game.say('draw from an empty library: WIN');
    } else if (game.countOnBattlefield(ORMOS_ARCHIVE_KEEPER) > 0) {
      const permanent = game.battlefield.find(
        (candidate) => candidate.card.name === ORMOS_ARCHIVE_KEEPER,
      )!;
      permanent.counters += 5;
    } else if (game.isOnBattlefield(LIVING_CONUNDRUM)) {
      // the draw is skipped
    } else {
      game.died = true;
      game.say('draw from an empty library: we lose');
    }
    return;
  }
  game.firstDrawDone = true;
  game.putCard(game.takeTopCardsOfLibrary(1)[0], 'hand');
  if (!game.library.length && game.emptiedTurn === null) {
    game.emptiedTurn = game.turn;
    game.emptiedSafe = game.isSafeToEmptyLibrary();
  }
  game.drawsThisTurn += 1;
  game.drawTriggers();
}

/** What one card drawn triggers, as many times as the draw triggers are doubled. */
export function triggerOnCardDrawn(game: MikeGame): void {
  const triggerCount = game.drawTriggerMultiplier();
  const second = game.drawsThisTurn === 2;
  for (let triggerNumber = 0; triggerNumber < triggerCount; triggerNumber++) {
    const crawlers = game.countOnBattlefield(PSYCHOSIS_CRAWLER);
    if (crawlers) game.crawlerDrain += game.drainEach(crawlers);
    for (const permanent of game.battlefield) {
      const name = game.effectiveCard(permanent).name;
      if (name === CLINQUANT_SKYMAGE || name === ONEIROPHAGE)
        permanent.counters += 1;
    }
    const seas = game.findPermanent(OMINOUS_SEAS);
    if (seas) {
      seas.counters += 1;
      while (seas.counters >= 8) {
        seas.counters -= 8;
        game.createTokens(TOK.kraken, 1);
        game.say('Ominous Seas: an 8/8 Kraken');
      }
    }
    if (game.findPermanent(WIZARD_CLASS)?.counters === 3) {
      const counterRecipient = game.counterTarget();
      if (counterRecipient) counterRecipient.counters += 1;
    }
    if (second) {
      for (const battlefieldPermanent of game.battlefield.slice()) {
        const name = game.effectiveCard(battlefieldPermanent).name;
        if (name === EMRAKULS_MESSENGER) game.createTokens(TOK.spawn, 1);
        else if (name === MISCHIEVOUS_MYSTIC) game.createTokens(TOK.faerie, 1);
      }
    }
  }
  if (second) {
    for (const battlefieldPermanent of game.battlefield)
      if (battlefieldPermanent.card.name === KRANG)
        battlefieldPermanent.counters += triggerCount;
  }
}
