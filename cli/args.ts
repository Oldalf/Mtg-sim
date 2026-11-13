/** The command line: every option `npm run sim` understands (see the top of sim.ts and README.md for what they do). */
import { defaultWorkers } from '../engine/runner';

export interface Args {
  deck: string; // a deck name, "pod" or "cards"
  lists: string[]; // decklist files (for the pod: the decks, each as "deck" or "deck:list")
  games: number; // -n
  gamesGiven: boolean; // was -n on the command line? (the pod has its own default)
  workers: number; // -w: worker threads
  workersGiven: boolean;
  eco: boolean; // power-save mode
  dutyPercent: number | null; // --duty: how much of the time the workers are busy (eco mode)
  turns: number | null; // --turns: turns to play
  settings: string[]; // --set key=value, as typed
  trace: number; // --trace: how many games to print play by play
  seed: number; // --seed: the first seed
  mode: 'any' | 'protected';
  rank: boolean; // --rank
  cutCards: string[] | null; // --cut: the cards to cut
  cutReplacement: string; // --replace: what a cut card is replaced with
  analyzeLog: string | null; // --analyze: a game log to check for missed kills
  analyzeList: string | null; // -d: the decklist the logged game was played with
  analyzeRuns: number; // --ai: how many games the analyzer plays from each point
  analyzeBudget: number; // --budget: kill-search effort of the analyzer
  test: boolean; // --test
  diag: boolean; // --diag
  hands: boolean; // --hands
  regress: string | null; // --regress record | check
}

export function parseArgs(argv: string[], deckNames: string[]): Args {
  const args: Args = {
    deck: '',
    lists: [],
    games: 5000,
    gamesGiven: false,
    workers: defaultWorkers(),
    workersGiven: false,
    eco: false,
    dutyPercent: null,
    turns: null,
    settings: [],
    trace: 0,
    seed: 1,
    mode: 'any',
    rank: false,
    cutCards: null,
    cutReplacement: 'Island',
    analyzeLog: null,
    analyzeList: null,
    analyzeRuns: 200,
    analyzeBudget: 20000,
    test: false,
    diag: false,
    hands: false,
    regress: null,
  };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    const nextValue = () => {
      if (index + 1 >= argv.length) throw new Error(`${option} needs a value`);
      return argv[++index];
    };
    const nextNumber = () => parseInt(nextValue(), 10);
    if (option === '-n' || option === '--games') {
      args.games = nextNumber();
      args.gamesGiven = true;
    } else if (option === '-w' || option === '--workers') {
      args.workers = nextNumber();
      args.workersGiven = true;
    } else if (option === '--eco') args.eco = true;
    else if (option === '--duty') args.dutyPercent = nextNumber();
    else if (option === '--turns') args.turns = nextNumber();
    else if (option === '--set') args.settings.push(nextValue());
    else if (option === '--trace') args.trace = nextNumber();
    else if (option === '--seed') args.seed = nextNumber();
    else if (option === '--mode')
      args.mode = nextValue() as 'any' | 'protected';
    else if (option === '--rank') args.rank = true;
    else if (option === '--cut') {
      args.cutCards = [];
      while (index + 1 < argv.length && !argv[index + 1].startsWith('-'))
        args.cutCards.push(argv[++index]);
    } else if (option === '--replace') args.cutReplacement = nextValue();
    else if (option === '--analyze') args.analyzeLog = nextValue();
    else if (option === '-d' || option === '--list')
      args.analyzeList = nextValue();
    else if (option === '--ai') args.analyzeRuns = nextNumber();
    else if (option === '--budget') args.analyzeBudget = nextNumber();
    else if (option === '--test') args.test = true;
    else if (option === '--diag') args.diag = true;
    else if (option === '--hands') args.hands = true;
    else if (option === '--regress') args.regress = nextValue();
    else if (option === '-h' || option === '--help') {
      console.log(
        'usage: npm run sim -- <deck> [lists...] [options]   (see the top of sim.ts / README.md)',
      );
      process.exit(0);
    } else if (option.startsWith('-'))
      throw new Error(`unknown option ${option}`);
    else positional.push(option);
  }
  if (!positional.length)
    throw new Error(`which deck? one of: ${deckNames.join(', ')}`);
  args.deck = positional[0];
  args.lists = positional.slice(1);
  return args;
}

/** Is power-save mode asked for (--eco, or --duty on its own)? */
export function wantsEcoMode(args: Args): boolean {
  return args.eco || args.dutyPercent !== null;
}
