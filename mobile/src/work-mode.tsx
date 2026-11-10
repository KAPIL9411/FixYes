import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type WorkMode = 'customer' | 'partner';

const STORAGE_KEY = 'fixyes.work-mode';

const WorkModeContext = createContext<{
  mode: WorkMode;
  setMode: (mode: WorkMode) => void;
}>({ mode: 'customer', setMode: () => undefined });

export function WorkModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<WorkMode>('customer');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (value === 'partner' || value === 'customer') setModeState(value);
      })
      .catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      setMode: (next: WorkMode) => {
        setModeState(next);
        void AsyncStorage.setItem(STORAGE_KEY, next);
      },
    }),
    [mode],
  );

  return <WorkModeContext.Provider value={value}>{children}</WorkModeContext.Provider>;
}

export const useWorkMode = () => useContext(WorkModeContext);
