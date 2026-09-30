export type ReleaseNoteEntry = {
  version: string;
  displayVersion: string;
  notes: string;
  importance: 'major' | 'normal';
  buildNumber?: number;
};

function parseVersion(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-preview\.\d+)?$/.exec(version);
  return match ? match.slice(1, 4).map(Number) : null;
}

function compareVersions(left: string, right: string): number | null {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < 3; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

export function getApplicableReleaseNotes(
  history: ReleaseNoteEntry[] | undefined,
  currentVersion: string | null,
  currentBuildNumber: number,
  targetVersion: string,
  targetBuildNumber?: number,
): ReleaseNoteEntry[] {
  if (!Array.isArray(history) || !currentVersion || compareVersions(currentVersion, targetVersion) === null) {
    return [];
  }

  const applicable = history.filter((entry) => {
    if (
      !entry ||
      typeof entry.version !== 'string' ||
      typeof entry.displayVersion !== 'string' ||
      typeof entry.notes !== 'string' ||
      !entry.notes.trim() ||
      (entry.importance !== 'major' && entry.importance !== 'normal')
    ) {
      return false;
    }
    const fromCurrent = compareVersions(entry.version, currentVersion);
    const toTarget = compareVersions(entry.version, targetVersion);
    if (fromCurrent === null || toTarget === null || toTarget > 0) return false;
    if (fromCurrent > 0) return true;
    return (
      fromCurrent === 0 &&
      toTarget === 0 &&
      typeof targetBuildNumber === 'number' &&
      targetBuildNumber > currentBuildNumber &&
      entry.buildNumber === targetBuildNumber
    );
  });

  const latestEntry = applicable.find((entry) => compareVersions(entry.version, targetVersion) === 0);
  if (!latestEntry) return [];
  if (latestEntry.importance === 'major') return [latestEntry];

  const latestMajor = applicable
    .filter((entry) => entry.importance === 'major')
    .sort((left, right) => compareVersions(right.version, left.version) ?? 0)[0];
  return latestMajor ? [latestMajor, latestEntry] : [latestEntry];
}
