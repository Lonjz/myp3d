import { createContext, useContext } from 'react';

export function createStrictContext<T>(hookName: string) {
  const Context = createContext<T | undefined>(undefined);

  function useStrictContext(): T {
    const value = useContext(Context);
    if (value === undefined) throw new Error(`${hookName} must be used within its provider`);
    return value;
  }

  return [Context, useStrictContext] as const;
}
