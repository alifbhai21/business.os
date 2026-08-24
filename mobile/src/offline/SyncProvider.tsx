import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppState } from "react-native";
import { useAuth } from "../auth";
import { syncEngine } from "./syncEngine";

/**
 * Phase 10 — React bindings for the sync engine.
 *
 * Exposes connection state, queue counts, last-sync time and a manual
 * syncNow() to the UI. Auto-drains on connectivity regain and app foreground.
 */

interface SyncContextValue {
  online: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  conflicts: number;
  synced: number;
  lastSyncAt: string | null;
  refresh: () => Promise<void>;
  syncNow: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { state, user, activeBusinessId } = useAuth();
  const [online, setOnline] = useState(syncEngine.online);
  const [syncing, setSyncing] = useState(false);
  const [counts, setCounts] = useState({ pending: 0, failed: 0, conflicts: 0, synced: 0 });
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(syncEngine.lastSyncAt);

  const refresh = useCallback(async () => {
    setCounts(await syncEngine.counts());
    setLastSyncAt(syncEngine.lastSyncAt);
  }, []);

  const syncNow = useCallback(() => {
    void syncEngine.syncNow();
  }, []);

  // Boot/stop the engine with the session; keep activeBusinessId for pulls.
  useEffect(() => {
    if (state === "authenticated" && user?.id) {
      void (async () => {
        await import("./queue").then((q) => q.setMeta("activeBusinessId", activeBusinessId ?? ""));
        await syncEngine.start(user.id);
        setOnline(syncEngine.online);
        await refresh();
      })();
    }
    if (state !== "authenticated") {
      syncEngine.stop();
      setCounts({ pending: 0, failed: 0, conflicts: 0, synced: 0 });
    }
  }, [state, user?.id, activeBusinessId, refresh]);

  // Mirror engine state changes into React.
  useEffect(() => {
    return syncEngine.subscribe(() => {
      setOnline(syncEngine.online);
      setSyncing(syncEngine.syncing);
      setLastSyncAt(syncEngine.lastSyncAt);
      void refresh();
    });
  }, [refresh]);

  // Sync on foreground (battery-friendly: no polling).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo(
    () => ({ online, syncing, ...counts, lastSyncAt, refresh, syncNow }),
    [online, syncing, counts, lastSyncAt, refresh, syncNow]
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside SyncProvider");
  return ctx;
}
