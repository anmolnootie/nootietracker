import { create } from 'zustand';
import { User } from '@po-control-tower/shared';

interface AuthStore {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
  logout: () => void;
}

const initialUser = typeof window !== 'undefined' ? (localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user') as string) : null) : null;
const initialToken = typeof window !== 'undefined' ? (localStorage.getItem('accessToken') || null) : null;

export const useAuthStore = create<AuthStore>((set) => ({
  user: initialUser,
  token: initialToken,

  setAuth: (user: User, token: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('accessToken', token);
    }
    set({ user, token });
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
