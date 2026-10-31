export type AppVersionSource = 'embedded' | 'hot-update' | 'emergency' | 'development';

export type AppVersionInput = {
  /** Configuration belonging to the JS content currently running, including an applied OTA. */
  configuredVersion?: string | null;
  nativeVersion?: string | null;
  nativeBuild?: string | null;
  contentRevision?: unknown;
  updateId?: string | null;
  updatesEnabled: boolean;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch: boolean;
  isDevelopment: boolean;
  channel?: string | null;
  unknownVersion?: string;
};

export type AppVersionInfo = {
  displayVersion: string;
  baseVersion: string;
  nativeVersion: string | null;
  nativeBuild: string | null;
  source: AppVersionSource;
  contentRevision: string | null;
  /** Only a remotely downloaded, currently running update has an OTA ID here. */
  updateId: string | null;
  channel: string | null;
};

function nonEmpty(value?: string | null): string | null {
  return value?.trim() || null;
}

/** Present content identity separately from the installed binary; never use this for upgrade decisions. */
export function createAppVersionInfo(input: AppVersionInput): AppVersionInfo {
  const nativeVersion = nonEmpty(input.nativeVersion);
  const baseVersion = nonEmpty(input.configuredVersion) ?? nativeVersion ?? nonEmpty(input.unknownVersion) ?? '未知';
  const revision = typeof input.contentRevision === 'string' ? input.contentRevision.trim() : '';
  const contentRevision = /^[0-9a-f]{7,40}$/i.test(revision) ? revision.toLowerCase() : null;
  const source: AppVersionSource = input.isDevelopment
    ? 'development'
    : input.updatesEnabled && input.isEmergencyLaunch
      ? 'emergency'
      : input.updatesEnabled && !input.isEmbeddedLaunch
        ? 'hot-update'
        : 'embedded';
  const updateId = source === 'hot-update' ? nonEmpty(input.updateId) : null;
  // A shared commit identifies an OTA and its bundled installer alike. Older
  // updates have no revision metadata, so retain their diagnostic update ID.
  const suffix = contentRevision?.slice(0, 8) ?? updateId?.slice(0, 8);

  return {
    displayVersion: suffix ? `${baseVersion}-${suffix}` : baseVersion,
    baseVersion,
    nativeVersion,
    nativeBuild: nonEmpty(input.nativeBuild),
    source,
    contentRevision,
    updateId,
    channel: nonEmpty(input.channel),
  };
}
