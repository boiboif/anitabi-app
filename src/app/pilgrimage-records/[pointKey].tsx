import ImagePreview, { type ImagePreviewBounds, type PreviewImage } from '@/components/image-preview/image-preview';
import { StrictButton as Button } from '@/components/ui/strict-button';
import { getPilgrimagePhotoUri, PilgrimagePhotoCleanupError } from '@/lib/pilgrimage-record-files';
import { filterPilgrimageDays, isPilgrimageDateRangeValid } from '@/lib/pilgrimage-record-query';
import type { PilgrimageDay, PilgrimagePhoto } from '@/lib/pilgrimage-records';
import { ICON_BUTTON_ICON_SIZE } from '@/lib/ui-sizes';
import { deletePilgrimageSelection, type PilgrimageDeleteSelection } from '@/services/pilgrimage-records';
import { usePilgrimageRecords } from '@/store/use-pilgrimage-records';
import { MaxContentWidth, PageHorizontalInset } from '@/tamagui.config';
import { FlashList } from '@shopify/flash-list';
import { Pencil, Square, SquareCheckBig, SquareMinus } from '@tamagui/lucide-icons-2';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useIsFocused, useLocalSearchParams, usePreventRemove, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, BackHandler, Pressable, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, useTheme, View, XStack, YStack } from 'tamagui';

type RecordRow =
  | { key: string; type: 'day'; day: PilgrimageDay }
  | { key: string; type: 'photos'; photos: PilgrimagePhoto[] }
  | { key: string; type: 'empty' };

function singleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

export default function PilgrimagePointRecordsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    pointKey?: string | string[];
    startDate?: string | string[];
    endDate?: string | string[];
  }>();
  const pointKey = singleParam(params.pointKey);
  const point = usePilgrimageRecords((state) => state.points.find((item) => item.key === pointKey));
  const loadError = usePilgrimageRecords((state) => state.loadError);
  const [showAllDates, setShowAllDates] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selection, setSelection] = useState<PilgrimageDeleteSelection | null>(null);
  const [session, setSession] = useState<{ images: PreviewImage[]; initialIndex: number } | null>(null);
  const thumbnailRefs = useRef<Record<string, ViewInstance | null>>({});
  const previewBounds = useRef<Record<string, ImagePreviewBounds>>({});
  const requestedRange = { startDate: singleParam(params.startDate), endDate: singleParam(params.endDate) };
  const range =
    !showAllDates && isPilgrimageDateRangeValid(requestedRange) ? requestedRange : { startDate: '', endDate: '' };
  const hasDateFilter = !!(range.startDate || range.endDate);
  const days = filterPilgrimageDays(point?.days ?? [], range);
  const photos = days.flatMap((day) => day.photos);
  const isFocused = useIsFocused();
  const selecting = !!point && selection !== null;
  const selectedDateKeys = new Set(selection?.dateKeys);
  const selectedPhotoIds = new Set(selection?.photoIds);
  const selectedDays = days.filter((day) => selectedDateKeys.has(day.dateKey));
  const selectedPhotos = days.flatMap((day) =>
    selectedDateKeys.has(day.dateKey) ? day.photos : day.photos.filter((photo) => selectedPhotoIds.has(photo.id)),
  );
  const checkedPhotoIds = new Set(selectedPhotos.map((photo) => photo.id));
  const hasSelection = selectedDays.length > 0 || selectedPhotos.length > 0;
  const allSelected = days.length > 0 && selectedDays.length === days.length;
  const rows: RecordRow[] = days.flatMap((day) => {
    const dayRows: RecordRow[] = [{ key: day.dateKey, type: 'day', day }];
    if (!day.photos.length) dayRows.push({ key: `${day.dateKey}:empty`, type: 'empty' });
    for (let index = 0; index < day.photos.length; index += 3) {
      dayRows.push({ key: `${day.dateKey}:${index}`, type: 'photos', photos: day.photos.slice(index, index + 3) });
    }
    return dayRows;
  });
  const stickyHeaderIndices = rows.flatMap((row, index) => (row.type === 'day' ? [index] : []));

  // Back leaves this local editing step before leaving the record detail page.
  usePreventRemove(isFocused && (selecting || deleting), () => {
    if (!deleting) setSelection(null);
  });
  useFocusEffect(
    useCallback(() => {
      if (!selecting && !deleting) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!deleting) setSelection(null);
        return true;
      });
      return () => subscription.remove();
    }, [selecting, deleting, setSelection]),
  );

  const exitDeleteMode = () => {
    if (!deleting) setSelection(null);
  };

  const toggleDay = (day: PilgrimageDay) => {
    if (!selecting || deleting) return;
    setSelection((current) => {
      if (!current) return current;
      const dateKeys = new Set(current.dateKeys);
      if (dateKeys.has(day.dateKey)) dateKeys.delete(day.dateKey);
      else dateKeys.add(day.dateKey);
      const dayPhotoIds = new Set(day.photos.map((photo) => photo.id));
      return { dateKeys: [...dateKeys], photoIds: current.photoIds.filter((id) => !dayPhotoIds.has(id)) };
    });
  };

  const togglePhoto = (photoId: string) => {
    if (!selecting || deleting) return;
    const day = days.find((entry) => entry.photos.some((photo) => photo.id === photoId));
    if (!day) return;
    setSelection((current) => {
      if (!current) return current;
      const dateKeys = new Set(current.dateKeys);
      const photoIds = new Set(current.photoIds);
      if (dateKeys.delete(day.dateKey)) {
        // Keep the day record while leaving the other photos selected.
        for (const photo of day.photos) {
          if (photo.id !== photoId) photoIds.add(photo.id);
          else photoIds.delete(photo.id);
        }
      } else if (photoIds.has(photoId)) photoIds.delete(photoId);
      else photoIds.add(photoId);
      return { dateKeys: [...dateKeys], photoIds: [...photoIds] };
    });
  };

  const toggleAll = () => {
    if (!selecting || deleting) return;
    setSelection({ dateKeys: allSelected ? [] : days.map((day) => day.dateKey), photoIds: [] });
  };

  const deleteRecords = async (target: PilgrimageDeleteSelection) => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deletePilgrimageSelection(pointKey, target);
      setSelection(null);
    } catch (error) {
      const cleanupFailed = error instanceof PilgrimagePhotoCleanupError;
      if (cleanupFailed) setSelection(null);
      Alert.alert(
        t(cleanupFailed ? 'pilgrimageRecordsSelectionCleanupFailed' : 'pilgrimageRecordsDeleteFailed'),
        t(cleanupFailed ? 'pilgrimageRecordsSelectionCleanupFailedHint' : 'pilgrimageRecordsDeleteFailedHint'),
      );
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (!selecting || deleting || !hasSelection) return;
    const target: PilgrimageDeleteSelection = {
      dateKeys: selectedDays.map((day) => day.dateKey),
      photoIds: days.flatMap((day) =>
        selectedDateKeys.has(day.dateKey)
          ? []
          : day.photos.filter((photo) => selectedPhotoIds.has(photo.id)).map((photo) => photo.id),
      ),
    };
    Alert.alert(
      t('pilgrimageRecordsDeleteSelected'),
      t('pilgrimageRecordsDeleteSelectionConfirm', { days: selectedDays.length, photos: selectedPhotos.length }),
      [
        { text: t('cancel'), style: 'cancel' },
        { text: t('delete'), style: 'destructive', onPress: () => void deleteRecords(target) },
      ],
    );
  };

  const enterDeleteMode = () => {
    if (deleting || selecting || session || !days.length) return;
    setSelection({ dateKeys: [], photoIds: [] });
  };

  const openPhoto = (photoId: string) => {
    if (deleting) return;
    if (selecting) {
      togglePhoto(photoId);
      return;
    }
    const images = photos.map((photo) => ({
      id: photo.id,
      uri: getPilgrimagePhotoUri(photo),
      width: photo.width,
      height: photo.height,
    }));
    const initialIndex = images.findIndex((photo) => photo.id === photoId);
    if (initialIndex < 0) return;
    const open = () => setSession({ images, initialIndex });
    const thumbnail = thumbnailRefs.current[photoId];
    if (thumbnail) {
      thumbnail.measureInWindow((x, y, width, height) => {
        previewBounds.current = { [photoId]: { x, y, width, height, contentFit: 'cover', borderRadius: 8 } };
        open();
      });
    } else open();
  };

  const filterNotice = hasDateFilter ? (
    <XStack mx="$pageHorizontalInset" mt="$2" gap="$2" items="center" bg="$background" px="$2" py="$1" rounded="$3">
      <Text flex={1} minW={0} color="$color11" fontSize="$footnote">
        {t('pilgrimageRecordsShowingDateRange', { start: range.startDate || '…', end: range.endDate || '…' })}
      </Text>
      <Button
        chromeless
        size="$2"
        fontSize="$footnote"
        px="$2"
        shrink={0}
        color="$primary"
        disabled={deleting}
        onPress={() => {
          if (deleting) return;
          setSelection(null);
          setShowAllDates(true);
        }}
      >
        {t('pilgrimageRecordsClearFilters')}
      </Button>
    </XStack>
  ) : null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: point ? '' : t('pilgrimageRecords'),
          headerShadowVisible: false,
          headerStyle: { backgroundColor: theme.pageBackground.val },
          headerTintColor: theme.color12.val,
          headerBackButtonDisplayMode: 'minimal',
          headerRight: () =>
            selecting ? (
              <Button chromeless size="$3" disabled={deleting} onPress={exitDeleteMode} aria-label={t('cancel')}>
                {t('cancel')}
              </Button>
            ) : (
              <Button
                chromeless
                circular
                size="$3"
                color={!days.length || deleting ? '$color8' : '$color12'}
                disabled={!days.length || deleting}
                icon={<Pencil size={ICON_BUTTON_ICON_SIZE} strokeWidth={2} />}
                onPress={enterDeleteMode}
                aria-label={t('pilgrimageRecordsEdit')}
              />
            ),
        }}
      />
      <View flex={1} bg="$pageBackground" items="center">
        <View flex={1} width="100%" maxW={MaxContentWidth}>
          {point ? (
            <YStack px="$pageHorizontalInset" pb="$1" gap="$1">
              <Text fontSize="$heading" fontWeight="700" color="$color12" selectable>
                {point.snapshot.pointName}
              </Text>
              <Text fontSize="$footnote" color="$color11" selectable>
                {point.snapshot.bangumiName}
              </Text>
              <Text fontSize="$footnote" color="$color11">
                {t('pilgrimageRecordsCounts', { days: days.length, photos: photos.length })}
              </Text>
            </YStack>
          ) : null}
          {filterNotice}
          <FlashList
            data={rows}
            extraData={{ selection, deleting }}
            keyExtractor={(row) => row.key}
            getItemType={(row) => row.type}
            stickyHeaderIndices={stickyHeaderIndices}
            stickyHeaderConfig={{ hideRelatedCell: true }}
            contentInsetAdjustmentBehavior="automatic"
            style={{ flex: 1, backgroundColor: theme.pageBackground.val }}
            contentContainerStyle={{
              paddingHorizontal: PageHorizontalInset,
              paddingBottom: selecting ? 24 : insets.bottom + 24,
            }}
            renderItem={({ item, target }) => {
              if (item.type === 'day') {
                const selected = selectedDateKeys.has(item.day.dateKey);
                const partial = !selected && item.day.photos.some((photo) => selectedPhotoIds.has(photo.id));
                return (
                  <Pressable
                    testID={`pilgrimage-record-day-${item.day.dateKey}`}
                    disabled={!selecting || deleting}
                    accessible={selecting}
                    accessibilityRole={selecting ? 'checkbox' : undefined}
                    accessibilityLabel={
                      selecting ? t('pilgrimageRecordsSelectDay', { date: item.day.dateKey }) : undefined
                    }
                    accessibilityState={
                      selecting ? { checked: selected ? true : partial ? 'mixed' : false } : undefined
                    }
                    onPress={() => toggleDay(item.day)}
                  >
                    <XStack
                      items="center"
                      gap="$2"
                      bg="$pageBackground"
                      px={target === 'StickyHeader' ? '$pageHorizontalInset' : 0}
                      pt="$3"
                      pb="$2"
                    >
                      {selecting ? (
                        selected ? (
                          <SquareCheckBig size={23} color="$primary" strokeWidth={2.5} />
                        ) : partial ? (
                          <SquareMinus size={23} color="$primary" />
                        ) : (
                          <Square size={23} color="$color8" />
                        )
                      ) : null}
                      <YStack flex={1} gap="$1">
                        <Text fontSize="$body" fontWeight="600" color="$color12" selectable={!selecting}>
                          {item.day.dateKey}
                        </Text>
                        <Text fontSize="$caption" color="$color11">
                          {t('pilgrimageRecordsPhotoCount', { count: item.day.photos.length })}
                        </Text>
                      </YStack>
                    </XStack>
                  </Pressable>
                );
              }
              if (item.type === 'empty') {
                return (
                  <YStack bg="$background" rounded="$3" p="$3" mb="$2">
                    <Text fontSize="$footnote" color="$color11">
                      {t('pilgrimageRecordsNoPhotos')}
                    </Text>
                  </YStack>
                );
              }
              return (
                <XStack gap="$2" pb="$2">
                  {[0, 1, 2].map((index) => {
                    const photo = item.photos[index];
                    if (!photo) return <View key={`empty:${index}`} flex={1} />;
                    const selected = checkedPhotoIds.has(photo.id);
                    return (
                      <View key={photo.id} flex={1} aspectRatio={1} rounded="$2" overflow="hidden" bg="$color4">
                        <Pressable
                          testID={`pilgrimage-record-photo-${photo.id}`}
                          ref={(node) => {
                            thumbnailRefs.current[photo.id] = node;
                          }}
                          collapsable={false}
                          style={{ flex: 1 }}
                          accessibilityRole={selecting ? 'checkbox' : 'button'}
                          accessibilityState={selecting ? { checked: selected } : undefined}
                          disabled={deleting}
                          accessibilityLabel={t(selecting ? 'pilgrimageRecordsSelectPhoto' : 'openImagePreview', {
                            index: photos.findIndex((item) => item.id === photo.id) + 1,
                          })}
                          onPress={() => openPhoto(photo.id)}
                        >
                          <Image
                            source={{ uri: getPilgrimagePhotoUri(photo) }}
                            recyclingKey={photo.id}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                            accessible={false}
                          />
                          {selecting ? (
                            <>
                              {selected ? (
                                <View
                                  pointerEvents="none"
                                  position="absolute"
                                  t={0}
                                  r={0}
                                  b={0}
                                  l={0}
                                  rounded="$2"
                                  borderWidth={2}
                                  borderColor="$primary"
                                />
                              ) : null}
                              <View pointerEvents="none" position="absolute" t="$1" r="$1">
                                {selected ? (
                                  <SquareCheckBig size={23} color="$primary" strokeWidth={2.5} />
                                ) : (
                                  <Square size={23} color="$color8" />
                                )}
                              </View>
                            </>
                          ) : null}
                        </Pressable>
                      </View>
                    );
                  })}
                </XStack>
              );
            }}
            ListEmptyComponent={
              <YStack minH={220} justify="center" items="center" gap="$3" px="$3">
                <Text
                  fontSize="$body"
                  color="$color11"
                  text="center"
                  accessibilityRole={loadError ? 'alert' : undefined}
                >
                  {t(
                    loadError
                      ? 'pilgrimageRecordsLoadFailed'
                      : hasDateFilter && point
                        ? 'pilgrimageRecordsNoMatches'
                        : 'pilgrimageRecordsPointEmpty',
                  )}
                </Text>
                {loadError ? (
                  <Text fontSize="$footnote" color="$color11" text="center">
                    {t('pilgrimageRecordsLoadFailedHint')}
                  </Text>
                ) : null}
                <Button bg="$color3" color="$color12" onPress={() => router.back()}>
                  {t('pilgrimageRecordsBackToList')}
                </Button>
              </YStack>
            }
          />
          {selecting ? (
            <XStack
              shrink={0}
              items="center"
              gap="$2"
              px="$pageHorizontalInset"
              pt="$2"
              pb={Math.max(insets.bottom, 12)}
              bg="$pageBackground"
              borderTopWidth={1}
              borderTopColor="$color5"
            >
              <Button
                chromeless
                size="$3"
                color="$primary"
                disabled={deleting}
                onPress={toggleAll}
                aria-label={t(allSelected ? 'pilgrimageRecordsDeselectAll' : 'pilgrimageRecordsSelectAll')}
              >
                {t(allSelected ? 'pilgrimageRecordsDeselectAll' : 'pilgrimageRecordsSelectAll')}
              </Button>
              <Text flex={1} minW={0} fontSize="$caption" color="$color11">
                {t('pilgrimageRecordsSelectionCount', { days: selectedDays.length, photos: selectedPhotos.length })}
              </Text>
              <Button
                size="$3"
                fontSize="$footnote"
                color={hasSelection ? '$red9' : '$color8'}
                bg="$color2"
                variant="outlined"
                borderColor={hasSelection ? '$red9' : '$color5'}
                disabled={!hasSelection || deleting}
                onPress={confirmDelete}
                aria-label={t('pilgrimageRecordsDeleteSelected')}
              >
                {t('pilgrimageRecordsDeleteSelected')}
              </Button>
            </XStack>
          ) : null}
        </View>
      </View>
      {session ? (
        <ImagePreview
          visible
          images={session.images}
          initialIndex={session.initialIndex}
          getSourceBounds={(index) => previewBounds.current[session.images[index].id] ?? null}
          onClose={() => setSession(null)}
        />
      ) : null}
    </>
  );
}
