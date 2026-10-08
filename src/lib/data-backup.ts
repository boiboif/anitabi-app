import type { BackupFavoritePointV1, BackupPlanItemV1, BackupPlanV1, DataBackupV1 } from './data-backup-schema';
import { strToU8 } from 'fflate';

export const BACKUP_TYPE = 'anitabi-backup' as const;
export const BACKUP_VERSION = 1 as const;
export const MAX_BACKUP_FILE_BYTES = 20 * 1024 * 1024;

export type DataBackup = DataBackupV1;
export type BackupData = DataBackup['data'];

// Each entry upgrades data from its key version to the immediately next version.
// Version 1 is the first format; register 1 -> 2 when introducing version 2.
export type BackupMigrations = Readonly<Partial<Record<number, (data: unknown) => unknown>>>;
const BACKUP_MIGRATIONS: BackupMigrations = {};

export type BackupRestoreMode = 'merge' | 'overwrite';
export type BackupErrorCode =
  | 'invalid'
  | 'wrongType'
  | 'unsupportedVersion'
  | 'migrationFailed'
  | 'tooLarge'
  | 'writeFailed'
  | 'rollbackFailed';

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

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000;
}

function isSnapshot(value: unknown): boolean {
  if (!isRecord(value) || typeof value.bangumiName !== 'string' || typeof value.pointName !== 'string') return false;
  for (const key of ['bangumiCover', 'bangumiColor', 'pointImage', 'pointMark']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') return false;
  }
  if (value.geo !== undefined) {
    if (!Array.isArray(value.geo) || value.geo.length !== 2) return false;
    const [latitude, longitude] = value.geo;
    if (
      typeof latitude !== 'number' ||
      !Number.isFinite(latitude) ||
      Math.abs(latitude) > 90 ||
      typeof longitude !== 'number' ||
      !Number.isFinite(longitude) ||
      Math.abs(longitude) > 180
    )
      return false;
  }
  return true;
}

function isFavoritePoint(value: unknown): value is BackupFavoritePointV1 {
  return (
    isRecord(value) &&
    typeof value.bangumiId === 'number' &&
    Number.isSafeInteger(value.bangumiId) &&
    value.bangumiId > 0 &&
    typeof value.pointId === 'string' &&
    value.pointId.length > 0 &&
    value.key === `${value.bangumiId}:${value.pointId}` &&
    isTimestamp(value.addedAt) &&
    isSnapshot(value.snapshot)
  );
}

function isPlanItem(value: unknown): value is BackupPlanItemV1 {
  return isRecord(value) && typeof value.completed === 'boolean' && isFavoritePoint(value);
}

function isUniqueArray<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
  getKey: (item: T) => string,
): value is T[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isItem(item) || seen.has(getKey(item))) return false;
    seen.add(getKey(item));
  }
  return true;
}

function isPlan(value: unknown): value is BackupPlanV1 {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    (value.description === undefined || typeof value.description === 'string') &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt) &&
    isUniqueArray(value.items, isPlanItem, (item) => item.key)
  );
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
  const data = migrate ? migrateBackupData(value.data, value.version, BACKUP_VERSION, BACKUP_MIGRATIONS) : value.data;
  if (!migrate && value.version !== BACKUP_VERSION) throw new BackupError('unsupportedVersion');
  if (
    !isRecord(data) ||
    !isUniqueArray(data.favoritePoints, isFavoritePoint, (item) => item.key) ||
    !isUniqueArray(data.plans, isPlan, (plan) => plan.id) ||
    (data.planListSortOrder !== 'asc' && data.planListSortOrder !== 'desc')
  )
    throw new BackupError('invalid');
  return {
    type: BACKUP_TYPE,
    version: BACKUP_VERSION,
    appVersion: value.appVersion,
    exportedAt: value.exportedAt,
    data: { favoritePoints: data.favoritePoints, plans: data.plans, planListSortOrder: data.planListSortOrder },
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

export function createDataBackupContent(data: BackupData, appVersion: string, date = new Date()): string {
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

export function getBackupFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `anitabi-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${date.getMilliseconds()}.json`;
}

export function getBackupSummary(data: BackupData) {
  let pointCount = 0;
  let completedCount = 0;
  for (const plan of data.plans) {
    pointCount += plan.items.length;
    for (const item of plan.items) if (item.completed) completedCount++;
  }
  return { favoriteCount: data.favoritePoints.length, planCount: data.plans.length, pointCount, completedCount };
}

export function prepareBackupRestore(current: BackupData, incoming: BackupData, mode: BackupRestoreMode): BackupData {
  if (mode === 'overwrite') return incoming;
  const favoriteKeys = new Set(current.favoritePoints.map((item) => item.key));
  const importedPlans = new Map(incoming.plans.map((plan) => [plan.id, plan]));
  const planIds = new Set(current.plans.map((plan) => plan.id));
  return {
    favoritePoints: [
      ...current.favoritePoints,
      ...incoming.favoritePoints.filter((item) => !favoriteKeys.has(item.key)),
    ],
    plans: [
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
    ],
    planListSortOrder: current.planListSortOrder,
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
