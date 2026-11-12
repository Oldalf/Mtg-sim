/** A player that does nothing (draws a card each turn, never plays one). Used in a pod to check that a real deck
 *  against do-nothing players gives its goldfish numbers:  npm run pod -- gale goldfish goldfish goldfish --set pod_race=true */
import * as path from 'path';
import { ROOT } from '../../engine/cards';
import { Cand, Config, KillSearcher } from '../../engine/game-types';
import { Game } from '../../engine/game';

class GoldfishGame extends Game<null> {
  light(): null {
    return null;
  }
  lightKey(): string {
    return '';
  }
  killSearch(): KillSearcher<null> {
    throw new Error('the goldfish has no kill search');
  }
  candidates(): Cand[] {
    return [];
  }
  override setup(): void {
    this.hand = this.library.splice(0, 7);
  }
  override takeTurn(): boolean {
    this.turn++;
    if (!(this.turn === 1 && this.onPlay) && this.library.length)
      this.hand.push(this.library.shift()!);
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
  cfg: CFG,
  Game: GoldfishGame,
};
