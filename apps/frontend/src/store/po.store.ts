import { create } from 'zustand';
import { POMaster } from '@po-control-tower/shared';

interface POStore {
  pos: POMaster[];
  selectedPO: POMaster | null;
  loading: boolean;
  setPOs: (pos: POMaster[]) => void;
  setSelectedPO: (po: POMaster | null) => void;
  setLoading: (loading: boolean) => void;
}

export const usePOStore = create<POStore>((set) => ({
  pos: [],
  selectedPO: null,
  loading: false,
  setPOs: (pos: POMaster[]) => set({ pos }),
  setSelectedPO: (po: POMaster | null) => set({ selectedPO: po }),
  setLoading: (loading: boolean) => set({ loading }),
}));
