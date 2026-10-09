import { CAMERA_RATIO_OPTIONS, formatCameraRatio, type CameraRatioPreference } from '@/lib/comparison-camera-geometry';
import { getOutsidePressRegions, type WindowRect } from '@/lib/outside-press-regions';
import { ChevronLeft } from '@tamagui/lucide-icons-2';
import { type ComponentRef, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Portal, ScrollView, Text, View, XStack } from 'tamagui';

type Props = {
  value: CameraRatioPreference;
  actualRatio: number;
  disabled?: boolean;
  rotation?: SharedValue<number>;
  landscape?: boolean;
  /** Close on outside press or Android system back while expanded. */
  dismissOnOutside?: boolean;
  onChange: (value: CameraRatioPreference) => void;
};

const TRANSITION_DURATION = 220;
const PICKER_HEIGHT = 32;
const LABEL_HORIZONTAL_PADDING = 10;

type MeasurableView =
  | { measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void }
  | { getBoundingClientRect: () => { left: number; top: number; width: number; height: number } };

function measureView(view: MeasurableView | null, onMeasure: (rect: WindowRect) => void) {
  if (!view) return;
  if ('measureInWindow' in view) {
    view.measureInWindow((x, y, width, height) => onMeasure({ x, y, width, height }));
  } else if ('getBoundingClientRect' in view) {
    const rect = view.getBoundingClientRect();
    onMeasure({ x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  }
}

function RotatingContent({
  rotation,
  layout,
  children,
}: {
  rotation?: SharedValue<number>;
  layout?: { width: number; height: number };
  children: ReactNode;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation?.get() ?? 0}deg` }],
  }));
  return <Animated.View style={[layout, animatedStyle]}>{children}</Animated.View>;
}

export default function CameraRatioPicker({
  value,
  actualRatio,
  disabled = false,
  rotation,
  landscape = false,
  dismissOnOutside = false,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [contentSize, setContentSize] = useState({ width: 0, height: 0 });
  const [anchorBounds, setAnchorBounds] = useState<WindowRect>();
  const [portalBounds, setPortalBounds] = useState<WindowRect>();
  const anchorRef = useRef<ComponentRef<typeof View>>(null);
  const portalRef = useRef<ComponentRef<typeof View>>(null);
  const measurementRequest = useRef(0);
  const windowSize = useWindowDimensions();
  const progress = useSharedValue(0);
  const contentWidth =
    contentSize.width > 0 ? (landscape ? contentSize.height : contentSize.width) + LABEL_HORIZONTAL_PADDING * 2 + 2 : 0;
  const expandedWidth = availableWidth || contentWidth;
  const collapsedWidth = Math.min(contentWidth, expandedWidth);
  const label = `${value === 'auto' ? `${t('cameraRatioAutomatic', { defaultValue: '自动' })} · ` : ''}${formatCameraRatio(actualRatio)}`;
  const compactAutomatic = landscape && value === 'auto';
  const visualLabel = compactAutomatic
    ? `${t('cameraRatioAutomatic', { defaultValue: '自动' })}\n${formatCameraRatio(actualRatio)}`
    : label;

  const containerStyle = useAnimatedStyle(() => ({
    width: collapsedWidth + (expandedWidth - collapsedWidth) * progress.get(),
    opacity: disabled ? 0.38 : 1,
  }));
  const collapsedStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, 1 - progress.get() * 3) }));
  const expandedStyle = useAnimatedStyle(() => ({
    opacity: Math.max(0, (progress.get() - 0.25) / 0.75),
    transform: [{ translateX: (1 - progress.get()) * 6 }],
  }));

  // Stable identity is needed by the system-back subscription below.
  const close = useCallback(() => {
    measurementRequest.current += 1;
    setExpanded(false);
    progress.set(
      withTiming(0, {
        duration: TRANSITION_DURATION,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [progress]);

  const setOpen = (next: boolean) => {
    if (!next) {
      close();
      return;
    }
    const request = ++measurementRequest.current;
    const open = () => {
      if (measurementRequest.current !== request) return;
      setExpanded(true);
      progress.set(
        withTiming(1, {
          duration: TRANSITION_DURATION,
          easing: Easing.out(Easing.cubic),
        }),
      );
    };
    if (dismissOnOutside) {
      measureView(anchorRef.current, (bounds) => {
        if (measurementRequest.current !== request || bounds.width <= 0 || bounds.height <= 0) return;
        setAnchorBounds(bounds);
        setPortalBounds(undefined);
        open();
      });
    } else {
      open();
    }
  };

  useEffect(
    () => () => {
      measurementRequest.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (!expanded || !dismissOnOutside) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [expanded, dismissOnOutside, close]);

  const viewport = portalBounds ?? { x: 0, y: 0, width: windowSize.width, height: windowSize.height };
  const outsideRegions = anchorBounds
    ? getOutsidePressRegions(viewport, {
        ...anchorBounds,
        y: anchorBounds.y + (anchorBounds.height - PICKER_HEIGHT) / 2,
        height: PICKER_HEIGHT,
      })
    : [];

  return (
    <View
      ref={anchorRef}
      collapsable={false}
      flex={1}
      minW={0}
      height={44}
      items="center"
      justify="center"
      onLayout={({ nativeEvent: { layout } }) => {
        setAvailableWidth(layout.width);
        if (expanded && dismissOnOutside) {
          const request = measurementRequest.current;
          measureView(anchorRef.current, (bounds) => {
            if (measurementRequest.current === request) setAnchorBounds(bounds);
          });
        }
      }}
    >
      {/* Measure outside the animated container so its width cannot constrain the label measurement. */}
      <View
        position="absolute"
        l={0}
        r={0}
        t={0}
        height={PICKER_HEIGHT}
        opacity={0}
        pointerEvents="none"
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text
          color="white"
          fontSize="$caption"
          fontWeight="600"
          numberOfLines={compactAutomatic ? 2 : 1}
          lineHeight={compactAutomatic ? 12 : undefined}
          text="center"
          onTextLayout={({ nativeEvent: { lines } }) => {
            const textWidth = Math.max(0, ...lines.map((line) => line.width));
            if (!lines.length || textWidth <= 0) return;
            const textHeight =
              Math.max(...lines.map((line) => line.y + line.height)) - Math.min(...lines.map((line) => line.y));
            setContentSize((current) =>
              current.width === Math.ceil(textWidth) && current.height === Math.ceil(textHeight)
                ? current
                : { width: Math.ceil(textWidth), height: Math.ceil(textHeight) },
            );
          }}
        >
          {visualLabel}
        </Text>
      </View>
      <Animated.View style={containerStyle}>
        <View height={PICKER_HEIGHT} bg="#242426" rounded="$9" overflow="hidden">
          <Animated.View
            style={[StyleSheet.absoluteFill, collapsedStyle]}
            pointerEvents={expanded ? 'none' : 'auto'}
            accessibilityElementsHidden={expanded}
            importantForAccessibility={expanded ? 'no-hide-descendants' : 'auto'}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${t('cameraAspectRatio', { defaultValue: '拍摄比例' })}: ${label}`}
              accessibilityState={{ expanded, disabled }}
              accessibilityHint={value === 'auto' ? t('cameraRatioAutomaticHint') : undefined}
              disabled={disabled}
              onPress={() => setOpen(true)}
              style={{ flex: 1 }}
            >
              <XStack flex={1} px={LABEL_HORIZONTAL_PADDING} items="center" justify="center">
                <RotatingContent
                  rotation={rotation}
                  layout={{ width: contentSize.width + 2, height: contentSize.height }}
                >
                  <Text
                    color="white"
                    fontSize="$caption"
                    fontWeight="600"
                    numberOfLines={compactAutomatic ? 2 : 1}
                    lineHeight={compactAutomatic ? 12 : undefined}
                    text="center"
                    shrink={0}
                  >
                    {visualLabel}
                  </Text>
                </RotatingContent>
              </XStack>
            </Pressable>
          </Animated.View>
          <Animated.View
            style={[StyleSheet.absoluteFill, expandedStyle]}
            pointerEvents={expanded ? 'auto' : 'none'}
            accessibilityElementsHidden={!expanded}
            importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}
          >
            <XStack height={PICKER_HEIGHT} px={4} gap={2} items="center">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('collapseCameraAspectRatios', { defaultValue: '收起比例选项' })}
                disabled={disabled}
                onPress={() => setOpen(false)}
              >
                <View width={28} height={PICKER_HEIGHT} items="center" justify="center">
                  <RotatingContent rotation={rotation}>
                    <ChevronLeft size={14} color="#c7c7cc" />
                  </RotatingContent>
                </View>
              </Pressable>
              <ScrollView
                horizontal
                flex={1}
                minW={0}
                showsHorizontalScrollIndicator={false}
                scrollEnabled={expanded && !disabled}
                contentContainerStyle={{ grow: 1, items: 'center', justify: 'center' }}
              >
                <XStack height={PICKER_HEIGHT} gap={2} items="center">
                  {CAMERA_RATIO_OPTIONS.map((option) => {
                    const selected = option === value;
                    return (
                      <Pressable
                        key={option}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: selected, disabled }}
                        disabled={disabled}
                        onPress={() => {
                          onChange(option);
                          setOpen(false);
                        }}
                      >
                        <View
                          minW={36}
                          height={PICKER_HEIGHT}
                          px={4}
                          rounded="$9"
                          items="center"
                          justify="center"
                          bg={selected ? '#343438' : 'transparent'}
                        >
                          <RotatingContent rotation={rotation}>
                            <Text
                              color={selected ? '$primary' : '#c7c7cc'}
                              fontSize="$caption"
                              fontWeight={selected ? '700' : '500'}
                            >
                              {option === 'auto' ? t('cameraRatioAutomatic', { defaultValue: '自动' }) : option}
                            </Text>
                          </RotatingContent>
                        </View>
                      </Pressable>
                    );
                  })}
                </XStack>
              </ScrollView>
            </XStack>
          </Animated.View>
        </View>
      </Animated.View>
      {expanded && dismissOnOutside && anchorBounds ? (
        <Portal>
          <View
            ref={portalRef}
            collapsable={false}
            position="absolute"
            t={0}
            r={0}
            b={0}
            l={0}
            bg="transparent"
            pointerEvents="box-none"
            onLayout={() => {
              const request = measurementRequest.current;
              measureView(portalRef.current, (bounds) => {
                if (measurementRequest.current === request && bounds.width > 0 && bounds.height > 0)
                  setPortalBounds(bounds);
              });
            }}
          >
            {outsideRegions.map((region, index) => (
              <View
                key={index}
                position="absolute"
                l={region.x}
                t={region.y}
                width={region.width}
                height={region.height}
                bg="transparent"
              >
                <Pressable accessible={false} onPress={close} style={StyleSheet.absoluteFill} />
              </View>
            ))}
          </View>
        </Portal>
      ) : null}
    </View>
  );
}
