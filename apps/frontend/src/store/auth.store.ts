import { create } from 'zustand';
import { User } from '@po-control-tower/shared';

interface AuthStore {
  user: User | null;
  token: string | null;
  hydrated: boolean;
  hydrate: () => void;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  logout: () => void;
}

// Both the server render and the browser's very first (pre-hydration) render must
// start from the same `user: null` state - reading localStorage eagerly here would
// make the client's first paint differ from the server-rendered HTML (the server
// never sees localStorage) and trigger a React hydration mismatch. Instead we start
// null everywhere and pull in the persisted session via `hydrate()`, called once
// from a useEffect in _app.tsx after mount, once hydration is already done.
export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  hydrated: false,

  hydrate: () => {
    if (typeof window === 'undefined') return;
    const storedUser = localStorage.getItem('user');
    const storedToken = localStorage.getItem('accessToken');
    set({
      user: storedUser ? JSON.parse(storedUser) : null,
      token: storedToken || null,
      hydrated: true,
    });
  },

  setAuth: (user: User, token: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', token);
    }
    set({ user, token, hydrated: true });
  },

  clearAuth: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
    }
    set({ user: null, token: null });
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user');
      localStorage.removeItem('accessToken');
    }
    set({ user: null, token: null });
  },
}));
