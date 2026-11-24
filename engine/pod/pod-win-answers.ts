/**
 * Answering a win declared in the middle of a turn, and countering a big spell (the cards are listed in
 * engine/game/answers.ts). Every function takes the PodTable it works on.
 */
import { Answer, PROTECTIONS } from '../game/answers';
import { CardDef } from '../cards/cards';
import { Game } from '../game/game';
import { PodTable } from './pod-table';

/** One answer an opponent used against a win attempt. */
interface UsedAnswer {
  owner: number; // the opponent who answered
  card: string;
  target: string;
  how: string;
  shield?: string; // set when the winner's Kira / Rainshaper / Stormtamer countered this answer
  answer: Answer;
  isAbility?: boolean; // a permanent's counter ability (Diversion Unit): not a spell, so it can't be countered
}

/**
 * A player declared a win in the middle of its turn: the others may answer it now with the mana they left untapped.
 * Returns true if it was stopped (the turn goes on).
 */
export function answerWin(table: PodTable, game: Game<unknown>): boolean {
  if (!table.answersEnabled) return false;
  const player = table.playerOf(game);
  const attempt = game.winAttempt();
  if (!attempt || (!attempt.spells.length && !attempt.perms.length))
    return false;
  table.stats.tried[player]++;
  table.sayHighlight(player, 'goes for the win');

  const protection = attempt.protect ? PROTECTIONS[attempt.protect] : undefined;
  if (protection?.stops === 'all-opponents') {
    sayProtection(table, player, attempt.protect!, 'no one can cast spells');
    return false;
  }
  const silencedOpponent =
    protection?.stops === 'one-opponent'
      ? opponentWithMostInteraction(table, player)
      : -1;
  if (protection)
    sayProtection(
      table,
      player,
      attempt.protect!,
      protection.stops === 'one-opponent'
        ? `${table.playerName(silencedOpponent)} can't cast spells`
        : "blue and black spells can't stop it",
    );
  const answersNeeded = attempt.backup + 1; // the winner may hold counterspells as backup
  const used: UsedAnswer[] = [];
  const answersStanding = () =>
    used.filter((usedAnswer) => !usedAnswer.shield).length;
  for (const opponent of table.opponentsOf[player]) {
    if (
      !table.isAlive[opponent] ||
      opponent === silencedOpponent ||
      answersStanding() >= answersNeeded
    )
      continue;
    for (const response of table.games[opponent].podRespond(
      attempt,
      answersNeeded - answersStanding(),
      game,
    ))
      used.push({ owner: opponent, ...response });
  }
  for (const answer of used) {
    table.stats.answers[answer.owner]++;
    if (answer.shield) {
      table.stats.shields[player]++;
      table.sayAs(
        answer.owner,
        `${answer.card} on ${answer.target} is countered by ${answer.shield}`,
        'answer',
        [answer.card, answer.target, answer.shield],
      );
    }
  }
  const unshielded = used.filter((usedAnswer) => !usedAnswer.shield);
  // the winner answers back with its own counterspells (a counter ability is not a spell: it can't be countered)
  const counterable = unshielded.filter((usedAnswer) => !usedAnswer.isAbility);
  const counteredBack = game.podBurnCounters(
    counterable.slice(0, attempt.backup).map((usedAnswer) => usedAnswer.card),
  );
  for (let index = 0; index < counteredBack.length; index++)
    table.sayAs(
      player,
      `counters ${table.playerName(counterable[index].owner)}'s ${counterable[index].card} with ${counteredBack[index]}`,
      'answer',
      [counterable[index].card, counteredBack[index]],
    );
  const countered = new Set(counterable.slice(0, counteredBack.length));
  const standing = unshielded.filter(
    (usedAnswer) => !countered.has(usedAnswer),
  );
  if (!standing.length) return false;

  table.stats.stopped[player]++;
  const stopper = standing[0];
  game.podLose(stopper.target, stopper.how, stopper.answer);
  game.podWinStopped();
  table.sayAs(
    stopper.owner,
    `stops the win: ${stopper.card} on ${stopper.target}. ${table.playerName(player)} plays on.`,
    'answer',
    [stopper.card, stopper.target],
  );
  return true;
}

function sayProtection(
  table: PodTable,
  player: number,
  protectionName: string,
  effect: string,
): void {
  table.sayAs(
    player,
    `casts ${protectionName} before the win: ${effect}`,
    'answer',
    [protectionName],
  );
}

/** The living opponent with the most interaction in hand (the one an Orim's Chant is aimed at). */
function opponentWithMostInteraction(table: PodTable, player: number): number {
  const interactionInHand = (opponent: number) =>
    table.games[opponent].hand.filter((card) =>
      table.games[opponent].answer(card),
    ).length;
  return table
    .livingOpponents(player)
    .reduce(
      (best, opponent) =>
        interactionInHand(opponent) > interactionInHand(best) ? opponent : best,
      table.livingOpponents(player)[0],
    );
}

/** Can `defender` counter this spell with a counterspell in hand and mana for it? */
function counterspellsAgainst(
  defender: Game<unknown>,
  spell: CardDef,
): CardDef[] {
  return defender.hand.filter((card) => {
    const answer = defender.answer(card);
    return (
      answer?.kind === 'counter' &&
      Game.spellOk(answer, spell) &&
      defender.canPay(defender.answerCost(card), true)
    );
  });
}

/** A player cast this spell (paid, on the stack): does an opponent counter it? */
export function counterSpell(
  table: PodTable,
  game: Game<unknown>,
  spell: CardDef,
): boolean {
  if (!table.answersEnabled) return false;
  const caster = table.playerOf(game);
  const weight = game.podWeight(spell);
  for (const opponent of table.opponentsOf[caster]) {
    if (!table.isAlive[opponent]) continue;
    const opponentGame = table.games[opponent];
    const possibleCounters = counterspellsAgainst(opponentGame, spell);
    const boardCounters = opponentGame.boardCountersAgainst(spell);
    if (!possibleCounters.length && !boardCounters.length) continue;
    const casterIsBiggestThreat = table
      .livingOpponents(opponent)
      .every(
        (other) =>
          other === caster || table.threats[other] <= table.threats[caster],
      );
    const counterspellsHeld =
      opponentGame.hand.filter(
        (card) => opponentGame.answer(card)?.kind === 'counter',
      ).length + boardCounters.length;
    if (
      !opponentGame.podWantsToCounter(
        spell,
        weight,
        casterIsBiggestThreat,
        counterspellsHeld,
        table.settings,
      )
    )
      continue;

    if (!possibleCounters.length) {
      // a permanent's counter ability (Diversion Unit, Soratami Savant): not a spell, so it can't be countered back
      const source = boardCounters[0];
      if (!opponentGame.useBoardCounter(source)) continue;
      table.stats.answers[opponent]++;
      table.stats.countered[caster]++;
      table.sayAs(
        opponent,
        `counters ${spell.name} with ${source.card.name}'s ability`,
        'answer',
        [spell.name, source.card.name],
      );
      return true;
    }
    const counter = possibleCounters[0];
    opponentGame.podCast(counter);
    table.stats.answers[opponent]++;
    const backupCounter = counterspellsAgainst(game, counter)[0];
    if (backupCounter) {
      game.podCast(backupCounter);
      table.sayAs(
        opponent,
        `${counter.name} on ${spell.name}; ${table.playerName(caster)} counters it with ${backupCounter.name}`,
        'answer',
        [counter.name, spell.name, backupCounter.name],
      );
      return false;
    }
    table.stats.countered[caster]++;
    table.sayAs(
      opponent,
      `counters ${spell.name} with ${counter.name}`,
      'answer',
      [spell.name, counter.name],
    );
    return true;
  }
  return false;
}

/** A deck found a kill without counter backup: should it go for it now? (the deck's pod policy) */
export function shouldGoForKill(table: PodTable, game: Game<unknown>): boolean {
  const player = table.playerOf(game);
  if (table.policyOf(player) !== 'window') return true;
  const noOneCanAnswer = table
    .livingOpponents(player)
    .every(
      (opponent) =>
        table.games[opponent].openMana() <= table.settings.windowMana ||
        table.games[opponent].hand.length === 0,
    );
  if (!noOneCanAnswer) game.mode = 'protected'; // keep the kill intact for the rest of the turn and look for backup
  return noOneCanAnswer;
}
