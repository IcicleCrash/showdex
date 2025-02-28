import * as React from 'react';
import { AllPlayerKeys } from '@showdex/consts/battle';
import { type ShowdexCalcdexSettings } from '@showdex/interfaces/app';
import { type CalcdexPlayer, type CalcdexPlayerKey, type CalcdexPokemonPreset } from '@showdex/interfaces/calc';
import { type CalcdexBattleState, calcdexSlice, useDispatch } from '@showdex/redux/store';
import { cloneAllPokemon, clonePreset } from '@showdex/utils/battle';
import { calcPresetCalcdexId, guessServerLegacySpread, guessServerSpread } from '@showdex/utils/calc';
import { formatId, nonEmptyObject } from '@showdex/utils/core';
import { logger, runtimer } from '@showdex/utils/debug';
import { getGenlessFormat } from '@showdex/utils/dex';
import {
  type CalcdexBattlePresetsHookValue,
  applyPreset,
  detectCompletePreset,
  flattenAlts,
  // getPresetFormes,
  guessTeambuilderPreset,
  selectPokemonPresets,
  sortPresetsByFormat,
  useBattlePresets,
} from '@showdex/utils/presets';

const l = logger('@showdex/pages/Calcdex/CalcdexContext/useCalcdexPresets()');
const s = (local: string, via?: string): string => `${l.scope}:${local}${via ? ` via ${via}` : ''}`;

const playerAutoNonce = (
  player: CalcdexPlayer,
): string => (
  player?.pokemon
    ?.filter((p) => !p?.presetId)
    .map((p) => p?.calcdexId)
    .join(':')
);

/**
 * Basically does what `useBattlePresets()` does, but also auto-applies the first preset for any preset-less Pokemon
 * for every player in the provided `state`.
 *
 * * Remember when the auto-preset logic was in `syncBattle()`, `syncPokemon()` & `CalcdexPokeProvider`, not to mention the
 *   spaghetti of booleans in the latter to make sure React didn't infinitely re-render itself til the death of the universe?
 *   - Ya, me neither!
 *   - Anyway, all of the auto-preset logic, including applying Teambuilder & server-sourced sets, are all handled here.
 *
 * @since 1.1.7
 */
export const useCalcdexPresets = (
  state: CalcdexBattleState,
  settings: ShowdexCalcdexSettings,
): CalcdexBattlePresetsHookValue => {
  const dispatch = useDispatch();

  const presets = useBattlePresets({
    format: state?.format,
  });

  /* eslint-disable react-hooks/exhaustive-deps -- look at me, I'm the captain now */

  // keep track of whether we applied Team Sheets yet (whether initially or later)
  const appliedSheets = React.useRef(false);

  // auto-apply the first preset for every presetless Pokemon, if possible
  React.useEffect(() => {
    // used for debugging purposes only
    const scope = s('(AutoPreset)');
    const endTimer = runtimer(scope, l);

    const shouldAutoPreset = !!state?.battleId
      && !!state.format
      && presets.ready
      && AllPlayerKeys.some((key) => !!state?.[key]?.pokemon?.length);
      // && prevAutoNonce.current !== autoNonce;
      // && AllPlayerKeys.reduce((s, k) => s + (state?.[k]?.pokemon?.length ?? 0), 0) > 1;

    // note: presets.ready will be true if fetching is disabled by the user
    // (also doesn't guarantee that presets[]/usages[] are populated)
    if (!shouldAutoPreset) {
      return void endTimer('(not ready)');
    }

    const randoms = state.format.includes('random');
    const playersPayload: Partial<Record<CalcdexPlayerKey, Partial<CalcdexPlayer>>> = {};

    AllPlayerKeys.forEach((playerKey) => {
      const player = state[playerKey];

      if (!player?.pokemon?.length) {
        return;
      }

      const presetlessIndices = player.pokemon
        .map((p, i) => (p.presetId ? null : i))
        .filter((v) => typeof v === 'number');

      if (!presetlessIndices.length) {
        return;
      }

      const party = cloneAllPokemon(player.pokemon);

      // l.debug(
      //   '(Auto-Preset)', 'player', playerKey,
      //   '\n', 'processing indices', presetlessIndices,
      //   '\n', 'filtered', presetlessIndices.map((i) => party[i]),
      // );

      presetlessIndices.forEach((pokemonIndex) => {
        const pokemon = party[pokemonIndex];

        const pokemonPresets = selectPokemonPresets(
          presets.presets,
          pokemon,
          {
            format: state.format,
            source: 'smogon',
            select: 'any',
          },
        );

        const pokemonUsages = selectPokemonPresets(
          presets.usages,
          pokemon,
          {
            format: state.format,
            source: 'usage',
            select: 'any',
          },
        );

        let preset: CalcdexPokemonPreset;
        let [usage] = pokemonUsages;

        if (pokemon.serverSourced && nonEmptyObject(pokemon.serverStats)) {
          // was gunna use this elsewhere, so I separated it from the map() below, but never ended up needing it lol
          // (in other words, too lazy to move this back into the map() below)
          const mergeMatches = (
            p: CalcdexPokemonPreset,
          ) => {
            const abilityPool = [
              ...(p.altAbilities?.length ? flattenAlts(p.altAbilities) : []),
              p.ability,
            ];

            const itemPool = [
              ...(p.altItems?.length ? flattenAlts(p.altItems) : []),
              p.item,
            ];

            const movePool = [
              ...(p.altMoves?.length ? flattenAlts(p.altMoves) : []),
              ...p.moves,
            ];

            return {
              ...p,
              ability: abilityPool.includes(pokemon.ability) ? pokemon.ability : p.ability,
              item: itemPool.includes(pokemon.item) ? pokemon.item : p.item,
              moves: pokemon.serverMoves.every((m) => movePool.includes(m))
                ? [...pokemon.serverMoves]
                : p.moves,
            };
          };

          // Teambuilder presets should've been synced by syncBattle() & available in pokemon.presets[] by now
          // hmm, is this ambitious? idk
          preset = guessTeambuilderPreset(
            [
              ...(pokemon.presets?.length ? pokemon.presets : []),
              ...selectPokemonPresets(
                pokemonPresets,
                pokemon,
                {
                  format: state.format,
                  select: 'species',
                },
              ),
            ].map(mergeMatches),
            pokemon,
            state.format,
          );

          // if we found one, make a copy & mark it as 'server'-sourced w/ the Pokemon's actual properties
          if (preset?.calcdexId) {
            preset = clonePreset(preset);

            preset.playerName = player.name;
            preset.name = 'Yours';
            preset.source = 'server';
            preset.teraTypes = [pokemon.revealedTeraType].filter(Boolean);
            preset.ability = pokemon.ability;
            preset.item = pokemon.item;
            preset.moves = [...pokemon.serverMoves].filter(Boolean);
          }

          // "old reliable"
          // note: ServerPokemon info may be of the transformed Pokemon's moves, not the pre-transformed ones!!
          // (hence the `pokemon.transformedMoves` check)
          if (!preset?.calcdexId && !pokemon.transformedForme) {
            const guessedSpread = state.legacy
              ? guessServerLegacySpread(state.format, pokemon)
              : guessServerSpread(state.format, pokemon);

            if (nonEmptyObject(guessedSpread)) {
              preset = {
                calcdexId: null,
                id: null,
                source: 'server',
                playerName: player.name,
                name: 'Yours',
                gen: state.gen,
                format: getGenlessFormat(state.format),
                speciesForme: pokemon.speciesForme,
                level: pokemon.level,
                gender: pokemon.gender,
                teraTypes: [pokemon.revealedTeraType].filter(Boolean),
                ability: pokemon.ability,
                item: pokemon.item,
                moves: [...pokemon.serverMoves].filter(Boolean),
                ...guessedSpread,
              };

              preset.calcdexId = calcPresetCalcdexId(preset);
              preset.id = preset.calcdexId;
            }
          }

          const shouldAddServerPreset = !!preset?.calcdexId
            && !pokemon.presets.some((p) => p?.source === 'server');

          if (shouldAddServerPreset) {
            pokemon.presets.unshift(preset);
          }

          // if at this stage the Pokemon is transformed, ignore whatever preset we found beforehand
          if (pokemon.transformedForme && (!preset?.speciesForme || preset.speciesForme !== pokemon.transformedForme)) {
            // note: pokemonPresets[] (from selectPokemonPresets()) will also include presets of the transformedForme
            const transformedPresets = selectPokemonPresets(
              pokemonPresets,
              pokemon,
              {
                format: state.format,
                select: 'transformed',
              },
            ).sort(sortPresetsByFormat(state.format));

            preset = (
              !!pokemon.transformedMoves?.length
                && !!transformedPresets.length
                && transformedPresets.find((p) => {
                  const movePool = [
                    ...(p.altMoves?.length ? flattenAlts(p.altMoves) : []),
                    ...p.moves,
                  ];

                  return pokemon.transformedMoves.every((m) => movePool.includes(m));
                })
            ) || null;
          }
        }

        // apply any sheets, if available at this stage
        // (there's another effect hook below to handle sheets sent later)
        if (!preset?.calcdexId && state.sheets?.length) {
          [preset] = selectPokemonPresets(
            state.sheets,
            pokemon,
            {
              format: state.format,
              source: 'sheet',
              select: 'any',
              filter: (p) => !pokemon.transformedForme || formatId(p.playerName) === formatId(player.name),
            },
          );

          // but if it's an OTS (i.e., missing exact nature, EVs & IVs), don't bother applying it
          if (!detectCompletePreset(preset)) {
            preset = null;
          }
        }

        // attempt to find a preset within the current format
        if (!preset?.calcdexId && pokemonPresets.length) {
          [preset] = selectPokemonPresets(
            pokemonPresets,
            pokemon,
            {
              format: state.format,
              formatOnly: true,
              select: 'one',
            },
          );

          // "Showdown Usage" preset is only made available in non-Randoms formats
          const shouldApplyUsage = !randoms
            && !!usage?.calcdexId // making sure we have a "Showdown Usage" preset to begin with!
            // only apply if we don't have a preset atm, or if we do, the prioritizeUsageStats setting is enabled &
            // the current preset isn't server-sourced
            && (!preset?.calcdexId || (settings?.prioritizeUsageStats && preset.source !== 'server'));

          if (shouldApplyUsage) {
            preset = usage;
          }

          // if we still haven't found one, then try finding one from any format
          if (!preset?.calcdexId) {
            [preset] = selectPokemonPresets(
              pokemonPresets,
              pokemon,
              {
                format: state.format,
                select: 'one',
              },
            );
          }
        }

        // no smogon presets are available at this point, so apply the usage if we have it
        // (encountered many cases where Pokemon only have usage w/ no pokemonPresets[], particularly in Gen 9 National Dex)
        if (!preset?.calcdexId && usage?.calcdexId) {
          preset = usage;
        }

        // if no preset is applied, forcibly open the Pokemon's stats to alert the user
        if (!preset?.calcdexId) {
          pokemon.showGenetics = true;

          l.debug(
            'Failed to find a preset for', pokemon.speciesForme, 'of player', playerKey,
            '\n', 'pokemon', pokemon,
            '\n', 'preset', preset,
            '\n', 'presets', presets,
            '\n', 'usage', usage,
            '\n', 'state', state,
          );

          return;
        }

        // update (2023/01/06): may need to grab an updated usage for the preset we're trying to switch to
        // (normally only an issue in Gen 9 Randoms with their role system, which has multiple usage presets)
        if (randoms && pokemonUsages.length > 1) {
          const nameId = formatId(preset.name);
          const roleUsage = pokemonUsages.find((p) => nameId.includes(formatId(p.name)));

          if (roleUsage?.calcdexId) {
            usage = roleUsage;
          }
        }

        const presetPayload = applyPreset(state.format, pokemon, preset, usage);

        /**
         * @todo update when more than 4 moves are supported
         */
        if (!pokemon.serverSourced && pokemon.revealedMoves.length === 4) {
          delete presetPayload.moves;
        }

        party[pokemonIndex] = {
          ...pokemon,
          ...presetPayload,
        };
      });

      playersPayload[playerKey] = {
        pokemon: party,
      };
    });

    if (!nonEmptyObject(playersPayload)) {
      return void endTimer('(no change)');
    }

    dispatch(calcdexSlice.actions.updatePlayer({
      scope: l.scope,
      battleId: state.battleId,
      ...playersPayload,
    }));

    // prevAutoNonce.current = autoNonce;

    endTimer('(dispatched)');
  }, [
    playerAutoNonce(state?.p1),
    playerAutoNonce(state?.p2),
    playerAutoNonce(state?.p3),
    playerAutoNonce(state?.p4),
    presets.ready,
    state?.battleId,
    state?.format,
  ]);

  React.useEffect(() => {
    // used for debugging purposes only
    const scope = s('(Sheets)');
    const endTimer = runtimer(scope, l);

    const shouldApplySheets = !appliedSheets.current
      && !!state?.battleId
      && !!state.format
      && !!state.sheetsNonce
      && !!state.sheets?.length
      && AllPlayerKeys.some((key) => !!state[key]?.pokemon?.length);

    if (!shouldApplySheets) {
      return void endTimer(appliedSheets.current ? '(already applied)' : '(not ready)');
    }

    const playerPayload: Partial<Record<CalcdexPlayerKey, Partial<CalcdexPlayer>>> = {};

    AllPlayerKeys.forEach((playerKey) => {
      const player = state[playerKey];

      if (!player?.pokemon?.length) {
        return;
      }

      const party = cloneAllPokemon(player.pokemon);
      const nonServerIndices = party
        .map((p, i) => (p.serverSourced ? null : i))
        .filter((v) => typeof v === 'number');

      if (!nonServerIndices.length) {
        return;
      }

      let didUpdate = false;

      nonServerIndices.forEach((pokemonIndex) => {
        const pokemon = party[pokemonIndex];

        const [sheet] = selectPokemonPresets(
          state.sheets,
          pokemon,
          {
            format: state.format,
            source: 'sheet',
            select: 'one',
            filter: (p) => !!pokemon.transformedForme || formatId(p.playerName) === formatId(player.name),
          },
        );

        if (!sheet?.calcdexId) {
          return;
        }

        const pokemonUsages = selectPokemonPresets(
          presets.usages,
          pokemon,
          {
            format: state.format,
            source: 'usage',
            select: 'one',
          },
        );

        const usage = (
          pokemonUsages.length > 1
            && pokemonUsages.find((p) => {
              const pool = flattenAlts(p.altMoves);

              return sheet.moves.every((m) => pool.includes(m));
            })
        ) || pokemonUsages[0];

        party[pokemonIndex] = {
          ...pokemon,
          ...applyPreset(state.format, pokemon, sheet, usage),
        };

        didUpdate = true;
      });

      if (!didUpdate) {
        return;
      }

      playerPayload[playerKey] = {
        pokemon: party,
      };
    });

    if (!nonEmptyObject(playerPayload)) {
      return void endTimer('(no change)');
    }

    appliedSheets.current = true;

    dispatch(calcdexSlice.actions.updatePlayer({
      scope: l.scope,
      battleId: state.battleId,
      ...playerPayload,
    }));

    endTimer('(dispatched)');
  }, [
    state?.battleId,
    state?.format,
    state?.sheets?.length,
    state?.sheetsNonce,
    ...AllPlayerKeys.map((key) => state?.[key]?.pokemon?.length),
  ]);

  /* eslint-enable react-hooks/exhaustive-deps */

  return presets;
};
