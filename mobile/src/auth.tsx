import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  api,
  authRequest,
  clearSession,
  getStoredAccessToken,
  getStoredRefreshToken,
  getDeviceId,
  persistSession,
} from "./api";

export interface BusinessPublic {
  id: string;
  name: string;
  type: string;
  currency: string;
  taxRate: number;
  fiscalYear: string;
  allowNegativeStock: boolean;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopPublic {
  id: string;
  businessId: string;
  name: string;
  branchCode: string;
  address: string | null;
  phone: string | null;
  manager: string | null;
  isWarehouse: boolean;
  openingCash: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Backwards-compatible alias used by existing screens/tests.
export interface Business extends BusinessPublic {
  modules: string[];
  language?: string;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status?: string;
}

type AuthState =
  | "initializing"
  | "unauthenticated"
  | "authenticating"
  | "authenticated"
  | "refreshing"
  | "loggingOut";

interface AuthContextValue {
  state: AuthState;
  token: string | null;
  user: UserInfo | null;
  business: Business | null;
  businesses: BusinessPublic[];
  shops: ShopPublic[];
  activeBusinessId: string | null;
  activeShopId: string | null;
  login: (email: string, password: string, deviceName?: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  loadBusinesses: () => Promise<boolean>;
  loadShops: (businessId: string) => Promise<boolean>;
  setActiveBusiness: (businessId: string | null) => void;
  setActiveShop: (shopId: string | null) => void;
}

export interface RegisterPayload {
  name: string;
  email: string;
  phone: string;
  password: string;
  deviceName?: string;
}

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: UserInfo;
  businessId: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>("initializing");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [businesses, setBusinesses] = useState<BusinessPublic[]>([]);
  const [shops, setShops] = useState<ShopPublic[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [activeShopId, setActiveShopId] = useState<string | null>(null);

  const applyAuthPayload = useCallback((payload: AuthResponse) => {
    setUser(payload.user);
    setToken(payload.accessToken);
    setState("authenticated");
    persistSession(payload.accessToken, payload.refreshToken).catch(() => undefined);
    if (payload.businessId) {
      setActiveBusinessId(payload.businessId);
      setBusiness({
        id: payload.businessId,
        name: "",
        type: "",
        modules: [],
        currency: "BDT",
        taxRate: 0,
        fiscalYear: "1 July - 30 June",
        allowNegativeStock: false,
        address: null,
        phone: null,
        email: null,
        logo: null,
        status: "ACTIVE",
        createdAt: "",
        updatedAt: "",
      });
    } else {
      setActiveBusinessId(null);
      setBusiness(null);
    }
  }, []);

  const restoreSession = useCallback(async () => {
    setState("initializing");
    const access = await getStoredAccessToken();
    const refresh = await getStoredRefreshToken();
    if (!access || !refresh) {
      setState("unauthenticated");
      return;
    }
    setToken(access);
    try {
      const data = await authRequest<{ data: { user: UserInfo } }>("/api/v1/auth/me");
      setUser(data.data.user);
      setState("authenticated");
    } catch {
      await clearSession();
      setToken(null);
      setUser(null);
      setState("unauthenticated");
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(
    async (email: string, password: string, deviceName?: string) => {
      setState("authenticating");
      const deviceId = await getDeviceId();
      try {
        const data = await api<{ data: AuthResponse }>("/api/v1/auth/login", {
          method: "POST",
          body: { email, password, deviceId, deviceName: deviceName ?? "mobile" },
        });
        applyAuthPayload(data.data);
      } catch (err) {
        setState("unauthenticated");
        throw err;
      }
    },
    [applyAuthPayload]
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      setState("authenticating");
      const deviceId = await getDeviceId();
      try {
        const data = await api<{ data: AuthResponse }>("/api/v1/auth/register", {
          method: "POST",
          body: { ...payload, deviceId, platform: "android" },
        });
        applyAuthPayload(data.data);
      } catch (err) {
        setState("unauthenticated");
        throw err;
      }
    },
    [applyAuthPayload]
  );

  const logout = useCallback(async () => {
    setState("loggingOut");
    const refresh = await getStoredRefreshToken();
    if (refresh) {
      try {
        await api("/api/v1/auth/logout", { method: "POST", body: { refreshToken: refresh } });
      } catch {
        // ignore — still clear local
      }
    }
    await clearSession();
    setToken(null);
    setUser(null);
    setBusiness(null);
    setState("unauthenticated");
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return;
    try {
      const data = await authRequest<{ data: { user: UserInfo } }>("/api/v1/auth/me");
      setUser(data.data.user);
    } catch {
      // ignore
    }
  }, [token]);

  const loadShops = useCallback(async (businessId: string): Promise<boolean> => {
    if (!token || !businessId) {
      setShops([]);
      return false;
    }
    try {
      const data = await authRequest<{ data: ShopPublic[] }>(
        `/api/v1/shops?businessId=${encodeURIComponent(businessId)}`
      );
      setShops(data.data);
      // Invalidate an active shop that no longer belongs to this business.
      const activeStillValid = data.data.some((s) => s.id === activeShopId);
      if (!activeStillValid) setActiveShopId(null);
      return true;
    } catch {
      // Never keep shops from another business on screen (backend authoritative).
      setShops([]);
      return false;
    }
  }, [token, activeShopId]);

  const loadBusinesses = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const data = await authRequest<{ data: BusinessPublic[] }>("/api/v1/businesses");
      setBusinesses(data.data);
      // Keep active business consistent with backend (server-authoritative).
      const target =
        data.data.length > 0
          ? data.data.find((b) => b.id === activeBusinessId) ?? data.data[0]
          : null;
      if (target) {
        setActiveBusinessId(target.id);
        setBusiness({ ...target, modules: [] });
        const shopsOk = await loadShops(target.id);
        if (!shopsOk) return false;
        try {
          const mods = await authRequest<{ data: { modules: string[] } }>(
            `/api/v1/businesses/${target.id}/modules`
          );
          setBusiness({ ...target, modules: mods.data.modules });
        } catch {
          setBusiness({ ...target, modules: [] });
        }
        return true;
      }
      setActiveBusinessId(null);
      setBusiness(null);
      setShops([]);
      return true;
    } catch {
      return false;
    }
  }, [token, activeBusinessId, loadShops]);

  const setActiveBusiness = useCallback((businessId: string | null) => {
    setActiveBusinessId(businessId);
    setActiveShopId(null); // shop must be re-resolved per business
  }, []);

  const setActiveShop = useCallback((shopId: string | null) => {
    setActiveShopId(shopId);
  }, []);

  const value = useMemo(
    () => ({
      state,
      token,
      user,
      business,
      businesses,
      shops,
      activeBusinessId,
      activeShopId,
      login,
      register,
      logout,
      refreshProfile,
      loadBusinesses,
      loadShops,
      setActiveBusiness,
      setActiveShop,
    }),
    [
      state,
      token,
      user,
      business,
      businesses,
      shops,
      activeBusinessId,
      activeShopId,
      login,
      register,
      logout,
      refreshProfile,
      loadBusinesses,
      loadShops,
      setActiveBusiness,
      setActiveShop,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}