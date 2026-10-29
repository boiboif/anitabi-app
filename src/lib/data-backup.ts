import type { DataBackupV4 } from './data-backup-schema';
import {
  copyBackupContentsV3,
  copyBackupContentsV4,
  decodeBackupContentsV4,
  encodeBackupContentsV4,
  isBackupContentsV2,
  isBackupContentsV3,
  isBackupContentsV4,
  isFullBackupDataV1,
  type BackupAppData,
} from '@/lib/data-backup-codec';
import { mergePilgrimageRecords } from '@/lib/pilgrimage-records';
import { strToU8 } from 'fflate';

export const BACKUP_TYPE = 'anitabi-backup' as const;
export const BACKUP_VERSION = 4 as const;
export const MAX_BACKUP_FILE_BYTES = 20 * 1024 * 1024;

export type DataBackup = DataBackupV4;
export type BackupContents = DataBackup['data'];
export type BackupData = BackupAppData;
export type BackupSelection = { favoritePoints: boolean; plans: boolean; pilgrimageRecords: boolean };

// Each entry upgrades data from its key version to the immediately next version.
export type BackupMigrations = Readonly<Partial<Record<number, (data: unknown) => unknown>>>;
const BACKUP_MIGRATIONS: BackupMigrations = {
  // V1 is validated as a full backup before migration; both categories remain included.
  1: (data) => data,
  2: (data) => {
    if (!isBackupContentsV2(data)) throw new BackupError('invalid');
    return data;
  },
  3: (data) => {
    if (!isBackupContentsV3(data)) throw new BackupError('invalid');
    // Older files did not record later photo times. Retain that absence.
    return copyBackupContentsV3(data);
  },
};

export type BackupRestoreMode = 'merge' | 'overwrite';
export type BackupErrorCode =
  | 'invalid'
  | 'wrongType'
  | 'unsupportedVersion'
  | 'migrationFailed'
  | 'tooLarge'
  | 'writeFailed'
  | 'rollbackFailed'
  | 'recordsUnavailable'
  | 'nativeOnly';

export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode) {
    super(code);
    this.name = 'BackupError';
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function migrateBackupData(
  data: unknown,
  sourceVersion: number,
  targetVersion: number,
  migrations: BackupMigrations,
): unknown {
  if (
    !Number.isSafeInteger(sourceVersion) ||
    sourceVersion < 1 ||
    !Number.isSafeInteger(targetVersion) ||
    targetVersion < 1
  )
    throw new BackupError('invalid');
  if (sourceVersion > targetVersion) throw new BackupError('unsupportedVersion');
  if (sourceVersion === targetVersion) return data;

  // Check the full path before executing any migration.
  for (let version = sourceVersion; version < targetVersion; version++) {
    if (typeof migrations[version] !== 'function') throw new BackupError('unsupportedVersion');
  }

  try {
    // Isolate the source: even a failed migration must leave it untouched.
    let migrated: unknown = JSON.parse(JSON.stringify(data));
    if (!isRecord(migrated)) throw new BackupError('migrationFailed');
    for (let version = sourceVersion; version < targetVersion; version++) {
      migrated = migrations[version]!(migrated);
      if (!isRecord(migrated)) throw new BackupError('migrationFailed');
    }
    return migrated;
  } catch {
    throw new BackupError('migrationFailed');
  }
}

function validateBackup(value: unknown, migrate = false): DataBackup {
  if (!isRecord(value)) throw new BackupError('invalid');
  if (value.type !== BACKUP_TYPE) throw new BackupError('wrongType');
  if (
    typeof value.appVersion !== 'string' ||
    !value.appVersion ||
    typeof value.exportedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.exportedAt)) ||
    typeof value.version !== 'number' ||
    !Number.isSafeInteger(value.version) ||
    value.version < 1
  )
    throw new BackupError('invalid');
  // Missing V1 fields are corruption, not an intentional partial backup.
  if (value.version === 1 && !isFullBackupDataV1(value.data)) throw new BackupError('invalid');
  const data = migrate ? migrateBackupData(value.data, value.version, BACKUP_VERSION, BACKUP_MIGRATIONS) : value.data;
  if (!migrate && value.version !== BACKUP_VERSION) throw new BackupError('unsupportedVersion');
  if (!isBackupContentsV4(data)) throw new BackupError('invalid');
  return {
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    appVersion: value.appVersion,
    exportedAt: value.exportedAt,
    data: copyBackupContentsV4(data),
  };
}

export function parseDataBackup(content: string): DataBackup {
  if (content.length > MAX_BACKUP_FILE_BYTES || strToU8(content).byteLength > MAX_BACKUP_FILE_BYTES) {
    throw new BackupError('tooLarge');
  }
  let value: unknown;
  try {
    value = JSON.parse(content.replace(/^\uFEFF/u, ''));
  } catch {
    throw new BackupError('invalid');
  }
  return validateBackup(value, true);
}

export function selectBackupData(data: BackupData, selection: BackupSelection): BackupContents {
  if (!selection.favoritePoints && !selection.plans && !selection.pilgrimageRecords) throw new BackupError('invalid');
  return encodeBackupContentsV4({
    ...(selection.favoritePoints ? { favoritePoints: data.favoritePoints } : {}),
    ...(selection.plans ? { plans: data.plans, planListSortOrder: data.planListSortOrder } : {}),
    ...(selection.pilgrimageRecords ? { pilgrimageRecords: data.pilgrimageRecords } : {}),
  });
}

export function createDataBackupContent(data: BackupContents, appVersion: string, date = new Date()): string {
  const backup = validateBackup({
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    exportedAt: date.toISOString(),
    appVersion,
    data,
  });
  const content = `${JSON.stringify(backup, null, 2)}\n`;
  if (strToU8(content).byteLength > MAX_BACKUP_FILE_BYTES) throw new BackupError('tooLarge');
  return content;
}

export function getBackupFileName(date = new Date(), archive = false): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `anitabi-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${date.getMilliseconds()}.${archive ? 'zip' : 'json'}`;
}

type BackupSummaryContents = {
  favoritePoints?: readonly unknown[];
  plans?: readonly { items: readonly { completed: boolean }[] }[];
  pilgrimageRecords?: readonly { days: readonly { photos: readonly unknown[] }[] }[];
};

export function getBackupSummary<Data extends BackupSummaryContents>(data: Data) {
  let pointCount = 0;
  let completedCount = 0;
  for (const plan of data.plans ?? []) {
    pointCount += plan.items.length;
    for (const item of plan.items) if (item.completed) completedCount++;
  }
  return {
    favoriteCount: data.favoritePoints?.length ?? 0,
    planCount: data.plans?.length ?? 0,
    pointCount,
    completedCount,
    recordPointCount: data.pilgrimageRecords?.length ?? 0,
    recordDayCount: data.pilgrimageRecords?.reduce((count, point) => count + point.days.length, 0) ?? 0,
    photoCount:
      data.pilgrimageRecords?.reduce(
        (count, point) => count + point.days.reduce((total, day) => total + day.photos.length, 0),
        0,
      ) ?? 0,
  };
}

export function prepareBackupRestore(current: BackupData, wire: BackupContents, mode: BackupRestoreMode): BackupData {
  const incoming = decodeBackupContentsV4(wire);
  if (mode === 'overwrite') {
    return {
      favoritePoints: incoming.favoritePoints ?? current.favoritePoints,
      plans: incoming.plans ?? current.plans,
      planListSortOrder: incoming.planListSortOrder ?? current.planListSortOrder,
      pilgrimageRecords: incoming.pilgrimageRecords ?? current.pilgrimageRecords,
    };
  }
  const favoriteKeys = new Set(current.favoritePoints.map((item) => item.key));
  const importedPlans = new Map(incoming.plans?.map((plan) => [plan.id, plan]));
  const planIds = new Set(current.plans.map((plan) => plan.id));
  return {
    favoritePoints: incoming.favoritePoints
      ? [...current.favoritePoints, ...incoming.favoritePoints.filter((item) => !favoriteKeys.has(item.key))]
      : current.favoritePoints,
    plans: incoming.plans
      ? [
          ...current.plans.map((plan) => {
            const imported = importedPlans.get(plan.id);
            if (!imported) return plan;
            const itemKeys = new Set(plan.items.map((item) => item.key));
            const added = imported.items.filter((item) => !itemKeys.has(item.key));
            return added.length
              ? { ...plan, items: [...plan.items, ...added], updatedAt: Math.max(plan.updatedAt, imported.updatedAt) }
              : plan;
          }),
          ...incoming.plans.filter((plan) => !planIds.has(plan.id)),
        ]
      : current.plans,
    planListSortOrder: current.planListSortOrder,
    pilgrimageRecords: incoming.pilgrimageRecords
      ? mergePilgrimageRecords(current.pilgrimageRecords, incoming.pilgrimageRecords)
      : current.pilgrimageRecords,
  };
}

// A synchronous write may throw after changing storage. Roll back that step too.
export function runBackupWrites(steps: { write: () => void; rollback: () => void }[]): void {
  const attempted: typeof steps = [];
  try {
    for (const step of steps) {
      attempted.push(step);
      step.write();
    }
  } catch (error) {
    let rollbackFailed = false;
    for (const step of attempted.reverse()) {
      try {
        step.rollback();
      } catch {
        rollbackFailed = true;
      }
    }
    console.warn('Backup restore write failed:', error);
    throw new BackupError(rollbackFailed ? 'rollbackFailed' : 'writeFailed');
  }
}
