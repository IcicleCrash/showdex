import * as React from 'react';
import cx from 'classnames';
import { type AbilityName } from '@smogon/calc';
import { type SelectOptionTooltipProps } from '@showdex/components/form';
import { formatDexDescription, getDexForFormat } from '@showdex/utils/dex';
import styles from './PokeInfo.module.scss';

export interface PokeAbilityOptionTooltipProps extends SelectOptionTooltipProps<AbilityName> {
  className?: string;
  style?: React.CSSProperties;
  format?: string;
}

export const PokeAbilityOptionTooltip = ({
  className,
  style,
  format,
  value,
  hidden,
}: PokeAbilityOptionTooltipProps): JSX.Element => {
  if (!value || hidden) {
    return null;
  }

  const dex = getDexForFormat(format);
  const dexAbility = dex?.abilities.get(value);
  const description = formatDexDescription(dexAbility?.shortDesc || dexAbility?.desc);

  return (
    <div
      className={cx(
        styles.tooltipContent,
        styles.descTooltip,
        className,
      )}
      style={style}
    >
      {description || 'No description available.'}
    </div>
  );
};
