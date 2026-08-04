# Toast（Expo Modules）

基于 [getActivity/Toaster](https://github.com/getActivity/Toaster) 封装的 Expo Modules 模块，提供跨平台的 Toast 消息提示功能。

## 平台支持

- **Android**：✅ 完整实现，底层依赖 `com.github.getActivity:Toaster:13.8`
- **iOS**：✅ 完整实现，使用原生 UIKit 自定义实现，支持 iOS 12.0+
- **Web**：✅ 空实现（no-op），保证跨平台调用不报错

## 安装/集成

本仓库已内置 `modules/toaster`，无需额外安装。

## 快速开始

```ts
import Toast from '@modules/toaster';

// 基础用法
Toast.show('操作成功');
Toast.success('保存成功');
Toast.error('保存失败');
Toast.warning('请注意');
Toast.info('提示信息');
```

## API 文档

### Toast.show()

显示 Toast 消息。

```ts
Toast.show(message: string, options?: ToastOptions): void
```

**参数：**
- `message` - 要显示的消息文本
- `options` - 可选配置项（见下方 `ToastOptions`）

**示例：**
```ts
Toast.show('这是一条消息');
Toast.show('顶部提示', { position: 'top' });
Toast.show('自定义样式', {
  style: {
    backgroundColor: '#111111',
    textColor: '#ffffff',
  },
});
```

### Toast.success() / error() / warning() / info()

显示预设样式的 Toast（仅 JS 层样式，不影响原生）。

```ts
Toast.success(message: string, options?: ToastOptions): void
Toast.error(message: string, options?: ToastOptions): void
Toast.warning(message: string, options?: ToastOptions): void
Toast.info(message: string, options?: ToastOptions): void
```

**示例：**
```ts
Toast.success('保存成功');
Toast.error('网络错误，请重试');
Toast.warning('请注意数据安全');
Toast.info('新功能已上线');
```

### Toast.hide()

隐藏当前显示的 Toast。

```ts
Toast.hide(): void
```

### Toast.config()

配置全局默认选项和预设样式。

当设置 `defaultOptions.style` 时，会自动同步到原生层的默认样式（Android 和 iOS 都支持）。

```ts
Toast.config(config: ToastConfig): void
```

**示例：**
```ts
Toast.config({
  defaultOptions: {
    duration: 'short',
    position: 'bottom',
    yOffset: 0,
    style: {
      backgroundColor: '#111111',
      textColor: '#ffffff',
      textSize: 14,
      borderRadius: 8,
    },
  },
  presetStyles: {
    success: { backgroundColor: '#16A34A' },
    error: { backgroundColor: '#DC2626' },
    warning: { backgroundColor: '#F59E0B' },
    info: { backgroundColor: '#3B82F6' },
  },
});
```

### Toast.showSystem()

强制使用系统 Toast（仅 Android，不推荐，可能触发 `base.apk I/O error`）。

在 iOS 上，此方法与 `Toast.show()` 行为一致。

```ts
Toast.showSystem(message: string): void
```

## 类型定义

### ToastOptions

```ts
interface ToastOptions {
  /** 显示时长，仅支持 'short' | 'long'。未指定时由 Toaster 自动决定（文本长度 > 20 走长吐司） */
  duration?: 'short' | 'long';
  
  /** Toast 位置 */
  position?: 'top' | 'center' | 'bottom';
  
  /** 水平偏移量（单位：dp） */
  xOffset?: number;
  
  /** 垂直偏移量（单位：dp）。top/bottom 位置时，如果为 0 会自动添加默认偏移值（避免紧贴屏幕边缘） */
  yOffset?: number;
  
  /** 自定义样式 */
  style?: ToastStyleOptions;
}
```

### ToastStyleOptions

```ts
interface ToastStyleOptions {
  /** 背景颜色，支持 '#RRGGBB' / '#AARRGGBB' / 0xAARRGGBB(number) */
  backgroundColor?: string | number;
  
  /** 文字颜色，支持 '#RRGGBB' / '#AARRGGBB' / 0xAARRGGBB(number) */
  textColor?: string | number;
  
  /** 文字大小（单位：sp） */
  textSize?: number;
  
  /** 圆角半径（单位：dp） */
  borderRadius?: number;
  
  /** 水平内边距（单位：dp） */
  paddingHorizontal?: number;
  
  /** 垂直内边距（单位：dp） */
  paddingVertical?: number;
  
  /** 最大行数 */
  maxLines?: number;
}
```

### ToastConfig

```ts
interface ToastConfig {
  /** 全局默认选项 */
  defaultOptions?: ToastOptions;
  
  /** 预设样式（仅用于 JS 层 success/error/info/warning） */
  presetStyles?: Partial<Record<'success' | 'error' | 'info' | 'warning', ToastStyleOptions>>;
}
```

## 完整示例

```ts
import Toast from '@modules/toaster';

// 1. 基础用法
Toast.show('你好，世界！');

// 2. 预设样式
Toast.success('保存成功');
Toast.error('操作失败');

// 3. 位置控制
Toast.show('顶部提示', {
  position: 'top',
  yOffset: 8, // 额外偏移（会叠加在默认偏移值之上）
});

Toast.show('底部提示', {
  position: 'bottom',
});

Toast.show('居中提示', {
  position: 'center',
});

// 4. 自定义样式
Toast.show('自定义样式', {
  style: {
    backgroundColor: '#111111',
    textColor: '#ffffff',
    textSize: 16,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    maxLines: 2,
  },
});

// 5. 全局配置（包括原生默认样式）
Toast.config({
  defaultOptions: {
    duration: 'short',
    position: 'bottom',
    yOffset: 0,
    style: {
      backgroundColor: '#111111',
      textColor: '#ffffff',
      textSize: 14,
      borderRadius: 8,
    },
  },
  presetStyles: {
    success: { backgroundColor: '#16A34A', textColor: '#ffffff' },
    error: { backgroundColor: '#DC2626', textColor: '#ffffff' },
  },
});

// 6. 隐藏 Toast
Toast.hide();
```

## 注意事项

1. **duration 参数**：仅支持 `'short'` 和 `'long'` 枚举值，不支持自定义毫秒数。未指定时，Toaster 库会根据文本长度自动决定（文本长度 > 20 走长吐司）。

2. **位置偏移**：
   - `top` 位置：如果 `yOffset` 为 0，会自动添加 16dp 的默认顶部偏移
   - `bottom` 位置：如果 `yOffset` 为 0，会自动添加 48dp 的默认底部偏移
   - `center` 位置：不添加默认偏移
   - 用户自定义的 `yOffset` 会叠加在默认偏移值之上

3. **样式优先级**：
   - `Toast.show()` 的 `style` 参数优先级最高
   - `Toast.config()` 的 `presetStyles` 次之
   - `Toast.config()` 的 `defaultOptions.style` 设置的原生默认样式作为 fallback

4. **平台差异**：
   - **Android**：完整实现，底层使用 `com.github.getActivity:Toaster` 库
     - 优先使用 `ActivityToast`（WindowManager 实现），避免触发系统 Toast 的 `base.apk I/O error`
     - 如果无法获取 Activity，会回退到系统 Toast（可能触发 I/O error）
   - **iOS**：完整实现，使用原生 UIKit 自定义实现
     - 支持 iOS 12.0+，兼容不同 iOS 版本
     - 自动处理线程安全，所有 UI 操作在主线程执行
     - 支持 Safe Area，适配刘海屏等特殊屏幕
     - 显示新 Toast 时会自动取消上一个 Toast，避免重叠
   - **Web**：空实现（no-op），调用不会报错但也不会显示 Toast

5. **iOS 版本兼容性**：
   - 最低支持 iOS 12.0
   - 自动适配 iOS 11+ 的 `safeAreaLayoutGuide` API
   - 兼容 iOS 13+ 和 iOS 13 以下的窗口获取方式
   - 所有 UI 操作自动切换到主线程，确保线程安全

## 技术实现

### Android
- 底层依赖：[getActivity/Toaster](https://github.com/getActivity/Toaster) 13.8
- 实现方式：优先使用 `ActivityToast`（WindowManager），回退到系统 Toast

### iOS
- 实现方式：原生 UIKit 自定义实现
- 最低版本：iOS 12.0
- 特性：
  - 自定义 `ToastView` 视图，支持完整的样式定制
  - 自动处理线程安全，所有操作在主线程执行
  - 支持 Safe Area，适配各种屏幕
  - 平滑的显示/隐藏动画
  - 自动取消上一个 Toast，避免重叠

## 相关链接

- [getActivity/Toaster 源码](https://github.com/getActivity/Toaster)（Android 端依赖）
- [getActivity/Toaster 文档](https://github.com/getActivity/Toaster/blob/master/README.md)
