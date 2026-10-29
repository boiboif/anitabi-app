import { createMMKV } from 'react-native-mmkv';
import { pilgrimageRecordStorageSchema } from '@/lib/pilgrimage-record-schema';
import { createPilgrimageRecordStorage } from '@/lib/pilgrimage-record-storage-core';

export { PilgrimageRecordsRollbackError } from '@/lib/pilgrimage-record-storage-core';

let storage: ReturnType<typeof createMMKV> | null = null;
try {
  storage = createMMKV({ id: 'anitabi-pilgrimage-records' });
} catch (error) {
  console.warn('MMKV pilgrimage record storage is unavailable:', error);
}

const records = createPilgrimageRecordStorage(storage, pilgrimageRecordStorageSchema);

export const getPilgrimageRecordsLoadError = records.getLoadError;
export const getPilgrimageRecords = records.getRecords;
export const createPilgrimageRecordsRestoreWrite = records.createRestoreWrite;
export const setPilgrimageRecords = records.setRecords;
