import demoPlanData from '@/assets/data/demo-plan.json';
import type { ItineraryPlan, PlanPointSnapshot } from '@/lib/plan-storage';
import { getInstallationTimeAsync, getLastUpdateTimeAsync } from 'expo-application';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

async function isNewBinaryInstall(): Promise<boolean> {
  if (Updates.isEnabled && !Updates.isEmbeddedLaunch) return false;

  const installedAt = await getInstallationTimeAsync();
  const installTime = installedAt?.getTime();
  if (!Number.isFinite(installTime)) return false;

  if (Platform.OS === 'android') {
    const updatedAt = await getLastUpdateTimeAsync();
    return updatedAt.getTime() === installTime;
  }

  if (Platform.OS !== 'ios') return false;

  // iOS has no native last-update timestamp. The embedded update is created before a fresh install.
  const embeddedAt = Updates.createdAt?.getTime();
  return embeddedAt !== undefined && Number.isFinite(embeddedAt) && installTime >= embeddedAt;
}

export async function createFirstInstallDemoPlan(): Promise<ItineraryPlan | null> {
  if (!(await isNewBinaryInstall())) return null;

  const now = Date.now();
  return {
    id: 'built-in-demo-plan-v1',
    title: `${demoPlanData.title} [演示]`,
    createdAt: now,
    updatedAt: now,
    items: demoPlanData.items.map((item) => ({
      key: `${item.bangumiId}:${item.pointId}`,
      bangumiId: item.bangumiId,
      pointId: item.pointId,
      addedAt: now,
      completed: false,
      snapshot: item.snapshot as PlanPointSnapshot,
    })),
  };
}
