import { clearPlans, getPlans, setPlans, type ItineraryPlan, type PlanItem } from '@/lib/plan-storage';
import type { Bangumi, Point } from '@/services/types';
import { create } from 'zustand';

function pointKey(bangumiId: number, pointId: string): string {
  return `${bangumiId}:${pointId}`;
}

function makeItem(point: Point, bangumi: Bangumi): PlanItem {
  return {
    key: pointKey(bangumi.id, point.id),
    bangumiId: bangumi.id,
    pointId: point.id,
    addedAt: Date.now(),
    completed: false,
    snapshot: {
      bangumiName: bangumi.cn || bangumi.title || bangumi.en || '未知作品',
      bangumiCover: bangumi.cover,
      bangumiColor: bangumi.color,
      pointName: point.cn || point.name || '未命名点位',
      pointImage: point.image,
      pointMark: point.mark,
      geo: point.geo,
    },
  };
}

type PlansStore = {
  plans: ItineraryPlan[];
  createPlan: (title: string, description?: string) => string;
  updatePlan: (id: string, patch: Pick<ItineraryPlan, 'title' | 'description'>) => void;
  deletePlan: (id: string) => void;
  addPoint: (planId: string, point: Point, bangumi: Bangumi) => void;
  updatePointPlans: (point: Point, bangumi: Bangumi, selectedPlanIds: string[]) => void;
  removePoint: (planId: string, itemKey: string) => void;
  togglePoint: (planId: string, itemKey: string) => void;
  movePoint: (planId: string, itemKey: string, direction: 'up' | 'down') => void;
  reorderPoints: (planId: string, orderedKeys: string[]) => void;
  clearAllPlans: () => void;
};

const initialPlans = getPlans();

function save(next: ItineraryPlan[], set: (value: Partial<PlansStore>) => void) {
  setPlans(next);
  set({ plans: next });
}

export const usePlans = create<PlansStore>((set, get) => ({
  plans: initialPlans,
  createPlan: (title, description) => {
    const now = Date.now();
    const plan: ItineraryPlan = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      description: description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
      items: [],
    };
    save([plan, ...get().plans], set);
    return plan.id;
  },
  updatePlan: (id, patch) => {
    save(
      get().plans.map((plan) => (plan.id === id ? { ...plan, ...patch, updatedAt: Date.now() } : plan)),
      set,
    );
  },
  deletePlan: (id) =>
    save(
      get().plans.filter((plan) => plan.id !== id),
      set,
    ),
  addPoint: (planId, point, bangumi) => {
    const item = makeItem(point, bangumi);
    save(
      get().plans.map((plan) =>
        plan.id !== planId || plan.items.some((existing) => existing.key === item.key)
          ? plan
          : { ...plan, items: [...plan.items, item], updatedAt: Date.now() },
      ),
      set,
    );
  },
  updatePointPlans: (point, bangumi, selectedPlanIds) => {
    const selectedIds = new Set(selectedPlanIds);
    const itemKey = pointKey(bangumi.id, point.id);
    const item = makeItem(point, bangumi);
    const currentPlans = get().plans;
    let changed = false;
    const nextPlans = currentPlans.map((plan) => {
      const hasPoint = plan.items.some((existing) => existing.key === itemKey);
      if (selectedIds.has(plan.id)) {
        if (hasPoint) return plan;
        changed = true;
        return { ...plan, items: [...plan.items, item], updatedAt: Date.now() };
      }
      if (!hasPoint) return plan;
      changed = true;
      return { ...plan, items: plan.items.filter((existing) => existing.key !== itemKey), updatedAt: Date.now() };
    });
    if (changed) save(nextPlans, set);
  },
  removePoint: (planId, itemKey) => {
    save(
      get().plans.map((plan) =>
        plan.id === planId
          ? { ...plan, items: plan.items.filter((item) => item.key !== itemKey), updatedAt: Date.now() }
          : plan,
      ),
      set,
    );
  },
  togglePoint: (planId, itemKey) => {
    save(
      get().plans.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              items: plan.items.map((item) => (item.key === itemKey ? { ...item, completed: !item.completed } : item)),
              updatedAt: Date.now(),
            }
          : plan,
      ),
      set,
    );
  },
  movePoint: (planId, itemKey, direction) => {
    save(
      get().plans.map((plan) => {
        if (plan.id !== planId) return plan;
        const index = plan.items.findIndex((item) => item.key === itemKey);
        const nextIndex = direction === 'up' ? index - 1 : index + 1;
        if (index < 0 || nextIndex < 0 || nextIndex >= plan.items.length) return plan;
        const items = [...plan.items];
        [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
        return { ...plan, items, updatedAt: Date.now() };
      }),
      set,
    );
  },
  reorderPoints: (planId, orderedKeys) => {
    const order = new Map(orderedKeys.map((key, index) => [key, index]));
    save(
      get().plans.map((plan) =>
        plan.id === planId
          ? {
              ...plan,
              items: [...plan.items].sort(
                (a, b) => (order.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.key) ?? Number.MAX_SAFE_INTEGER),
              ),
              updatedAt: Date.now(),
            }
          : plan,
      ),
      set,
    );
  },
  clearAllPlans: () => {
    clearPlans();
    set({ plans: [] });
  },
}));

export function getPlanPointKey(bangumiId: number, pointId: string): string {
  return pointKey(bangumiId, pointId);
}
