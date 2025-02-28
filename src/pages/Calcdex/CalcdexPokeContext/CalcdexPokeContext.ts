import * as React from 'react';
import {
  type CalcdexPlayer,
  type CalcdexPlayerKey,
  type CalcdexPokemon,
  type CalcdexPokemonPreset,
} from '@showdex/interfaces/calc';
import { type CalcdexMatchupResult } from '@showdex/utils/calc';
import { type CalcdexContextValue } from '../CalcdexContext';

/**
 * Stored properties for a specific Pokemon that's consumable by any Context Consumer.
 *
 * * ~~Note that the `attackerSide` and `defenderSide` properties in `state.field`
 *   may be swapped depending on the passed-in `playerKey` when initializing the Context.~~
 *   - ~~Swapped properties only pertain to this Context only (i.e., Redux state will be left untouched).~~
 * * As part of the great `CalcdexContext` refactor in v1.1.7 (which is funny cause that itself was from a refactor),
 *   all the abstracted dispatchers have been moved to the `useCalcdexPokemonConsumer()` hook.
 *   - Preset-stuff has been moved to `CalcdexPokePresetContext`.
 *
 * @since 1.1.1
 */
export interface CalcdexPokeContextValue extends Omit<CalcdexContextValue, 'presets'> {
  playerKey: CalcdexPlayerKey;
  player: CalcdexPlayer;
  playerPokemon: CalcdexPokemon;
  opponent: CalcdexPlayer;
  opponentPokemon: CalcdexPokemon;
  // field: CalcdexBattleField;

  presetsLoading: boolean;
  presets: CalcdexPokemonPreset[];
  usages: CalcdexPokemonPreset[];
  usage: CalcdexPokemonPreset;

  // abilityOptions: CalcdexPokemonAbilityOption[];
  // itemOptions: CalcdexPokemonItemOption[];
  // moveOptions: CalcdexPokemonMoveOption[];
  // presetOptions: CalcdexPokemonPresetOption[];

  matchups: CalcdexMatchupResult[];

  // sortAbilitiesByUsage: CalcdexPokemonUsageAltSorter<AbilityName>;
  // sortItemsByUsage: CalcdexPokemonUsageAltSorter<ItemName>;
  // sortMovesByUsage: CalcdexPokemonUsageAltSorter<MoveName>;

  // applyPreset: (
  //   preset: CalcdexPokemonPreset | string,
  //   additionalMutations?: CalcdexPokemonMutation,
  //   scope?: string,
  // ) => void;

  // updatePokemon: (pokemon: CalcdexPokemonMutation, scope?: string) => void;
  // updateField: CalcdexContextConsumables['updateField'];
  // setActiveIndex: (index: number, scope?: string) => void;
  // setActiveIndices: (indices: number[], scope?: string) => void;
  // setSelectionIndex: (index: number, scope?: string) => void;
  // setAutoSelect: (autoSelect: boolean, scope?: string) => void;
}

/**
 * Context that contains consumables for a specific Pokemon.
 *
 * * ~~Typically initialized in `PokeCalc` for use in `PokeInfo`, `PokeMoves`, and `PokeStats`.~~
 *
 * @since 1.1.1
 */
export const CalcdexPokeContext = React.createContext<CalcdexPokeContextValue>({
  state: null,
  settings: null,

  playerKey: null,
  player: null,
  playerPokemon: null,
  opponent: null,
  opponentPokemon: null,

  presetsLoading: false,
  presets: [],
  usages: [],
  usage: null,

  matchups: [],
});
