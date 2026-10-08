type StringStorage = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
};

export function createBackupStorageWrite(storage: StringStorage | null, key: string, value: string) {
  if (!storage) throw new Error('Backup storage is unavailable');
  const previous = storage.getString(key);
  const verify = (expected: string | undefined) => {
    if (storage.getString(key) !== expected) throw new Error('Backup storage verification failed');
  };
  return {
    write: () => {
      storage.set(key, value);
      verify(value);
    },
    rollback: () => {
      if (previous === undefined) storage.remove(key);
      else storage.set(key, previous);
      verify(previous);
    },
  };
}
