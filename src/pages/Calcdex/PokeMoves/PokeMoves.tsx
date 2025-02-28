import * as React from 'react';
import cx from 'classnames';
import { type MoveName } from '@smogon/calc';
import {
  Dropdown,
  MoveCategoryField,
  PokeTypeField,
  ValueField,
} from '@showdex/components/form';
import { TableGrid, TableGridItem } from '@showdex/components/layout';
import {
  type BadgeInstance,
  Badge,
  Button,
  ToggleButton,
  Tooltip,
} from '@showdex/components/ui';
import { PokemonToggleMoves } from '@showdex/consts/dex';
import { type CalcdexMoveOverride, type CalcdexPokemon } from '@showdex/interfaces/calc';
import { useColorScheme } from '@showdex/redux/store';
import { detectToggledMove } from '@showdex/utils/battle';
import { getMoveOverrideDefaults, hasMoveOverrides } from '@showdex/utils/calc';
import {
  clamp,
  formatId,
  nonEmptyObject,
  upsizeArray,
  writeClipboardText,
} from '@showdex/utils/core';
import { legalLockedFormat } from '@showdex/utils/dex';
import { type ElementSizeLabel, useRandomUuid } from '@showdex/utils/hooks';
import { buildMoveOptions, formatDamageAmounts } from '@showdex/utils/ui';
import { useCalcdexPokeContext } from '../CalcdexPokeContext';
import { PokeMoveOptionTooltip } from './PokeMoveOptionTooltip';
import styles from './PokeMoves.module.scss';

export interface PokeMovesProps {
  className?: string;
  style?: React.CSSProperties;
  containerSize?: ElementSizeLabel;
}

const baseScope = '@showdex/pages/Calcdex/PokeMoves';

export const PokeMoves = ({
  className,
  style,
  containerSize,
}: PokeMovesProps): JSX.Element => {
  const {
    state,
    settings,
    player,
    playerPokemon: pokemon,
    opponentPokemon,
    // moveOptions,
    usage,
    matchups,
    updatePokemon,
  } = useCalcdexPokeContext();

  const {
    active: battleActive,
    gen,
    format,
    rules,
  } = state;

  const colorScheme = useColorScheme();
  const randomUuid = useRandomUuid();
  const copiedRefs = React.useRef<BadgeInstance[]>([]);

  const pokemonKey = pokemon?.calcdexId || pokemon?.name || randomUuid || '???';
  const friendlyPokemonName = pokemon?.speciesForme || pokemon?.name || pokemonKey;

  const moveOptions = React.useMemo(() => buildMoveOptions(
    format,
    pokemon,
    usage,
    settings?.showAllOptions,
  ), [
    format,
    pokemon,
    settings?.showAllOptions,
    usage,
  ]);

  const nationalDexFormat = !!format && [
    'nationaldex',
    'natdex',
  ].some((f) => format.includes(f));

  const showTeraToggle = !!pokemon?.speciesForme
    && !rules?.tera
    && gen > 8;

  const disableTeraToggle = !pokemon?.speciesForme
    || !pokemon.teraType
    || pokemon.teraType === '???'
    || (settings?.lockUsedTera && player?.usedTera && battleActive);

  const showZToggle = !!pokemon?.speciesForme
    && (gen === 7 || nationalDexFormat);

  const showMaxToggle = !!pokemon?.speciesForme
    && !rules?.dynamax
    && gen < 9
    && (nationalDexFormat || (gen === 8 && !format?.includes('bdsp')));

  const disableMaxToggle = !pokemon?.speciesForme;

  const showEditButton = !!pokemon?.speciesForme && (
    settings?.showMoveEditor === 'always'
      || (settings?.showMoveEditor === 'meta' && !legalLockedFormat(format))
  );

  // nice one me 10/10
  const showFaintCounter = !!pokemon?.speciesForme && (
    formatId(pokemon.dirtyAbility || pokemon.ability) === 'supremeoverlord'
      || pokemon.moves?.includes('Last Respects' as MoveName)
  );

  const handleMoveToggle = (name: MoveName) => {
    if (!name || !PokemonToggleMoves.includes(name)) {
      return;
    }

    const moveId = formatId(name);
    const toggled = detectToggledMove(pokemon, name);

    const payload: Partial<CalcdexPokemon> = {};

    switch (moveId) {
      case 'powertrick': {
        payload.volatiles = {
          ...pokemon?.volatiles,
        };

        if (toggled) {
          delete payload.volatiles.powertrick;
        } else {
          payload.volatiles.powertrick = ['powertrick'];
        }

        break;
      }

      default: {
        break;
      }
    }

    if (!nonEmptyObject(payload)) {
      return;
    }

    updatePokemon(payload, `${baseScope}:handleMoveToggle()`);
  };

  const handleMoveChange = (name: MoveName, index: number) => {
    const moves = upsizeArray(
      [...(pokemon?.moves || [])],
      matchups?.length,
      null,
    );

    if (!Array.isArray(moves) || (moves?.[index] && moves[index] === name)) {
      return;
    }

    // when move is cleared, `name` will be null/undefined, so coalesce into an empty string
    const moveName = (name?.replace('*', '') ?? '') as MoveName;

    // update (2023/07/27): if moveName already exists at a different index in moves[], just swap them
    // so that you don't have 2 Hydro Pumps at different indices, for example lol
    // e.g., moves = ['Hydro Pump', 'Ice Beam', 'U-Turn', 'Grass Knot'], name = 'Hydro Pump', index = 1
    // before this change: ['Hydro Pump', 'Hydro Pump', 'U-Turn', 'Grass Knot']
    // after: ['Ice Beam', 'Hydro Pump', 'U-Turn', 'Grass Knot']
    // also, the `!!m` check is to allow users to yeet all the moves if they wish
    // (otherwise, they'd only be able to yeet one move!)
    const existingMoveIndex = moves.findIndex((m) => !!m && m === moveName);

    if (existingMoveIndex > -1) {
      // this is the move that's currently parked at the user-requested `index`
      // e.g., 'Ice Beam' (from the example above)
      const moveAtIndex = moves[index];

      // e.g., existingMoveIndex = 0, moves = ['Ice Beam', 'Ice Beam', 'U-Turn', 'Grass Knot']
      moves[existingMoveIndex] = moveAtIndex;
    }

    // set the move at the index as normal
    // e.g., moves = ['Ice Beam', 'Hydro Pump', 'U-Turn', 'Grass Knot']
    moves[index] = moveName;

    updatePokemon({
      moves,
    }, `${baseScope}:handleMoveChange()`);
  };

  // copies the matchup result description to the user's clipboard when the damage range is clicked
  const handleDamagePress = (index: number, description: string) => {
    if (typeof navigator === 'undefined' || typeof index !== 'number' || index < 0 || !description) {
      return;
    }

    // wrapped in an unawaited async in order to handle any thrown errors
    void (async () => {
      try {
        // await navigator.clipboard.writeText(description);
        await writeClipboardText(description);

        copiedRefs.current?.[index]?.show();
      } catch (error) {
        // no-op when an error is thrown while writing to the user's clipboard
        (() => void 0)();
      }
    })();
  };

  return (
    <TableGrid
      className={cx(
        styles.container,
        containerSize === 'xs' && styles.verySmol,
        // ['md', 'lg', 'xl'].includes(containerSize) && styles.veryThicc,
        !!colorScheme && styles[colorScheme],
        className,
      )}
      style={style}
    >
      {/* table headers */}
      <TableGridItem
        className={cx(styles.header, styles.movesHeader)}
        align="left"
        header
      >
        <div className={styles.headerTitle}>
          Moves
        </div>

        {
          showTeraToggle &&
          <ToggleButton
            className={cx(styles.toggleButton, styles.ultButton)}
            labelClassName={cx(
              styles.teraButtonLabel,
              (battleActive && !player?.usedTera && !pokemon?.terastallized) && styles.available,
            )}
            label="Tera"
            tooltip={(
              <div className={styles.descTooltip}>
                {
                  settings?.showUiTooltips &&
                  <div style={battleActive ? { marginBottom: 2 } : undefined}>
                    {pokemon?.terastallized ? 'Revert' : 'Terastallize'} to{' '}
                    {(pokemon?.terastallized ? pokemon?.types?.join('/') : pokemon?.teraType) || '???'}
                  </div>
                }

                {
                  battleActive &&
                  <div
                    className={cx(
                      styles.ultUsage,
                      !player?.usedTera && styles.available,
                      player?.usedTera && styles.consumed,
                    )}
                  >
                    Tera <strong>{player?.usedTera ? 'Used' : 'Available'}</strong>
                  </div>
                }
              </div>
            )}
            tooltipDisabled={!settings?.showUiTooltips && !battleActive}
            primary={!battleActive || !player?.usedTera || pokemon?.terastallized}
            active={pokemon?.terastallized}
            disabled={disableTeraToggle}
            onPress={() => updatePokemon({
              terastallized: !pokemon?.terastallized,
              useZ: false,
              useMax: false,
            }, `${baseScope}:ToggleButton~Tera:onPress()`)}
          />
        }

        {
          showZToggle &&
          <ToggleButton
            className={cx(
              styles.toggleButton,
              styles.ultButton,
              showTeraToggle && styles.lessSpacing,
            )}
            label="Z"
            tooltip={`${pokemon?.useZ ? 'Deactivate' : 'Activate'} Z-Moves`}
            tooltipDisabled={!settings?.showUiTooltips}
            primary
            active={pokemon?.useZ}
            disabled={!pokemon?.speciesForme}
            onPress={() => updatePokemon({
              terastallized: false,
              useZ: !pokemon?.useZ,
              useMax: false,
            }, `${baseScope}:ToggleButton~Z:onPress()`)}
          />
        }

        {
          showMaxToggle &&
          <ToggleButton
            className={cx(
              styles.toggleButton,
              styles.ultButton,
              (showTeraToggle || showZToggle) && styles.lessSpacing,
            )}
            label="Max"
            tooltip={(
              <div className={styles.descTooltip}>
                {
                  settings?.showUiTooltips &&
                  <div style={battleActive ? { marginBottom: 2 } : undefined}>
                    {pokemon?.useMax ? 'Deactivate' : 'Activate'} Max Moves
                  </div>
                }

                {
                  battleActive &&
                  <div
                    className={cx(
                      styles.ultUsage,
                      !player?.usedMax && styles.available,
                      player?.usedMax && styles.consumed,
                    )}
                  >
                    Dmax <strong>{player?.usedMax ? 'Used' : 'Available'}</strong>
                  </div>
                }
              </div>
            )}
            tooltipDisabled={!settings?.showUiTooltips && !battleActive}
            primary={!battleActive || !player?.usedMax || pokemon?.useMax}
            active={pokemon?.useMax}
            disabled={disableMaxToggle}
            onPress={() => updatePokemon({
              terastallized: false,
              useZ: false,
              useMax: !pokemon?.useMax,
            }, `${baseScope}:ToggleButton~Max:onPress()`)}
          />
        }

        {
          showEditButton &&
          <ToggleButton
            className={cx(
              styles.toggleButton,
              styles.editButton,
              // pokemon?.showMoveOverrides && styles.hideButton,
            )}
            label={pokemon?.showMoveOverrides ? 'Hide' : 'Edit'}
            tooltip={`${pokemon?.showMoveOverrides ? 'Close' : 'Open'} Move Editor`}
            tooltipDisabled={!settings?.showUiTooltips}
            primary={pokemon?.showMoveOverrides}
            // active={pokemon?.showMoveOverrides}
            disabled={!pokemon?.speciesForme}
            onPress={() => updatePokemon({
              showMoveOverrides: !pokemon?.showMoveOverrides,
            }, `${baseScope}:ToggleButton~Edit:onPress()`)}
          />
        }
      </TableGridItem>

      {pokemon?.showMoveOverrides ? (
        <TableGridItem
          className={cx(
            styles.header,
            styles.editorHeader,
            showFaintCounter && styles.editorItem,
          )}
          header
          align="left"
        >
          {/* <div className={styles.headerTitle}>
            Properties
          </div> */}

          {
            showFaintCounter &&
            <>
              <div
                className={styles.moveProperty}
                // style={{ marginRight: '0.5em' }}
              >
                <ValueField
                  className={styles.valueField}
                  label={`Fallen Allies Count for Pokemon ${friendlyPokemonName}`}
                  hideLabel
                  hint={pokemon.dirtyFaintCounter ?? (pokemon.faintCounter || 0)}
                  fallbackValue={pokemon.faintCounter || 0}
                  min={0}
                  max={(
                    formatId(pokemon.dirtyAbility || pokemon.ability) === 'supremeoverlord'
                      && !pokemon.moves.includes('Last Respects' as MoveName)
                      ? Math.max(player.maxPokemon - 1, 0)
                      : 100 // Last Respects is capped at 100 LOL
                  )}
                  step={1}
                  shiftStep={2}
                  clearOnFocus
                  absoluteHover
                  input={{
                    value: pokemon.dirtyFaintCounter ?? (pokemon.faintCounter || 0),
                    onChange: (value: number) => updatePokemon({
                      dirtyFaintCounter: value === pokemon.faintCounter
                        ? null
                        : value,
                    }, `${baseScope}:ValueField~FaintCounter:input.onChange()`),
                  }}
                />

                <div className={styles.propertyName}>
                  Fallen
                </div>
              </div>

              <ToggleButton
                className={styles.editorButton}
                style={{
                  // marginRight: '1em',
                  ...(typeof pokemon.dirtyFaintCounter === 'number' ? undefined : { opacity: 0 }),
                }}
                label="Reset"
                tooltip={`Reset to ${pokemon.faintCounter} Fallen`}
                tooltipDisabled={!settings?.showUiTooltips}
                primary={typeof pokemon.dirtyFaintCounter === 'number'}
                disabled={typeof pokemon.dirtyFaintCounter !== 'number'}
                onPress={() => updatePokemon({
                  dirtyFaintCounter: null,
                }, `${baseScope}:ToggleButton~ResetFaintCounter:onPress()`)}
              />
            </>
          }
        </TableGridItem>
      ) : (
        <>
          <TableGridItem
            className={cx(styles.header, styles.dmgHeader)}
            header
          >
            <div className={styles.headerTitle}>
              DMG
            </div>

            <ToggleButton
              className={styles.toggleButton}
              label="Crit"
              tooltip={`${pokemon?.criticalHit ? 'Hide' : 'Show'} Critical Hit Damages`}
              tooltipDisabled={!settings?.showUiTooltips}
              primary
              active={pokemon?.criticalHit}
              disabled={!pokemon?.speciesForme}
              onPress={() => updatePokemon({
                criticalHit: !pokemon?.criticalHit,
              }, `${baseScope}:ToggleButton~Crit:onPress()`)}
            />
          </TableGridItem>

          <TableGridItem
            className={styles.header}
            header
          >
            <div className={styles.headerTitle}>
              KO %
            </div>
          </TableGridItem>
        </>
      )}

      {/* (actual) moves */}
      {Array(matchups.length).fill(null).map((_, i) => {
        // const moveName = pokemon?.moves?.[i];
        // const move = moveName ? dex?.moves.get(moveName) : null;
        // const moveDescription = move?.shortDesc || move?.desc;

        // const maxPp = move?.noPPBoosts ? (move?.pp || 0) : Math.floor((move?.pp || 0) * (8 / 5));
        // const remainingPp = Math.max(maxPp - (ppUsed || maxPp), 0);

        const {
          defender,
          move: calcMove,
          description,
          damageRange,
          koChance,
          koColor,
        } = matchups[i] || {};

        // const moveName = calcMove?.name;
        const moveName = pokemon?.moves?.[i] || calcMove?.name;
        const moveToggled = detectToggledMove(pokemon, moveName);

        // getMoveOverrideDefaults() could return null, so spreading here to avoid a "Cannot read properties of null" error
        // (could make it not return null, but too lazy atm lol)
        const moveDefaults = { ...getMoveOverrideDefaults(format, pokemon, moveName, opponentPokemon) };

        const moveOverrides = {
          ...moveDefaults,
          ...pokemon?.moveOverrides?.[moveName],
        };

        const damagingMove = [
          'Physical',
          'Special',
        ].includes(moveOverrides.category);

        const hasOverrides = pokemon?.showMoveOverrides
          && hasMoveOverrides(format, pokemon, moveName, opponentPokemon);

        const basePowerKey: keyof CalcdexMoveOverride = (pokemon?.useZ && 'zBasePower')
          || (pokemon?.useMax && 'maxBasePower')
          || 'basePower';

        const fallbackBasePower = (pokemon?.useZ && moveDefaults.zBasePower)
          || (pokemon?.useMax && moveDefaults.maxBasePower)
          || calcMove?.bp
          || 0;

        const showDamageAmounts = !pokemon?.showMoveOverrides
          && !!description?.damageAmounts
          && (
            settings?.showMatchupDamageAmounts === 'always'
              || (settings?.showMatchupDamageAmounts === 'nfe' && defender?.species.nfe)
          );

        const showMatchupTooltip = !pokemon?.showMoveOverrides
          && settings?.showMatchupTooltip
          && !!description?.raw;

        const matchupTooltip = showMatchupTooltip ? (
          <div className={styles.descTooltip}>
            {settings?.prettifyMatchupDescription ? (
              <>
                {description?.attacker}
                {
                  !!description?.defender &&
                  <>
                    {
                      !!description.attacker &&
                      <>
                        <br />
                        vs
                        <br />
                      </>
                    }
                    {description.defender}
                  </>
                }
                {(!!description?.damageRange || !!description?.koChance) && ':'}
                {
                  !!description?.damageRange &&
                  <>
                    <br />
                    {description.damageRange}
                  </>
                }
                {
                  !!description?.koChance &&
                  <>
                    <br />
                    {description.koChance}
                  </>
                }
              </>
            ) : description.raw}

            {
              showDamageAmounts &&
              <>
                <br />
                <br />
                {settings?.formatMatchupDamageAmounts ? (
                  <>({formatDamageAmounts(description.damageAmounts)})</>
                ) : (
                  <>({description.damageAmounts})</>
                )}
              </>
            }
          </div>
        ) : null;

        // checking if a damaging move has non-0 BP (would be 'N/A' for status moves)
        // e.g., move dex reports 0 BP for Mirror Coat, a Special move ('IMMUNE' wouldn't be correct here)
        const parsedDamageRange = moveName
          ? damageRange
            || (moveOverrides[basePowerKey] || fallbackBasePower ? 'IMMUNE' : '???')
          : null;

        const hasDamageRange = !!parsedDamageRange
          && !['IMMUNE', 'N/A', '???'].includes(parsedDamageRange);

        return (
          <React.Fragment
            key={`PokeMoves:Moves:${pokemonKey}:MoveRow:${i}`}
          >
            <TableGridItem
              // className={cx(
              //   pokemon?.showMoveOverrides
              //     && ['xs', 'sm'].includes(containerSize)
              //     && styles.editorItemInput,
              // )}
              align="left"
            >
              <Dropdown
                aria-label={`Move Slot ${i + 1} for Pokemon ${friendlyPokemonName}`}
                hint="--"
                optionTooltip={PokeMoveOptionTooltip}
                optionTooltipProps={{
                  format,
                  pokemon,
                  opponentPokemon,
                  hidden: !settings?.showMoveTooltip,
                }}
                input={{
                  name: `PokeMoves:Moves:${pokemonKey}:Dropdown:${i}`,
                  value: moveName,
                  onChange: (name: MoveName) => handleMoveChange(name, i),
                }}
                options={moveOptions}
                noOptionsMessage="No Moves Found"
                disabled={!pokemon?.speciesForme}
              />
            </TableGridItem>

            {pokemon?.showMoveOverrides ? (
              <TableGridItem
                // className={cx(
                //   styles.editorItem,
                //   ['xs', 'sm'].includes(containerSize) && styles.smol,
                //   damagingMove && styles.withStatTargets,
                // )}
                className={styles.editorItem}
                // style={{ paddingLeft: 6 }}
              >
                <div className={styles.editorLeft}>
                  <PokeTypeField
                    input={{
                      name: `PokeMoves:${pokemonKey}:Moves:PokeTypeField:${moveName}`,
                      value: moveOverrides.type,
                      onChange: (value: Showdown.TypeName) => updatePokemon({
                        moveOverrides: {
                          [moveName]: { type: value },
                        },
                      }, `${baseScope}:PokeTypeField:input.onChange()`),
                    }}
                  />

                  {/* <ToggleButton
                    className={cx(
                      styles.editorButton,
                      styles.categoryButton,
                      moveOverrides.category === 'Status' && styles.readOnly,
                    )}
                    label={moveOverrides.category?.slice(0, 4)}
                    tooltip={(
                      <div className={styles.descTooltip}>
                        {
                          damagingMove &&
                          <>
                            Switch to{' '}
                            <em>{moveOverrides.category === 'Physical' ? 'Special' : 'Physical'}</em>
                            <br />
                          </>
                        }

                        <strong>{moveOverrides.category}</strong>
                      </div>
                    )}
                    tooltipDisabled={!settings?.showUiTooltips}
                    primary={damagingMove}
                    onPress={damagingMove ? () => updatePokemon({
                      moveOverrides: {
                        [moveName]: {
                          category: moveOverrides.category === 'Physical'
                            ? 'Special'
                            : 'Physical',
                        },
                      },
                    }, `${baseScope}:ToggleButton~Category:onPress()`) : undefined}
                  /> */}

                  <MoveCategoryField
                    className={styles.categoryField}
                    ariaLabel={`Stat Overrides for ${moveName} of Pokemon ${friendlyPokemonName}`}
                    format={format}
                    input={{
                      name: `PokeMoves:${pokemonKey}:Moves:MoveCategoryField:${moveName}`,
                      value: moveOverrides,
                      onChange: (value: Partial<CalcdexMoveOverride>) => updatePokemon({
                        moveOverrides: { [moveName]: value },
                      }, `${baseScope}:MoveCategoryField:input.onChange()`),
                    }}
                    readOnly={moveOverrides.category === 'Status'}
                  />

                  {
                    PokemonToggleMoves.includes(moveName) &&
                    <ToggleButton
                      className={styles.editorButton}
                      label="Active"
                      tooltip={(
                        <div className={styles.descTooltip}>
                          {moveToggled ? 'Deactivate' : 'Activate'}{' '}
                          <strong>{moveName}</strong>
                        </div>
                      )}
                      tooltipDisabled={!settings?.showUiTooltips}
                      active={moveToggled}
                      onPress={() => handleMoveToggle(moveName)}
                    />
                  }

                  {
                    damagingMove &&
                    <div className={styles.moveProperty}>
                      <ValueField
                        className={styles.valueField}
                        label={`Base Power Override for ${moveName} of Pokemon ${friendlyPokemonName}`}
                        hideLabel
                        hint={moveOverrides[basePowerKey]?.toString() || 0}
                        fallbackValue={fallbackBasePower}
                        min={0}
                        max={999} // hmm...
                        step={1}
                        shiftStep={10}
                        clearOnFocus
                        absoluteHover
                        input={{
                          name: `PokeMoves:${pokemonKey}:Moves:ValueField~BasePower:${moveName}`,
                          value: moveOverrides[basePowerKey],
                          onChange: (value: number) => updatePokemon({
                            moveOverrides: {
                              [moveName]: { [basePowerKey]: clamp(0, value, 999) },
                            },
                          }, `${baseScope}:ValueField~BasePower:input.onChange()`),
                        }}
                      />

                      <div className={styles.propertyName}>
                        {pokemon?.useZ && !pokemon?.useMax && 'Z '}
                        {pokemon?.useMax && 'Max '}
                        BP
                      </div>
                    </div>
                  }
                </div>

                <div className={styles.editorRight}>
                  <ToggleButton
                    className={styles.editorButton}
                    style={hasOverrides ? undefined : { opacity: 0 }}
                    label="Reset"
                    tooltip="Reset Move to Defaults"
                    tooltipDisabled={!settings?.showUiTooltips}
                    primary={hasOverrides}
                    disabled={!hasOverrides}
                    onPress={() => updatePokemon({
                      moveOverrides: {
                        [moveName]: null,
                      },
                    }, `${baseScope}:ToggleButton~ResetMoveOverrides:onPress()`)}
                  />
                </div>
              </TableGridItem>
            ) : (
              <>
                <TableGridItem>
                  {/* [XXX.X% &ndash;] XXX.X% */}
                  {/* (note: '0 - 0%' damageRange will be reported as 'N/A') */}
                  {(settings?.showNonDamageRanges || hasDamageRange) ? (
                    settings?.showMatchupTooltip && settings.copyMatchupDescription ? (
                      <Button
                        className={cx(
                          styles.damageButton,
                          (!showMatchupTooltip || !hasDamageRange) && styles.disabled,
                        )}
                        labelClassName={cx(
                          styles.damageButtonLabel,
                          !hasDamageRange && styles.noDamage,
                        )}
                        tabIndex={-1} // not ADA compliant, obviously lol
                        label={parsedDamageRange}
                        tooltip={matchupTooltip}
                        tooltipTrigger="mouseenter"
                        tooltipTouch={['hold', 500]}
                        tooltipDisabled={!showMatchupTooltip || !hasDamageRange}
                        hoverScale={1}
                        absoluteHover
                        disabled={!showMatchupTooltip || !hasDamageRange}
                        onPress={() => handleDamagePress(i, [
                          description.raw,
                          showDamageAmounts && `(${description.damageAmounts})`,
                        ].filter(Boolean).join(' '))}
                      >
                        <Badge
                          ref={(ref) => { copiedRefs.current[i] = ref; }}
                          className={styles.copiedBadge}
                          label="Copied!"
                          color="green"
                        />
                      </Button>
                    ) : (
                      <Tooltip
                        content={matchupTooltip}
                        offset={[0, 10]}
                        delay={[1000, 50]}
                        trigger="mouseenter"
                        touch={['hold', 500]}
                        disabled={!showMatchupTooltip || !hasDamageRange}
                      >
                        <div
                          className={cx(
                            styles.damageButtonLabel,
                            styles.noCopy,
                            !hasDamageRange && styles.noDamage,
                          )}
                        >
                          {parsedDamageRange}
                        </div>
                      </Tooltip>
                    )
                  ) : null}
                </TableGridItem>

                <TableGridItem
                  style={{
                    ...(!koChance ? { opacity: 0.3 } : null),
                    ...(koColor ? { color: koColor } : null),
                  }}
                >
                  {/* XXX% XHKO */}
                  {koChance}
                </TableGridItem>
              </>
            )}
          </React.Fragment>
        );
      })}
    </TableGrid>
  );
};
