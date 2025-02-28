import { type MoveName } from '@smogon/calc';
import { type DropdownOption } from '@showdex/components/form';
import { uarr } from '@showdex/consts/core';
import { type CalcdexPokemon, type CalcdexPokemonPreset } from '@showdex/interfaces/calc';
import { formatId } from '@showdex/utils/core';
import {
  detectGenFromFormat,
  getDexForFormat,
  getMaxMove,
  getZMove,
  getPokemonLearnset,
  legalLockedFormat,
} from '@showdex/utils/dex';
import { percentage } from '@showdex/utils/humanize';
import {
  detectUsageAlt,
  flattenAlt,
  flattenAlts,
  usageAltPercentFinder,
  usageAltPercentSorter,
} from '@showdex/utils/presets';

export type CalcdexPokemonMoveOption = DropdownOption<MoveName>;

/**
 * Builds the value for the `options` prop of the move `Dropdown` component in `PokeMoves`.
 *
 * @since 0.1.3
 */
export const buildMoveOptions = (
  format: string,
  pokemon: DeepPartial<CalcdexPokemon>,
  usage?: CalcdexPokemonPreset,
  showAll?: boolean,
): CalcdexPokemonMoveOption[] => {
  const options: CalcdexPokemonMoveOption[] = [];

  if (!pokemon?.speciesForme) {
    return options;
  }

  const dex = getDexForFormat(format);
  const gen = detectGenFromFormat(format);
  const showAllMoves = showAll || !legalLockedFormat(format);

  const ability = pokemon.dirtyAbility ?? pokemon.ability;
  const item = pokemon.dirtyItem ?? pokemon.item;

  const {
    serverSourced,
    speciesForme,
    transformedForme,
    moves,
    serverMoves,
    transformedMoves,
    altMoves,
    // moveState,
    revealedMoves,
    useZ,
    useMax,
  } = pokemon;

  // keep track of what moves we have so far to avoid duplicate options
  const filterMoves: MoveName[] = [];

  // prioritize using usage stats from the current set first,
  // then fallback to using the stats from the supplied `usage` set, if any
  const usageAltSource = detectUsageAlt(altMoves?.[0])
    ? altMoves
    : detectUsageAlt(usage?.altMoves?.[0])
      ? usage.altMoves
      : null;

  // create usage percent finder (to show them in any of the option groups)
  const findUsagePercent = usageAltPercentFinder(usageAltSource, true);
  const usageSorter = usageAltPercentSorter(findUsagePercent);

  // since we pass useZ into createSmogonMove(), we need to keep the original move name as the value
  // (but we'll show the corresponding Z move to the user, if any)
  // (also, non-Z moves may appear under the Z-PWR group in the dropdown, but oh well)
  if (useZ && !useMax && moves?.length) {
    const zMoves = moves
      .filter((n) => !!n && (getZMove(n, item) || n) !== n)
      .sort(usageSorter);

    options.push({
      label: 'Z',
      options: zMoves.map((name) => {
        const zMove = getZMove(name, item) || name;

        return {
          label: zMove,
          rightLabel: findUsagePercent(name),
          subLabel: zMove === name ? null : `${uarr} ${name}`,
          value: name,
        };
      }),
    });

    filterMoves.push(...zMoves);
  }

  // note: entirely possible to have both useZ and useMax enabled, such as in nationaldexag
  if (useMax && moves?.length) {
    const sortedMoves = [...moves].sort(usageSorter);

    options.push({
      label: 'Max',
      options: sortedMoves.map((name) => {
        const maxMove = getMaxMove(name, ability, speciesForme) || name;

        return {
          label: maxMove,
          rightLabel: findUsagePercent(name),
          subLabel: maxMove === name ? null : `${uarr} ${name}`,
          value: name,
        };
      }),
    });

    filterMoves.push(...sortedMoves);
  }

  if (serverSourced && serverMoves?.length) {
    const filteredServerMoves = serverMoves
      .filter((n) => !!n && !filterMoves.includes(n))
      .sort(usageSorter);

    options.push({
      label: transformedForme ? 'Pre-Transform' : 'Current',
      options: filteredServerMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });

    filterMoves.push(...filteredServerMoves);
  }

  if (transformedForme && transformedMoves?.length) {
    const filteredTransformedMoves = transformedMoves
      .filter((n) => !!n && !filterMoves.includes(n))
      .sort(usageSorter);

    options.unshift({
      label: 'Transformed',
      options: filteredTransformedMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });

    filterMoves.push(...filteredTransformedMoves);
  }

  if (revealedMoves?.length) {
    const filteredRevealedMoves = revealedMoves
      .filter((n) => !!n && !filterMoves.includes(n))
      .sort(usageSorter);

    options.push({
      label: 'Revealed',
      options: filteredRevealedMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });

    filterMoves.push(...filteredRevealedMoves);
  }

  // const hasUsageStats = !!altMoves?.length && altMoves
  //   .some((a) => Array.isArray(a) && typeof a[1] === 'number');

  const hasUsageStats = !!usageAltSource?.length;

  if (altMoves?.length) {
    const unsortedPoolMoves = altMoves
      .filter((a) => !!a && !filterMoves.includes(flattenAlt(a)));

    const poolMoves = hasUsageStats
      ? unsortedPoolMoves // should be sorted already (despite the name)
      : flattenAlts(unsortedPoolMoves).sort(usageSorter);

    options.push({
      label: 'Pool',
      options: poolMoves.map((alt) => ({
        label: flattenAlt(alt),
        rightLabel: Array.isArray(alt) ? percentage(alt[1], 2) : findUsagePercent(alt),
        value: flattenAlt(alt),
      })),
    });

    filterMoves.push(...flattenAlts(poolMoves));
  }

  const remainingUsageMoves = hasUsageStats
    ? usageAltSource.filter((a) => (
      !!a
        && !!(detectUsageAlt(a) || findUsagePercent(a))
        && !filterMoves.includes(flattenAlt(a))
    ))
    : null;

  if (remainingUsageMoves?.length) {
    options.push({
      label: 'Usage',
      options: remainingUsageMoves.map((alt) => ({
        label: flattenAlt(alt),
        rightLabel: Array.isArray(alt) ? percentage(alt[1], 2) : findUsagePercent(alt),
        value: flattenAlt(alt),
      })),
    });

    filterMoves.push(...flattenAlts(remainingUsageMoves));
  }

  const learnset = getPokemonLearnset(format, speciesForme, showAllMoves);

  if (transformedForme) {
    learnset.push(...getPokemonLearnset(format, transformedForme, showAllMoves));
  }

  if (learnset.length) {
    const learnsetMoves = Array.from(new Set(learnset))
      .filter((n) => !!n && !formatId(n).startsWith('hiddenpower') && !filterMoves.includes(n))
      .sort(usageSorter);

    options.push({
      label: 'Learnset',
      options: learnsetMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });

    filterMoves.push(...learnsetMoves);
  }

  // Hidden Power moves were introduced in gen 2
  const includeHiddenPower = gen > 1 && (
    showAllMoves
      || gen < 8 // Hidden Power natively exists in Gens 2-7
      || /nat(?:ional)?dex/i.test(formatId(format))
  );

  if (includeHiddenPower) {
    // regex filters out 'hiddenpowerfighting70', which is 'hiddenpowerfighting' (BP 60),
    // but with a BP of 70 lol (don't care about the BP here though, we just need the name)
    const unsortedHpMoves = Object.keys(BattleMovedex || {})
      .map((moveid) => dex.moves.get(moveid)?.name as MoveName)
      .filter((n) => !!n && /^hiddenpower[a-z]*$/i.test(formatId(n)) && !filterMoves.includes(n));

    // using a Set makes sure we have no duplicate entries in the array
    const hpMoves = Array.from(new Set(unsortedHpMoves)).sort(usageSorter);

    options.push({
      label: 'Hidden Power',
      options: hpMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });

    filterMoves.push(...hpMoves);
  }

  // show all possible moves if the format is not legal-locked or no learnset is available
  if (showAllMoves || !learnset.length) {
    const otherMoves = Object.keys(BattleMovedex || {})
      .map((moveid) => dex.moves.get(moveid)?.name as MoveName)
      .filter((n) => !!n && !/^(?:G-)?Max\s+|Hidden\s*Power/i.test(n) && !filterMoves.includes(n))
      .sort(usageSorter);

    // note: since we need to filter out HP moves, but keep the group last, this is the workaround.
    // splice() will insert at the provided start index, even if an element exists at that index.
    const hiddenPowerIndex = options.findIndex((o) => o.label === 'Hidden Power');
    const insertionIndex = hiddenPowerIndex > -1 ? hiddenPowerIndex : options.length;

    // make sure this comes before the Hidden Power moves
    options.splice(insertionIndex, 0, {
      label: 'All',
      options: otherMoves.map((name) => ({
        label: name,
        rightLabel: findUsagePercent(name),
        value: name,
      })),
    });
  }

  return options;
};
