/**
 * `npm run cards`            shows when the Scryfall data was downloaded and its latest set
 * `npm run cards -- update`  downloads the Scryfall bulk data (the only command that uses the network)
 * `npm run cards -- refresh` updates the cards in data/cards.json from the downloaded data
 * `npm run cards -- images`  downloads the card images that are missing (to data/scryfall/images/)
 */
import {
  BulkInfo,
  downloadBulkData,
  readBulkInfo,
  refreshCards,
  reportOutdatedCards,
} from '../engine/scryfall';
import { cardsWithoutImage, updateImages } from '../engine/card-images';
import { Args } from './args';

function printBulkInfo(info: BulkInfo): void {
  console.log(
    `Scryfall data downloaded on ${info.downloadedOn} (${info.cardCount} cards).`,
  );
  console.log(
    `Latest set out: ${info.latestReleasedSet.name} (${info.latestReleasedSet.code}, ${info.latestReleasedSet.releasedAt}).`,
  );
  if (info.latestSet.code !== info.latestReleasedSet.code)
    console.log(
      `Latest set in the data: ${info.latestSet.name} (${info.latestSet.code}, ${info.latestSet.releasedAt}), not out yet.`,
    );
}

async function downloadMissingImages(): Promise<void> {
  const missingCount = cardsWithoutImage().length;
  console.log(`${missingCount} card images to download.`);
  if (!missingCount) return;
  const result = await updateImages((progress) => {
    if (progress.imagesDone % 25 === 0 && progress.imagesDone > 0)
      console.log(`  ${progress.imagesDone} / ${progress.imagesTotal}`);
  });
  console.log(
    `Done: ${result.imagesTotal - result.failedCards.length} downloaded.`,
  );
  if (result.failedCards.length)
    console.log(`Failed (run it again): ${result.failedCards.join(', ')}`);
}

export async function runCardsCommand(args: Args): Promise<void> {
  const subcommand = args.lists[0];
  if (subcommand === 'update') {
    printBulkInfo(await downloadBulkData());
    await reportOutdatedCards();
  } else if (subcommand === 'refresh') await refreshCards();
  else if (subcommand === 'images') await downloadMissingImages();
  else if (subcommand === undefined) {
    const info = readBulkInfo();
    if (info) printBulkInfo(info);
    else console.log('No Scryfall data downloaded yet.');
    console.log(
      'npm run cards -- update   download the Scryfall data (run it when new sets come out)\n' +
        'npm run cards -- refresh  update the cards in data/cards.json from it\n' +
        'npm run cards -- images   download the card images that are missing',
    );
  } else throw new Error(`cards: unknown command '${subcommand}'`);
}
