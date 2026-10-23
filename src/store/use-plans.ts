import { getBangumiTitle, getPointTitle } from '@/lib/localized-data';
import {
  clearPlans,
  getPlanListSortOrder,
  getPlans,
  initializeDemoPlan,
  needsDemoPlanInitialization,
  setPlanListSortOrder,
  setPlans,
  type ItineraryPlan,
  type PlanItem,
  type PlanListSortOrder,
} from '@/lib/plan-storage';
import i18n from '@/i18n';
import { recordPilgrimageVisit } from '@/services/pilgrimage-records';
import type { Bangumi, Point } from '@/services/types';
import type { PlanPointEntry } from '@/utils/plan-point-batches';
import { Alert } from 'react-native';
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
      bangumiName: getBangumiTitle(bangumi) || i18n.t('unknownWork', { defaultValue: '未知作品' }),
      bangumiCover: bangumi.cover,
      bangumiColor: bangumi.color,
      pointName: getPointTitle(point) || i18n.t('unnamedLocation', { defaultValue: '未命名点位' }),
      pointImage: point.image,
      pointMark: point.mark,
      geo: point.geo,
    },
  };
}

export type AddPlanPointsResult = { addedCount: number; existingCount: number; planCount: number };

type PlansStore = {
  plans: ItineraryPlan[];
  planListSortOrder: PlanListSortOrder;
  initializeFirstInstallDemo: () => Promise<void>;
  togglePlanListSortOrder: () => void;
  createPlan: (title: string, description?: string) => string;
  updatePlan: (id: string, patch: Pick<ItineraryPlan, 'title' | 'description'>) => void;
  deletePlan: (id: string) => void;
  addPoint: (planId: string, point: Point, bangumi: Bangumi) => void;
  addPointsToPlans: (entries: PlanPointEntry[], planIds: string[]) => AddPlanPointsResult;
  updatePointPlans: (point: Point, bangumi: Bangumi, selectedPlanIds: string[]) => void;
  removePoint: (planId: string, itemKey: string) => void;
  removePoints: (planId: string, items: readonly Pick<PlanItem, 'key' | 'addedAt'>[]) => number;
  togglePoint: (planId: string, itemKey: string) => void;
  movePoint: (planId: string, itemKey: string, direction: 'up' | 'down') => void;
  reorderPoints: (planId: string, orderedKeys: string[]) => void;
  importPlan: (title: string, entries: { point: Point; bangumi: Bangumi }[]) => string;
  clearAllPlans: () => void;
};

const initialPlans = getPlans();

function save(next: ItineraryPlan[], set: (value: Partial<PlansStore>) => void) {
  setPlans(next);
  set({ plans: next });
}

export const usePlans = create<PlansStore>((set, get) => ({
  plans: initialPlans,
  planListSortOrder: getPlanListSortOrder(),
  initializeFirstInstallDemo: async () => {
    if (!needsDemoPlanInitialization()) return;
    try {
      const { createFirstInstallDemoPlan } = await import('@/lib/demo-plan');
      const demoPlan = await createFirstInstallDemoPlan();
      const seededPlan = initializeDemoPlan(demoPlan);
      if (seededPlan) set({ plans: [seededPlan] });
    } catch (error) {
      console.warn('Could not determine installation status for demo plan:', error);
    }
  },
  togglePlanListSortOrder: () => {
    const next = get().planListSortOrder === 'desc' ? 'asc' : 'desc';
    setPlanListSortOrder(next);
    set({ planListSortOrder: next });
  },
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
  addPointsToPlans: (entries, planIds) => {
    const selectedIds = new Set(planIds);
    const result = { addedCount: 0, existingCount: 0, planCount: 0 };
    if (entries.length === 0 || selectedIds.size === 0) return result;
    const now = Date.now();
    const nextPlans = get().plans.map((plan) => {
      if (!selectedIds.has(plan.id)) return plan;
      result.planCount += 1;
      const keys = new Set(plan.items.map((item) => item.key));
      const added: PlanItem[] = [];
      for (const { point, bangumi } of entries) {
        const key = pointKey(bangumi.id, point.id);
        if (keys.has(key)) {
          result.existingCount += 1;
        } else {
          keys.add(key);
          added.push({ ...makeItem(point, bangumi), addedAt: now });
        }
      }
      result.addedCount += added.length;
      // Keep existing items and their completion state, snapshots and ordering intact.
      return added.length ? { ...plan, items: [...plan.items, ...added], updatedAt: now } : plan;
    });
    if (result.addedCount > 0) save(nextPlans, set);
    return result;
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
  removePoints: (planId, selectedItems) => {
    const selected = new Map(selectedItems.map((item) => [item.key, item.addedAt]));
    if (selected.size === 0) return 0;
    let removedCount = 0;
    const nextPlans = get().plans.map((plan) => {
      if (plan.id !== planId) return plan;
      // Read the latest plan and retain each remaining item unchanged. addedAt
      // distinguishes an entry removed and re-added while confirmation was open.
      const items = plan.items.filter((item) => selected.get(item.key) !== item.addedAt);
      removedCount = plan.items.length - items.length;
      return removedCount ? { ...plan, items, updatedAt: Date.now() } : plan;
    });
    if (removedCount > 0) save(nextPlans, set);
    return removedCount;
  },
  togglePoint: (planId, itemKey) => {
    const item = get()
      .plans.find((plan) => plan.id === planId)
      ?.items.find((candidate) => candidate.key === itemKey);
    if (!item) return;
    const recordedAt = Date.now();
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
    // Only the user's transition to completed creates a record. Loading,
    // importing, restoring and cancelling completion leave records untouched.
    if (!item.completed) {
      const { key, bangumiId, pointId, snapshot } = item;
      void recordPilgrimageVisit({ key, bangumiId, pointId, snapshot }, recordedAt).catch((error) => {
        console.error('[pilgrimage-records] Failed to record completed plan point', error);
        Alert.alert(
          i18n.t('pilgrimageRecordSaveFailed', { defaultValue: '巡礼记录保存失败' }),
          i18n.t('planCompletedButRecordFailed', {
            defaultValue: '已标记当前计划点位完成，但巡礼记录未能保存。',
          }),
        );
      });
    }
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
  importPlan: (title, entries) => {
    const now = Date.now();
    const seen = new Set<string>();
    const items = entries.flatMap(({ point, bangumi }) => {
      const item = makeItem(point, bangumi);
      if (seen.has(item.key)) return [];
      seen.add(item.key);
      return [{ ...item, addedAt: now, completed: false }];
    });
    const plan: ItineraryPlan = {
      id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      createdAt: now,
      updatedAt: now,
      items,
    };
    save([plan, ...get().plans], set);
    return plan.id;
  },
  clearAllPlans: () => {
    clearPlans();
    set({ plans: [] });
  },
}));

export function getPlanPointKey(bangumiId: number, pointId: string): string {
  return pointKey(bangumiId, pointId);
}
