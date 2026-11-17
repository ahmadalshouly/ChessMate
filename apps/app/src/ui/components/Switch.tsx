import { Switch as RNSwitch, type SwitchProps as RNSwitchProps } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';

export interface SwitchProps extends Omit<RNSwitchProps, 'trackColor' | 'thumbColor' | 'onChange'> {
  value: boolean;
  onValueChange: (v: boolean) => void;
}

/** Native switch in brand colours (black/white track). Use as `right` in a ListRow. */
export function Switch(props: SwitchProps) {
  const c = useAppTheme().colors;
  return (
    <RNSwitch
      {...props}
      trackColor={{ false: c.borderStrong, true: c.accent }}
      thumbColor={c.scheme === 'dark' && props.value ? '#0A0A0B' : '#FFFFFF'}
      ios_backgroundColor={c.borderStrong}
      {...({ activeThumbColor: c.scheme === 'dark' ? '#0A0A0B' : '#FFFFFF' } as object)}
    />
  );
}
