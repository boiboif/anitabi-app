import { createMMKV } from 'react-native-mmkv';

export type PlanPointSnapshot = {
  bangumiName: string;
  bangumiCover?: string;
  bangumiColor?: string;
  pointName: string;
  pointImage?: string;
  pointMark?: string;
  geo?: [number, number];
};

export type PlanItem = {
  key: string;
  bangumiId: number;
  pointId: string;
  addedAt: number;
  completed: boolean;
  snapshot: PlanPointSnapshot;
};

export type ItineraryPlan = {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  items: PlanItem[];
};

let storage: ReturnType<typeof createMMKV> | null = null;
try {
  storage = createMMKV({ id: 'anitabi-plans' });
} catch (error) {
  console.warn('MMKV init failed (web?), plans disabled:', error);
}

const PLANS_KEY = 'itinerary-plans-v1';

export function getPlans(): ItineraryPlan[] {
  if (!storage) return [];
  try {
    const raw = storage.getString(PLANS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ItineraryPlan[]) : [];
  } catch {
    return [];
  }
}

export function setPlans(plans: ItineraryPlan[]): void {
  if (!storage) return;
  try {
    storage.set(PLANS_KEY, JSON.stringify(plans));
  } catch (error) {
    console.warn('MMKV setPlans failed:', error);
  }
}

export function clearPlans(): void {
  storage?.remove(PLANS_KEY);
}
