import type { DeckSummary } from '../../../../../api-types';

/** What the forms show next to a setting: its meaning (the tooltip) and which decks it applies to (the hint). */
export interface SettingHelp {
  description: string;
  appliesTo: string;
}

/**
 * The help of a setting in the Simulate form, where one deck plays. The hint says whether it is an engine setting
 * (the same in every deck) or this deck's own, so a reader knows if it is a general rule.
 */
export function goldfishSettingHelp(
  deck: DeckSummary,
  settingName: string,
): SettingHelp {
  const setting = deck.settings.find((each) => each.name === settingName);
  return {
    description: setting?.description ?? '',
    appliesTo: setting?.isDeckOwn ? `${deck.name} only` : 'same in every deck',
  };
}

/**
 * The help of a setting in the Pod form, where one value goes to every deck in the pod that has the setting. The
 * hint names those decks. When their descriptions or defaults differ (the same name meaning different things),
 * the tooltip gives each deck's own.
 */
export function podSettingHelp(
  decksPlaying: DeckSummary[],
  settingName: string,
): SettingHelp {
  const decksOnce = [...new Set(decksPlaying)];
  const withIt = decksOnce.flatMap((deck) => {
    const setting = deck.settings.find((each) => each.name === settingName);
    return setting ? [{ deck: deck.name, setting }] : [];
  });
  const isSameEverywhere = withIt.every(
    ({ setting }) =>
      setting.description === withIt[0].setting.description &&
      setting.defaultValue === withIt[0].setting.defaultValue,
  );
  return {
    description: isSameEverywhere
      ? (withIt[0]?.setting.description ?? '')
      : withIt
          .map(
            ({ deck, setting }) =>
              `${deck} (default ${setting.defaultValue}): ${setting.description}`,
          )
          .join('\n'),
    appliesTo:
      withIt.length === decksOnce.length
        ? 'all decks in the pod'
        : `${withIt.map(({ deck }) => deck).join(', ')} only`,
  };
}
