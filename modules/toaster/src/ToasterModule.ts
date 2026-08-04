import { NativeModule, requireNativeModule } from 'expo';

import type { ToastStyleOptions, ToasterModuleEvents } from './Toaster.types';

/**
 * Toaster 原生模块接口
 * 
 * 此接口定义了与 Android 原生模块的通信协议。
 * 在 iOS/Web 平台上，这些方法都是空实现（no-op）。
 */
declare class ToasterModule extends NativeModule<ToasterModuleEvents> {
  /**
   * 是否支持 Toast 功能
   * 
   * - Android: `true`
   * - iOS/Web: `false`
   */
  isSupported: boolean;
  
  /**
   * 初始化 Toaster 库
   * 
   * 通常在应用启动时自动调用，也可手动调用。
   */
  init(): void;
  
  /**
   * 检查 Toaster 库是否已初始化
   * 
   * @returns `true` 如果已初始化，否则返回 `false`
   */
  isInit(): boolean;
  
  /**
   * 显示 Toast（使用默认配置）
   * 
   * @param message - 要显示的消息文本
   */
  show(message: string): void;
  
  /**
   * 显示 Toast（支持自定义选项）
   * 
   * @param message - 要显示的消息文本
   * @param options - Toast 选项（duration/position/offset/style 等）
   */
  showWithOptions(message: string, options?: Record<string, any> | null): void;
  
  /**
   * 显示短时长 Toast
   * 
   * @param message - 要显示的消息文本
   */
  showShort(message: string): void;
  
  /**
   * 显示长时长 Toast
   * 
   * @param message - 要显示的消息文本
   */
  showLong(message: string): void;
  
  /**
   * 调试模式下显示 Toast
   * 
   * 仅在 Debug 模式下生效，Release 模式下不会显示。
   * 
   * @param message - 要显示的消息文本
   */
  debugShow(message: string): void;
  
  /**
   * 延迟显示 Toast
   * 
   * @param message - 要显示的消息文本
   * @param delayMillis - 延迟时间（毫秒）
   */
  delayedShow(message: string, delayMillis: number): void;
  
  /**
   * 强制使用系统 Toast（不推荐）
   * 
   * ⚠️ 警告：可能触发 `base.apk I/O error`。
   * 
   * @param message - 要显示的消息文本
   */
  showSystem(message: string): void;
  
  /**
   * 取消当前显示的 Toast
   */
  cancel(): void;
  
  /**
   * 设置原生 Toast 的默认样式。
   * 传入 `null` 时恢复原生默认样式。
   */
  setDefaultStyle(style: ToastStyleOptions | null): void;
  
  
  /**
   * 设置 Toast 位置（全局）
   * 
   * @param gravity - Android Gravity 常量（如 `Gravity.TOP`）
   */
  setGravity(gravity: number): void;
  
  /**
   * 设置 Toast 位置和偏移（全局）
   * 
   * @param gravity - Android Gravity 常量
   * @param xOffset - 水平偏移量（单位：dp）
   * @param yOffset - 垂直偏移量（单位：dp）
   */
  setGravityWithOffset(gravity: number, xOffset: number, yOffset: number): void;
}

/**
 * 加载 Toaster 原生模块
 * 
 * 在 Android 平台上返回真实的原生模块实现，
 * 在 iOS/Web 平台上返回空实现（no-op）。
 */
export default requireNativeModule<ToasterModule>('Toaster');
