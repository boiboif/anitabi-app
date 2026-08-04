import type { StyleProp, ViewStyle } from 'react-native';

/**
 * 事件负载类型（保留用于未来扩展）
 */
export type OnLoadEventPayload = {
  url: string;
};

/**
 * Toaster 模块事件类型
 */
export type ToasterModuleEvents = Record<string, never>;

/**
 * ToasterView 组件属性（保留用于未来扩展）
 */
export type ToasterViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Toast 显示位置
 */
export type ToastPosition = 'top' | 'center' | 'bottom';

/**
 * Toast 显示时长
 * 
 * - `'short'`: 短时长（约 2 秒）
 * - `'long'`: 长时长（约 3.5 秒）
 * 
 * 未指定时，Toaster 库会根据文本长度自动决定（文本长度 > 20 走长吐司）
 */
export type ToastDuration = 'short' | 'long';

/**
 * Toast 样式配置选项
 */
export type ToastStyleOptions = {
  /**
   * 背景颜色
   * 
   * 支持格式：
   * - `'#RRGGBB'` - 6 位十六进制颜色
   * - `'#AARRGGBB'` - 8 位十六进制颜色（包含透明度）
   * - `0xAARRGGBB` - 数字格式的颜色值
   * 
   * @example
   * ```ts
   * backgroundColor: '#111111'
   * backgroundColor: '#FF111111'
   * backgroundColor: 0xFF111111
   * ```
   */
  backgroundColor?: string | number;
  
  /**
   * 文字颜色
   * 
   * 支持格式同 `backgroundColor`
   * 
   * @example
   * ```ts
   * textColor: '#ffffff'
   * textColor: '#FFFFFFFF'
   * textColor: 0xFFFFFFFF
   * ```
   */
  textColor?: string | number;
  
  /**
   * 文字大小（单位：sp）
   * 
   * @default 14
   */
  textSize?: number;
  
  /**
   * 圆角半径（单位：dp）
   * 
   * @default 10
   */
  borderRadius?: number;
  
  /**
   * 水平内边距（单位：dp）
   * 
   * @default 24
   */
  paddingHorizontal?: number;
  
  /**
   * 垂直内边距（单位：dp）
   * 
   * @default 16
   */
  paddingVertical?: number;
  
  /**
   * 最大行数
   * 
   * @default 2
   */
  maxLines?: number;
};

/**
 * Toast 显示选项
 */
export type ToastOptions = {
  /**
   * 显示时长
   * 
   * 仅支持 `'short'` 和 `'long'` 枚举值，不支持自定义毫秒数。
   * 未指定时，Toaster 库会根据文本长度自动决定（文本长度 > 20 走长吐司）。
   */
  duration?: ToastDuration;
  
  /**
   * Toast 位置
   * 
   * - `'top'`: 顶部（如果 yOffset 为 0，会自动添加 16dp 默认偏移）
   * - `'center'`: 居中
   * - `'bottom'`: 底部（如果 yOffset 为 0，会自动添加 48dp 默认偏移）
   * 
   * @default 'bottom'
   */
  position?: ToastPosition;
  
  /**
   * 水平偏移量（单位：dp）
   * 
   * @default 0
   */
  xOffset?: number;
  
  /**
   * 垂直偏移量（单位：dp）
   * 
   * 注意：
   * - `top` 位置：如果为 0，会自动添加 16dp 的默认顶部偏移
   * - `bottom` 位置：如果为 0，会自动添加 48dp 的默认底部偏移
   * - `center` 位置：不添加默认偏移
   * - 用户自定义的 `yOffset` 会叠加在默认偏移值之上
   * 
   * @default 0
   */
  yOffset?: number;
  
  /**
   * 自定义样式
   * 
   * 会覆盖全局默认样式和预设样式。
   */
  style?: ToastStyleOptions;
};

/**
 * Toast 全局配置
 */
export type ToastConfig = {
  /**
   * 全局默认选项
   * 
   * 会与每次调用 `Toast.show()` 时传入的 `options` 合并。
   */
  defaultOptions?: ToastOptions;
  
  /**
   * 预设样式
   * 
   * 仅用于 JS 层的 `Toast.success()` / `error()` / `warning()` / `info()` 方法。
   * 这些样式不会影响 Android 原生 Toast 的默认样式。
   */
  presetStyles?: Partial<Record<'success' | 'error' | 'info' | 'warning', ToastStyleOptions>>;
};
