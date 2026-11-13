/** A player that does nothing (draws a card each turn, never plays one). Used in a pod to check that a real deck
 *  against do-nothing players gives its goldfish numbers:  npm run pod -- gale goldfish goldfish goldfish --set pod_race=true */
import * as path from 'path';
import { ROOT } from '../../engine/cards';
import { Candidate, Config, KillSearcher } from '../../engine/game-types';
import { Game } from '../../engine/game';

class GoldfishGame extends Game<null> {
  buildKillSearchState(): null {
    return null;
  }
  killSearchStateKey(): string {
    return '';
  }
  killSearch(): KillSearcher<null> {
    throw new Error('the goldfish has no kill search');
  }
  candidates(): Candidate[] {
    return [];
  }
  override setup(): void {
    this.putCards(this.takeTopCardsOfLibrary(7), 'hand');
  }
  override takeTurn(): boolean {
    this.turn++;
    if (!(this.turn === 1 && this.onPlay) && this.library.length)
      this.putCard(this.takeTopCardsOfLibrary(1)[0], 'hand');
    return false;
  }
}

const CFG: Config = {
  opponents: 3,
  opp_life: 40,
  opp_library: 92,
  on_play_chance: 0.25,
  max_turn: 17,
};

export const deck = {
  name: 'goldfish',
  dir: path.join(ROOT, 'decks', 'goldfish'),
  defaultList: 'decklist.txt',
  config: CFG,
  Game: GoldfishGame,
};
