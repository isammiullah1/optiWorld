import { create } from 'zustand';

import { readSyncCounts } from '../services/syncService';

type ConnectivityState = {
  isOnline: boolean;
  pendingSyncCount: number;
  setOnline: (isOnline: boolean) => void;
  setPendingSyncCount: (pendingSyncCount: number) => void;
  refreshPendingCount: () => Promise<void>;
};

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  isOnline: true,
  pendingSyncCount: 0,
  setOnline: (isOnline) => set({ isOnline }),
  setPendingSyncCount: (pendingSyncCount) => set({ pendingSyncCount }),
  refreshPendingCount: async () => {
    try {
      const counts = await readSyncCounts();
      set({ pendingSyncCount: counts.pendingCount });
    } catch {
      set({ pendingSyncCount: 0 });
    }
  },
}));
