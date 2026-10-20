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
import { getCurrentAppDisplayVersion } from '@/services/app-update';
import { useFavoritePoints } from '@/store/use-favorite-points';
import { usePlans } from '@/store/use-plans';
import { MaxContentWidth } from '@/tamagui.config';
import { TrueSheet } from '@lodev09/react-native-true-sheet';
import { Check, FileDown, FileUp, Square, SquareCheckBig } from '@tamagui/lucide-icons-2';
import { useRef, useState } from 'react';
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
  const [exportSelection, setExportSelection] = useState<BackupSelection>({ favoritePoints: true, plans: true });
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof pickDataBackup>>>(null);
  const [mode, setMode] = useState<BackupRestoreMode>('merge');
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false);
  const [operation, setOperation] = useState<'export' | 'pick' | 'restore' | null>(null);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const exportSheetRef = useRef<TrueSheet>(null);
  const busyRef = useRef(false);
  const busy = operation !== null;
  const hasExportSelection = exportSelection.favoritePoints || exportSelection.plans;
  const currentSummary = getBackupSummary({ favoritePoints, plans, planListSortOrder });
  const incomingSummary = selected ? getBackupSummary(selected.backup.data) : null;
  const formatDataCounts = (data: BackupContents, summary = getBackupSummary(data)) => {
    if (data.favoritePoints === undefined) return t('backupPlanCounts', summary);
    if (data.plans === undefined) return t('backupFavoriteCounts', summary);
    return t('backupDataCounts', summary);
  };
  const errorKeys: Record<BackupError['code'], TranslationKey> = {
    invalid: 'backupInvalidData',
    wrongType: 'backupWrongFileType',
    unsupportedVersion: 'backupUnsupportedVersion',
    migrationFailed: 'backupMigrationFailed',
    tooLarge: 'backupFileTooLarge',
    writeFailed: 'backupWriteFailed',
    rollbackFailed: 'backupRollbackFailed',
  };

  const showError = (error: unknown, fallback: TranslationKey) => {
    setNotice({ error: true, text: t(error instanceof BackupError ? errorKeys[error.code] : fallback) });
  };

  const openExportSheet = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setNotice(null);
    try {
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
    try {
      // Finish closing the native sheet before presenting the system share dialog.
      await exportSheetRef.current?.dismiss();
      await exportDataBackup(selectBackupData(getCurrentBackupData(), exportSelection), getCurrentAppDisplayVersion());
    } catch (error) {
      showError(error, 'backupExportFailed');
    } finally {
      busyRef.current = false;
      setOperation(null);
    }
  };

  const chooseFile = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setOperation('pick');
    setNotice(null);
    setConfirmingOverwrite(false);
    try {
      const result = await pickDataBackup();
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
    }
  };

  const restore = () => {
    if (!selected || busyRef.current) return;
    if (mode === 'overwrite' && !confirmingOverwrite) {
      setConfirmingOverwrite(true);
      return;
    }
    busyRef.current = true;
    setOperation('restore');
    setNotice(null);
    try {
      const next = restoreDataBackup(selected.backup.data, mode);
      setSelected(null);
      setConfirmingOverwrite(false);
      setNotice({ error: false, text: t('backupRestoreSucceeded', getBackupSummary(next)) });
    } catch (error) {
      showError(error, 'backupRestoreFailed');
    } finally {
      busyRef.current = false;
      setOperation(null);
    }
  };

  return (
    <>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1, backgroundColor: theme.pageBackground?.val }}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: insets.bottom + 24 }}
      >
        <YStack width="100%" maxW={MaxContentWidth} px="$4" pt="$4" gap="$5">
          <SettingsSection title={t('backupCurrentData')}>
            <YStack py="$3" gap="$2">
              <Text fontSize="$body" lineHeight={21} fontWeight="600" color="$color12">
                {t('backupDataCounts', currentSummary)}
              </Text>
              <Text fontSize="$caption" lineHeight={18} color="$color11">
                {t('backupPlanPointCounts', currentSummary)}
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
