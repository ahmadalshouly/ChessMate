import { createContext, use } from 'react';

/**
 * Space the shell's floating chrome covers at the bottom of the screen (the
 * mobile tab bar). Scrollable screens add it as bottom padding; `Page` does
 * this for you.
 */
export const ShellInsetsContext = createContext({ bottom: 0 });

export function useShellInsets() {
  return use(ShellInsetsContext);
}
