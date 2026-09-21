import { PLAN_SHARE_MAX_FILE_BYTES, parseSharedPlanFile, type SharedPlan } from '@/lib/plan-sharing';
import { usePlanImport, type PlanImportSource } from '@/store/use-plan-import';
import { Toast } from '@boiboif/react-native-toast';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function usePlanImportActions() {
  const { t } = useTranslation();
  const router = useRouter();
  const setPending = usePlanImport((state) => state.setPending);
  const importingRef = useRef(false);

  const openImport = useCallback(
    (data: SharedPlan, source: PlanImportSource) => {
      setPending(data, source);
      router.navigate('/plans/import' as never);
    },
    [router, setPending],
  );

  const scanQrCode = useCallback(() => {
    router.navigate('/plans/scan' as never);
  }, [router]);

  const importFromFile = useCallback(async () => {
    if (importingRef.current) return;
    importingRef.current = true;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', 'application/octet-stream'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (typeof asset.size === 'number' && asset.size > PLAN_SHARE_MAX_FILE_BYTES) {
        throw new Error(t('planFilesCannotExceed1Mb', { defaultValue: '计划文件不能超过 1 MB' }));
      }
      const content = asset.file ? await asset.file.text() : await new File(asset.uri).text();
      openImport(parseSharedPlanFile(content), 'file');
    } catch (error) {
      Toast.show(errorMessage(error, t('couldNotReadPilgrimagePlan', { defaultValue: '无法读取巡礼计划' })));
    } finally {
      importingRef.current = false;
    }
  }, [openImport, t]);

  return { scanQrCode, importFromFile };
}
