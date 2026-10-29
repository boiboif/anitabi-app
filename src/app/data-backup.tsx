import { SettingCell } from '@/components/ui/settings/setting-cell';
import { SettingsSection } from '@/components/ui/settings/settings-section';
import { StrictButton as Button } from '@/components/ui/strict-button';
import type { TranslationKey } from '@/i18n/translations/zh';
import {
  BackupError,
  getBackupSummary,
  selectBackupData,
  type BackupContents,
  type BackupRestoreMode,
  type BackupSelection,
} from '@/lib/data-backup';
import { exportDataBackup, pickDataBackup } from '@/lib/data-backup-files';
import { getCurrentBackupData, restoreDataBackup } from '@/lib/restore-data-backup';
import { getBackupPhotoBytes, type BackupProgress } from '@/lib/pilgrimage-backup-archive';
import { getCurrentAppDisplayVersion } from '@/services/app-update';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { usePlans } from '@/store/use-plans';
import { usePilgrimageRecords } from '@/store/use-pilgrimage-records';
import { MaxContentWidth } from '@/tamagui.config';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Check, FileDown, FileUp, Square, SquareCheckBig } from '@tamagui/lucide-icons-2';
import { usePreventRemove } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner, Text, XStack, YStack, useTheme } from 'tamagui';

export default function DataBackupScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const favoritePoints = useFavoritePoints((state) => state.favoritePoints);
  const plans = usePlans((state) => state.plans);
  const planListSortOrder = usePlans((state) => state.planListSortOrder);
  const pilgrimageRecords = usePilgrimageRecords((state) => state.points);
  const [exportSelection, setExportSelection] = useState<BackupSelection>({
    favoritePoints: true,
    plans: true,
    pilgrimageRecords: true,
  });
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof pickDataBackup>>>(null);
  const [mode, setMode] = useState<BackupRestoreMode>('merge');
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  const [operation, setOperation] = useState<'export' | 'pick' | 'restore' | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [progress, setProgress] = useState<BackupProgress | null>(null);
  const [photoBytes, setPhotoBytes] = useState(0);
  const exportSheetRef = useRef<TrueSheet>(null);
  const busyRef = useRef(false);
  const busy = operation !== null;
  // Keep the selected archive's staged images alive until processing finishes.
  usePreventRemove(busy);
  const hasExportSelection =
    exportSelection.favoritePoints || exportSelection.plans || exportSelection.pilgrimageRecords;
  const currentSummary = getBackupSummary({ favoritePoints, plans, planListSortOrder, pilgrimageRecords });
  const incomingSummary = selected ? getBackupSummary(selected.backup.data) : null;
  const formatDataCounts = (data: BackupContents, summary = getBackupSummary(data)) => {
    return [
      ...(data.favoritePoints !== undefined ? [t('backupFavoriteCounts', summary)] : []),
      ...(data.plans !== undefined ? [t('backupPlanCounts', summary)] : []),
      ...(data.pilgrimageRecords !== undefined
        ? [
            t('backupPilgrimageCounts', {
              defaultValue: '{{recordPointCount}} 个点位 · {{recordDayCount}} 条记录 · {{photoCount}} 张照片',
              ...summary,
            }),
          ]
        : []),
    ].join(' · ');
  };
  useEffect(() => () => selected?.archive?.cleanup(), [selected]);
  const errorKeys: Record<BackupError['code'], TranslationKey> = {
    invalid: 'backupInvalidData',
    wrongType: 'backupWrongFileType',
    unsupportedVersion: 'backupUnsupportedVersion',
    migrationFailed: 'backupMigrationFailed',
    tooLarge: 'backupFileTooLarge',
    writeFailed: 'backupWriteFailed',
    rollbackFailed: 'backupRollbackFailed',
    recordsUnavailable: 'backupPilgrimageUnavailable',
    nativeOnly: 'backupRecordsNativeOnly',
  };

  const showError = (error: unknown, fallback: TranslationKey) => {
    setNotice({ error: true, text: t(error instanceof BackupError ? errorKeys[error.code] : fallback) });
  };

  const openExportSheet = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setNotice(null);
    try {
      setPhotoBytes(getBackupPhotoBytes({ pilgrimageRecords }));
      await exportSheetRef.current?.present();
    } catch (error) {
      showError(error, 'backupExportFailed');
    } finally {
      busyRef.current = false;
    }
  };

  const exportBackup = async () => {
    if (busyRef.current || !hasExportSelection) return;
    busyRef.current = true;
    setOperation('export');
    setNotice(null);
    setProgress(null);
    try {
      // Finish closing the native sheet before presenting the system share dialog.
      await exportSheetRef.current?.dismiss();
      await exportDataBackup(
        selectBackupData(getCurrentBackupData(), exportSelection),
        getCurrentAppDisplayVersion(),
        setProgress,
      );
    } catch (error) {
      showError(error, 'backupExportFailed');
    } finally {
      busyRef.current = false;
      setOperation(null);
      setProgress(null);
    }
  };

  const chooseFile = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setOperation('pick');
    setNotice(null);
    setConfirmingOverwrite(false);
    setProgress(null);
    try {
      const result = await pickDataBackup(setProgress);
      if (result) {
        setSelected(result);
        setMode('merge');
      }
    } catch (error) {
      // A failed selection must not leave an old file ready for restoration.
      setSelected(null);
      showError(error, 'backupReadFailed');
    } finally {
      busyRef.current = false;
      setOperation(null);
      setProgress(null);
    }
  };

  const restore = async () => {
    if (!selected || busyRef.current) return;
    if (mode === 'overwrite' && !confirmingOverwrite) {
      setConfirmingOverwrite(true);
      return;
    }
    busyRef.current = true;
    setOperation('restore');
    setNotice(null);
    setProgress(null);
    try {
      const next = await restoreDataBackup(selected.backup.data, mode, selected.archive, setProgress);
      setSelected(null);
      setConfirmingOverwrite(false);
      setNotice({
        error: false,
        text: t('backupRestoreSucceededWithRecords', {
          defaultValue:
            '恢复完成：{{favoriteCount}} 个收藏、{{planCount}} 个计划、{{recordDayCount}} 条巡礼记录、{{photoCount}} 张照片。',
          ...getBackupSummary(next),
        }),
      });
    } catch (error) {
      showError(error, 'backupRestoreFailed');
    } finally {
      busyRef.current = false;
      setOperation(null);
      setProgress(null);
    }
  };

  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.pageBackground?.val }}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: insets.bottom + 24 }}
      >
        <YStack width="100%" maxW={MaxContentWidth} px="$pageHorizontalInset" pt="$4" gap="$5">
          <SettingsSection title={t('backupCurrentData')}>
            <YStack py="$3" gap="$2">
              <Text fontSize="$body" lineHeight={21} fontWeight="600" color="$color12">
                {t('backupDataCounts', currentSummary)}
              </Text>
              <Text fontSize="$caption" lineHeight={18} color="$color11">
                {t('backupPlanPointCounts', currentSummary)}
              </Text>
              <Text fontSize="$caption" lineHeight={18} color="$color11">
                {t('backupPilgrimageCounts', {
                  defaultValue: '{{recordPointCount}} 个点位 · {{recordDayCount}} 条记录 · {{photoCount}} 张照片',
                  ...currentSummary,
                })}
              </Text>
            </YStack>
          </SettingsSection>

          <SettingsSection title={t('backupAndRestore')}>
            <SettingCell
              icon={FileUp}
              title={t('exportDataBackup')}
              description={t('exportDataBackupDescription')}
              disabled={busy}
              accessibilityState={{ disabled: busy }}
              onPress={() => void openExportSheet()}
              showDivider
            />
            <SettingCell
              icon={FileDown}
              title={t('restoreDataFromFile')}
              description={t('restoreDataFromFileDescription')}
              disabled={busy}
              accessibilityState={{ disabled: busy }}
              onPress={() => void chooseFile()}
            />
          </SettingsSection>

          {busy ? <Spinner color="$primary" accessibilityLabel={t('backupProcessing')} /> : null}
          {busy && progress ? (
            <Text fontSize="$caption" lineHeight={18} color="$color11" accessibilityLiveRegion="polite">
              {progress.phase === 'export'
                ? t('backupPhotoExportProgress', {
                    defaultValue: '正在打包照片，{{completed}} / {{total}}',
                    ...progress,
                  })
                : progress.phase === 'read'
                  ? t('backupPhotoReadProgress', {
                      defaultValue: '正在检查备份，{{completed}} / {{total}}',
                      ...progress,
                    })
                  : t('backupPhotoRestoreProgress', {
                      defaultValue: '正在恢复照片，{{completed}} / {{total}}',
                      ...progress,
                    })}
            </Text>
          ) : null}
          {notice ? (
            <Text
              accessibilityRole="alert"
              fontSize="$footnote"
              lineHeight={20}
              color={notice.error ? '$red10' : '$green10'}
              px="$1"
            >
              {notice.text}
            </Text>
          ) : null}

          {selected && incomingSummary ? (
            <YStack gap="$4">
              <SettingsSection title={t('backupFileSummary')}>
                <YStack py="$3" gap="$2">
                  <Text fontSize="$body" lineHeight={20} fontWeight="600" color="$color12" selectable>
                    {selected.name}
                  </Text>
                  <Text fontSize="$caption" lineHeight={18} color="$color11">
                    {t('backupExportedAt', {
                      date: new Date(selected.backup.exportedAt).toLocaleString(i18n.resolvedLanguage),
                    })}
                  </Text>
                  <Text fontSize="$body" lineHeight={21} color="$color12">
                    {formatDataCounts(selected.backup.data, incomingSummary)}
                  </Text>
                  {selected.backup.data.plans !== undefined ? (
                    <Text fontSize="$caption" lineHeight={18} color="$color11">
                      {t('backupPlanPointCounts', incomingSummary)}
                    </Text>
                  ) : null}
                  <Text fontSize="$caption" lineHeight={18} color="$color11">
                    {t('backupRestoreScopeDescription')}
                  </Text>
                  {selected.backup.data.pilgrimageRecords !== undefined ? (
                    <Text fontSize="$caption" lineHeight={18} color="$color11">
                      {t('backupPilgrimageRestoreDescription', {
                        defaultValue: '照片只恢复到应用内，不写入系统相册，也不改变计划完成状态。',
                      })}
                    </Text>
                  ) : null}
                </YStack>
              </SettingsSection>

              <SettingsSection title={t('backupRestoreMode')}>
                <SettingCell
                  title={t('backupMerge')}
                  description={t('backupMergeDescription')}
                  rightAccessory={mode === 'merge' ? <Check size={20} color="$primary" /> : <YStack width={20} />}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: mode === 'merge', disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    setMode('merge');
                    setConfirmingOverwrite(false);
                  }}
                  showDivider
                />
                <SettingCell
                  title={t('backupOverwrite')}
                  description={t('backupOverwriteDescription')}
                  rightAccessory={mode === 'overwrite' ? <Check size={20} color="$primary" /> : <YStack width={20} />}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: mode === 'overwrite', disabled: busy }}
                  disabled={busy}
                  onPress={() => {
                    setMode('overwrite');
                    setConfirmingOverwrite(false);
                  }}
                />
              </SettingsSection>

              {confirmingOverwrite ? (
                <YStack gap="$3" p="$3" rounded="$4" bg="$red2">
                  <Text fontSize="$body" lineHeight={20} fontWeight="600" color="$red11">
                    {t('backupConfirmOverwrite')}
                  </Text>
                  <Text fontSize="$caption" lineHeight={18} color="$red11">
                    {t('backupOverwriteWarning', {
                      dataCounts: formatDataCounts(selected.backup.data, currentSummary),
                    })}
                  </Text>
                  <Button bg="$red10" color="white" disabled={busy} onPress={restore}>
                    {t('backupConfirmOverwrite')}
                  </Button>
                  <Button bg="$color3" color="$color12" disabled={busy} onPress={() => setConfirmingOverwrite(false)}>
                    {t('cancel')}
                  </Button>
                </YStack>
              ) : (
                <Button bg="$primary" color="white" disabled={busy} onPress={restore}>
                  {t('backupStartRestore')}
                </Button>
              )}
            </YStack>
          ) : null}
        </YStack>
      </ScrollView>
      <TrueSheet
        ref={exportSheetRef}
        detents={['auto']}
        cornerRadius={18}
        backgroundColor={theme.color2.val}
        grabberOptions={{ color: theme.primary.val, adaptive: false, topMargin: 8, width: 42, height: 5 }}
        dismissible={!busy}
        draggable={!busy}
      >
        <YStack px="$4" pt="$5" pb="$4" gap="$4">
          <Text fontSize="$subtitle" lineHeight={22} fontWeight="700" color="$color12">
            {t('exportDataBackup')}
          </Text>
          <SettingsSection title={t('backupExportScope')}>
            <SettingCell
              title={t('backupFavoriteData')}
              description={t('backupFavoriteCounts', currentSummary)}
              rightAccessory={
                exportSelection.favoritePoints ? (
                  <SquareCheckBig size={23} color="$primary" />
                ) : (
                  <Square size={23} color="$color8" />
                )
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: exportSelection.favoritePoints, disabled: busy }}
              disabled={busy}
              onPress={() => setExportSelection((current) => ({ ...current, favoritePoints: !current.favoritePoints }))}
              showDivider
            />
            <SettingCell
              title={t('backupPlanData')}
              description={t('backupPlanCounts', currentSummary)}
              rightAccessory={
                exportSelection.plans ? (
                  <SquareCheckBig size={23} color="$primary" />
                ) : (
                  <Square size={23} color="$color8" />
                )
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: exportSelection.plans, disabled: busy }}
              disabled={busy}
              onPress={() => setExportSelection((current) => ({ ...current, plans: !current.plans }))}
              showDivider
            />
            <SettingCell
              title={t('backupPilgrimageData', { defaultValue: '巡礼记录（含照片）' })}
              description={`${t('backupPilgrimageCounts', { defaultValue: '{{recordPointCount}} 个点位 · {{recordDayCount}} 条记录 · {{photoCount}} 张照片', ...currentSummary })}\n${t('backupEstimatedPhotoSize', { defaultValue: '照片约 {{size}}', size: `${(photoBytes / 1024 / 1024).toFixed(1)} MB` })}`}
              rightAccessory={
                exportSelection.pilgrimageRecords ? (
                  <SquareCheckBig size={23} color="$primary" />
                ) : (
                  <Square size={23} color="$color8" />
                )
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: exportSelection.pilgrimageRecords, disabled: busy }}
              disabled={busy}
              onPress={() =>
                setExportSelection((current) => ({ ...current, pilgrimageRecords: !current.pilgrimageRecords }))
              }
            />
          </SettingsSection>
          <Text fontSize="$caption" lineHeight={18} color="$color11" px="$1">
            {t('backupScopeDescription')}
          </Text>
          {notice?.error ? (
            <Text accessibilityRole="alert" fontSize="$footnote" lineHeight={20} color="$red10" px="$1">
              {notice.text}
            </Text>
          ) : null}
          <XStack gap="$3">
            <Button
              flex={1}
              bg="$color4"
              color="$color12"
              disabled={busy}
              onPress={() =>
                void exportSheetRef.current?.dismiss().catch((error) => showError(error, 'backupExportFailed'))
              }
            >
              {t('cancel')}
            </Button>
            <Button
              flex={1}
              bg="$primary"
              color="white"
              disabled={busy || !hasExportSelection}
              accessibilityState={{ disabled: busy || !hasExportSelection }}
              opacity={busy || !hasExportSelection ? 0.5 : 1}
              onPress={() => void exportBackup()}
            >
              {t('exportDataBackup')}
            </Button>
          </XStack>
        </YStack>
      </TrueSheet>
    </>
  );
}
