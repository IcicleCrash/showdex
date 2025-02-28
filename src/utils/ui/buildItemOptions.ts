import { type ItemName } from '@smogon/calc';
import { type DropdownOption } from '@showdex/components/form';
import { eacute } from '@showdex/consts/core';
import { type CalcdexPokemon, type CalcdexPokemonPreset, type CalcdexPokemonUsageAlt } from '@showdex/interfaces/calc';
import { formatId } from '@showdex/utils/core';
import { guessTableFormatKey, legalLockedFormat } from '@showdex/utils/dex';
import { percentage } from '@showdex/utils/humanize';
import {
  detectUsageAlt,
  flattenAlt,
  flattenAlts,
  usageAltPercentFinder,
  usageAltPercentSorter,
} from '@showdex/utils/presets';

export type CalcdexPokemonItemOption = DropdownOption<ItemName>;

/**
 * Local helper function that finds the indices after the `headerName` and before the next header.
 *
 * * `headerName` is a search string, so you don't need to exactly match the name of the header.
 * * `startIndex` is the index of the item **after** the header index, which should be used inclusively.
 * * `endIndex` is the index of the next header or the last index, which should be used inclusively.
 *   - When using `slice()`, since its `end` argument is exclusive, make sure you add `1` to the `endIndex`.
 *
 * @since 1.0.2
 */
const findItemGroupIndices = (
  items: Showdown.BattleTeambuilderGenTable['items'],
  headerName: string,
  startsWith?: boolean,
): [startIndex: number, endIndex: number] => {
  if (!items?.length || !headerName) {
    return [-1, -1];
  }

  // headerName is a search string, so format it as such
  const headerId = formatId(headerName);

  const determinedStartIndex = items
    .findIndex((value) => Array.isArray(value) && formatId(value[1])?.[startsWith ? 'startsWith' : 'includes'](headerId));

  const startIndex = determinedStartIndex > -1
    ? determinedStartIndex + 1
    : determinedStartIndex;

  const reachedEnd = startIndex > items.length - 1;
  const determinedEndIndex = startIndex > -1
    ? reachedEnd
      ? items.length - 1 - startIndex
      : items.slice(startIndex).findIndex((value) => Array.isArray(value) && value[0] === 'header')
    : -1;

  // if we've found the last header, make sure to return the last index since determinedEndIndex will be -1
  // as there is no header after the last header (duh)
  const endIndex = startIndex > -1 && !reachedEnd && determinedEndIndex < 0
    ? items.length - 1
    : determinedEndIndex + startIndex;

  return [startIndex, endIndex];
};

/**
 * Builds the value for the `options` prop of the items `Dropdown` component in `PokeInfo`.
 *
 * @since 1.0.2
 */
export const buildItemOptions = (
  format: string,
  pokemon: DeepPartial<CalcdexPokemon>,
  usage?: CalcdexPokemonPreset,
  showAll?: boolean,
): CalcdexPokemonItemOption[] => {
  const options: CalcdexPokemonItemOption[] = [];

  if (!pokemon?.speciesForme) {
    return options;
  }

  const {
    altItems,
  } = pokemon;

  // keep track of what moves we have so far to avoid duplicate options
  const filterItems: ItemName[] = [];

  // prioritize using usage stats from the current set first,
  // then fallback to using the stats from the supplied `usage` set, if any
  const usageAltSource = detectUsageAlt(altItems?.[0])
    ? altItems
    : detectUsageAlt(usage?.altItems?.[0])
      ? usage.altItems
      : null;

  // create usage percent finder (to show them in any of the option groups)
  const findUsagePercent = usageAltPercentFinder(usageAltSource, true);
  const usageSorter = usageAltPercentSorter(findUsagePercent);

  if (altItems?.length) {
    const hasUsageStats = altItems
      .some((a) => Array.isArray(a) && typeof a[1] === 'number');

    const poolItems = hasUsageStats
      ? altItems // should be sorted already (despite the name)
      : flattenAlts(altItems).sort(usageSorter);

    options.push({
      label: 'Pool',
      options: poolItems.map((alt) => ({
        label: flattenAlt(alt),
        rightLabel: Array.isArray(alt) ? percentage(alt[1], 2) : findUsagePercent(alt),
        value: flattenAlt(alt),
      })),
    });

    filterItems.push(...flattenAlts(poolItems));
  }

  if (detectUsageAlt(usageAltSource?.[0])) {
    const usageItems = (usageAltSource as CalcdexPokemonUsageAlt<ItemName>[])
      .filter((n) => !!n?.[0] && !filterItems.includes(n[0]));

    if (usageItems.length) {
      options.push({
        label: 'Usage',
        options: usageItems.map((alt) => ({
          label: flattenAlt(alt),
          rightLabel: percentage(alt[1], 2),
          value: flattenAlt(alt),
        })),
      });

      filterItems.push(...flattenAlts(usageItems));
    }
  }

  if (typeof BattleTeambuilderTable === 'undefined' || !format || !BattleTeambuilderTable.items?.length) {
    const allItems = Object.values(BattleItems || {})
      .map((item) => item?.name as ItemName)
      .filter((n) => !!n && !filterItems.includes(n))
      .sort(usageSorter);

    if (allItems.length) {
      options.push({
        label: 'All',
        options: allItems.map((name) => ({
          label: name,
          rightLabel: findUsagePercent(name),
          value: name,
        })),
      });
    }

    return options;
  }

  const formatKey = guessTableFormatKey(format);

  // const { items } = BattleTeambuilderTable;
  const items = !!format && formatKey in BattleTeambuilderTable && BattleTeambuilderTable[formatKey]?.items?.length
    ? BattleTeambuilderTable[formatKey].items
    : BattleTeambuilderTable.items;

  // use the BattleTeambuilderTable to group items by:
  // Popular, Items, Pokemon-Specific, Usually Useless & Useless
  const [popularStartIndex, popularEndIndex] = findItemGroupIndices(items, 'popular', true);
  const [itemsStartIndex, itemsEndIndex] = findItemGroupIndices(items, 'items', true);
  const [specificStartIndex, specificEndIndex] = findItemGroupIndices(items, 'specific');
  const [usuallyUselessStartIndex, usuallyUselessEndIndex] = findItemGroupIndices(items, 'usuallyuseless', true);
  const [uselessStartIndex, uselessEndIndex] = findItemGroupIndices(items, 'useless', true);

  if (popularStartIndex > -1 && popularEndIndex > -1) {
    const popularItems = items
      .slice(popularStartIndex, popularEndIndex + 1)
      .map((itemId: string) => Dex.items.get(itemId)?.name as ItemName)
      .filter((n) => !!n && !filterItems.includes(n))
      .sort(usageSorter);

    if (popularItems.length) {
      options.push({
        label: 'Popular',
        options: popularItems.map((name) => ({
          label: name,
          rightLabel: findUsagePercent(name),
          value: name,
        })),
      });

      filterItems.push(...popularItems);
    }
  }

  if (itemsStartIndex > -1 && itemsEndIndex > -1) {
    const itemsItems = items // 10/10 name lmao
      .slice(itemsStartIndex, itemsEndIndex + 1)
      .map((itemId: string) => Dex.items.get(itemId)?.name as ItemName)
      .filter((n) => !!n && !filterItems.includes(n))
      .sort(usageSorter);

    if (itemsItems.length) {
      options.push({
        label: 'Items',
        options: itemsItems.map((name) => ({
          label: name,
          rightLabel: findUsagePercent(name),
          value: name,
        })),
      });

      filterItems.push(...itemsItems);
    }
  }

  if (specificStartIndex > -1 && specificEndIndex > -1) {
    const specificItems = items
      .slice(specificStartIndex, specificEndIndex + 1)
      .map((itemId: string) => Dex.items.get(itemId)?.name as ItemName)
      .filter((n) => !!n && !filterItems.includes(n))
      .sort(usageSorter);

    if (specificItems.length) {
      options.push({
        label: `Pok${eacute}mon-Specific`,
        options: specificItems.map((name) => ({
          label: name,
          rightLabel: findUsagePercent(name),
          value: name,
        })),
      });

      filterItems.push(...specificItems);
    }
  }

  if (usuallyUselessStartIndex > -1 && usuallyUselessEndIndex > -1) {
    const usuallyUselessItems = items
      .slice(usuallyUselessStartIndex, usuallyUselessEndIndex + 1)
      .map((itemId: string) => Dex.items.get(itemId)?.name as ItemName)
      .filter((n) => !!n && !filterItems.includes(n))
      .sort(usageSorter);

    if (usuallyUselessItems.length) {
      options.push({
        label: 'Usually Useless',
        options: usuallyUselessItems.map((name) => ({
          label: name,
          rightLabel: findUsagePercent(name),
          value: name,
        })),
      });

      filterItems.push(...usuallyUselessItems);
    }
  }

  if (uselessStartIndex > -1 && uselessEndIndex > -1) {
    const uselessItems = items
      .slice(uselessStartIndex, uselessEndIndex + 1)
      .map((itemId: string) => Dex.items.get(itemId)?.name as ItemName)
      .filter((n) => !!n && !filterItems.includes(n))
      .sort(usageSorter);

    if (uselessItems.length) {
      options.push({
        label: 'Useless',
        options: uselessItems.map((name) => ({
          label: name,
          rightLabel: findUsagePercent(name),
          value: name,
        })),
      });

      filterItems.push(...uselessItems);
    }
  }

  if (showAll || !legalLockedFormat(format)) {
    const otherItems = Object.values(BattleItems || {})
      .map((item) => item?.name as ItemName)
      .filter((n) => !!n && !filterItems.includes(n))
      .sort(usageSorter);

    if (otherItems.length) {
      options.push({
        label: 'All',
        options: otherItems.map((name) => ({
          label: name,
          rightLabel: findUsagePercent(name),
          value: name,
        })),
      });
    }
  }

  return options;
};
