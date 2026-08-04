/**
 * Toast 模块主入口
 * 
 * 基于 getActivity/Toaster 封装的 Expo Modules，提供跨平台的 Toast 消息提示功能。
 * 
 * @example
 * ```ts
 * import Toast from '@modules/toaster';
 * 
 * Toast.show('操作成功');
 * Toast.success('保存成功');
 * Toast.error('保存失败');
 * ```
 */

// Reexport the native module. On web, it will be resolved to ToasterModule.web.ts
// and on native platforms to ToasterModule.ts
import NativeToaster from './src/ToasterModule';

import type { ToastConfig, ToastOptions, ToastStyleOptions } from './src/Toaster.types';

export * from './src/Toaster.types';

type PresetType = 'success' | 'error' | 'info' | 'warning';

/**
 * 全局配置对象
 */
const config: Required<ToastConfig> = {
  defaultOptions: {
    duration: 'short',
    position: 'bottom',
    xOffset: 0,
    yOffset: 0, // top/bottom 位置时会自动添加默认偏移值，避免紧贴屏幕边缘
  },
  presetStyles: {
    success: { backgroundColor: '#52C41A' },   // Ant Design green-6
    error: { backgroundColor: '#FF4D4F' },     // Ant Design red-5
    warning: { backgroundColor: '#FAAD14' },   // Ant Design gold-6
    info: { backgroundColor: '#1890FF' },      // Ant Design blue-6
  },
};

/**
 * 合并样式对象
 */
const mergeStyle = (a?: ToastStyleOptions, b?: ToastStyleOptions): ToastStyleOptions => {
  return { ...(a || {}), ...(b || {}) };
};

/**
 * 构建最终的 Toast 选项
 * @param options 用户传入的选项
 * @param preset 预设类型（success/error/warning/info）
 */
const buildOptions = (options?: ToastOptions, preset?: PresetType): ToastOptions => {
  const presetStyle = preset ? config.presetStyles[preset] : undefined;
  
  // 提取默认样式、预设样式和用户样式
  const defaultStyle = config.defaultOptions.style;
  
  // 按优先级合并样式：defaultStyle < presetStyle < options?.style
  const mergedStyle = mergeStyle(
    mergeStyle(defaultStyle, presetStyle),
    options?.style
  );
  
  // 构建最终选项，确保样式正确合并
  const { style: _, ...defaultOptionsWithoutStyle } = config.defaultOptions;
  const { style: __, ...optionsWithoutStyle } = options || {};
  
  return {
    ...defaultOptionsWithoutStyle,
    ...optionsWithoutStyle,
    style: mergedStyle,
  };
};

/**
 * 显示 Toast 消息
 * 
 * @param message - 要显示的消息文本
 * @param options - 可选配置项
 * 
 * @example
 * ```ts
 * Toast.show('操作成功');
 * Toast.show('顶部提示', { position: 'top' });
 * Toast.show('自定义样式', {
 *   style: {
 *     backgroundColor: '#111111',
 *     textColor: '#ffffff',
 *   },
 * });
 * ```
 */
const show = (message: string, options?: ToastOptions): void => {
  NativeToaster.showWithOptions(message, buildOptions(options));
};

/**
 * 创建预设样式的 Toast 显示函数
 * @param preset - 预设类型
 */
const showPreset = (preset: PresetType) => {
  /**
   * 显示预设样式的 Toast
   * 
   * @param message - 要显示的消息文本
   * @param options - 可选配置项（会与预设样式合并）
   */
  return (message: string, options?: ToastOptions): void => {
    NativeToaster.showWithOptions(message, buildOptions(options, preset));
  };
};

/**
 * 隐藏当前显示的 Toast
 * 
 * @example
 * ```ts
 * Toast.hide();
 * ```
 */
const hide = (): void => {
  NativeToaster.cancel();
};

/**
 * 配置全局默认选项和预设样式
 * 
 * 当设置 `defaultOptions.style` 时，会自动同步到原生层的默认样式。
 * 
 * @param partial - 部分配置对象
 * 
 * @example
 * ```ts
 * Toast.config({
 *   defaultOptions: {
 *     duration: 'short',
 *     position: 'bottom',
 *     style: {
 *       backgroundColor: '#111111',
 *       textColor: '#ffffff',
 *     },
 *   },
 *   presetStyles: {
 *     success: { backgroundColor: '#16A34A' },
 *   },
 * });
 * ```
 */
const configure = (partial: ToastConfig): void => {
  if (partial.defaultOptions) {
    const hadStyle = !!config.defaultOptions.style;
    config.defaultOptions = { ...config.defaultOptions, ...partial.defaultOptions };
    
    // 如果设置了 style，同步到原生层
    if (partial.defaultOptions.style) {
      NativeToaster.setDefaultStyle(partial.defaultOptions.style);
    } else if (hadStyle && !partial.defaultOptions.style) {
      // 如果之前有 style 但现在移除了，重置原生层样式
      NativeToaster.setDefaultStyle(null);
    }
  }
  if (partial.presetStyles) {
    config.presetStyles = { ...config.presetStyles, ...partial.presetStyles };
  }
};

/**
 * 强制使用系统 Toast（不推荐）
 * 
 * ⚠️ 警告：此方法会强制使用 Android 系统 Toast，可能触发 `base.apk I/O error`。
 * 仅在特殊场景下使用，日常开发请使用 `Toast.show()`。
 * 
 * @param message - 要显示的消息文本
 */
const showSystem = (message: string): void => {
  NativeToaster.showSystem(message);
};

/**
 * 原生模块的直接引用，用于高级用法
 * 
 * 一般不推荐直接使用，优先使用封装好的 `Toast.show()` 等方法。
 */
const Native = NativeToaster;

/**
 * Toast API 对象
 */
const Toast = {
  /**
   * 显示 Toast 消息
   */
  show,
  
  /**
   * 显示成功样式的 Toast
   */
  success: showPreset('success'),
  
  /**
   * 显示错误样式的 Toast
   */
  error: showPreset('error'),
  
  /**
   * 显示警告样式的 Toast
   */
  warning: showPreset('warning'),
  
  /**
   * 显示信息样式的 Toast
   */
  info: showPreset('info'),
  
  /**
   * 隐藏当前 Toast
   */
  hide,
  
  /**
   * 配置全局默认选项和预设样式
   */
  config: configure,
  
  /**
   * 强制使用系统 Toast（不推荐）
   */
  showSystem,
  
  /**
   * 原生模块引用（高级用法）
   */
  Native,
} as const;

export default Toast;
