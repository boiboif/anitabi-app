import { createSharedPlanFileContent, sanitizePlanFileName } from '@/lib/plan-sharing';
import type { ItineraryPlan } from '@/lib/plan-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

async function ensureSharingAvailable() {
  if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持系统分享');
}

export async function sharePlanFile(plan: ItineraryPlan): Promise<void> {
  await ensureSharingAvailable();
  const file = new File(Paths.cache, sanitizePlanFileName(plan.title));
  file.create({ overwrite: true });
  file.write(createSharedPlanFileContent(plan));
  try {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: `分享“${plan.title}”巡礼计划`,
      mimeType: 'application/json',
      UTI: 'public.json',
    });
  } finally {
    try {
      file.delete();
    } catch {
      // Cache cleanup is best effort; the OS may still hold the shared file briefly.
    }
  }
}

export async function sharePlanImage(uri: string, title: string): Promise<void> {
  await ensureSharingAvailable();
  await Sharing.shareAsync(uri, {
    dialogTitle: `分享“${title}”巡礼计划`,
    mimeType: 'image/png',
    UTI: 'public.png',
  });
}
