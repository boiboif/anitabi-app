import type { AppUpdateManager } from '@/hooks/use-app-updates';
import { createContext, useContext } from 'react';

export const AppUpdateManagerContext = createContext<AppUpdateManager | null>(null);

export function useAppUpdateManager(): AppUpdateManager {
  const manager = useContext(AppUpdateManagerContext);
  if (!manager) throw new Error('useAppUpdateManager must be used within AppUpdateManagerContext.Provider');
  return manager;
}
