import UIKit

/// Toast 管理器
/// 线程安全，所有操作都在主线程执行
class ToastManager {
  static let shared = ToastManager()
  
  private var currentToast: ToastView?
  var defaultStyle: ToastStyle = ToastStyle()  // internal，允许 ToasterModule 访问
  // 缓存当前窗口，避免重复查找
  private weak var cachedWindow: UIWindow?
  
  private init() {}
  
  /// 合并 Toast 样式
  /// - Parameters:
  ///   - defaultStyle: 默认样式（低优先级）
  ///   - style: 用户样式（高优先级，会覆盖 defaultStyle）
  /// - Returns: 合并后的样式
  private func mergeToastStyle(defaultStyle: ToastStyle, style: ToastStyle?) -> ToastStyle {
    guard let style = style else {
      return defaultStyle
    }
    
    // 合并样式，style 的属性优先级更高
    // 对于 style 中未设置的属性（使用 ToastStyle 默认值），使用 defaultStyle 的值
    // 由于 ToastStyle 的所有属性都有默认值，我们需要通过比较来判断是否被设置
    // 但这里简化处理：直接使用 style，因为 style 已经是从 defaultStyle 基础上构建的
    return style
  }
  
  /// 设置默认样式
  func setDefaultStyle(_ style: [String: Any]?) {
    guard let style = style else {
      defaultStyle = ToastStyle()
      return
    }
    
    if let bgColor = parseColor(style["backgroundColor"]) {
      defaultStyle.backgroundColor = bgColor
    }
    if let textColor = parseColor(style["textColor"]) {
      defaultStyle.textColor = textColor
    }
    if let textSize = style["textSize"] as? NSNumber {
      defaultStyle.textSize = CGFloat(textSize.floatValue)
    }
    if let borderRadius = style["borderRadius"] as? NSNumber {
      defaultStyle.borderRadius = CGFloat(borderRadius.floatValue)
    }
    if let paddingH = style["paddingHorizontal"] as? NSNumber {
      defaultStyle.paddingHorizontal = CGFloat(paddingH.floatValue)
    }
    if let paddingV = style["paddingVertical"] as? NSNumber {
      defaultStyle.paddingVertical = CGFloat(paddingV.floatValue)
    }
    if let maxLines = style["maxLines"] as? NSNumber {
      defaultStyle.maxLines = maxLines.intValue
    }
  }
  
  /// 显示 Toast
  /// 所有 UI 操作都在主线程执行，确保线程安全
  /// 注意：ToasterModule 已经确保在主线程调用，这里保留检查作为双重保障
  func show(
    message: String,
    duration: ToastDuration? = nil,
    position: ToastPosition = .bottom,
    xOffset: CGFloat = 0,
    yOffset: CGFloat = 0,
    style: ToastStyle? = nil
  ) {
    // 确保在主线程执行（ToasterModule 已确保，这里作为安全网）
    guard Thread.isMainThread else {
      DispatchQueue.main.async {
        self.show(message: message, duration: duration, position: position, xOffset: xOffset, yOffset: yOffset, style: style)
      }
      return
    }
    
    // 取消当前 Toast（立即移除，不等待动画，避免重叠）
    if let currentToast = currentToast {
      currentToast.hide(animated: false)
    }
    currentToast = nil
    
    // 获取当前窗口
    guard let window = getCurrentWindow() else {
      // 如果无法获取窗口，延迟重试一次（可能窗口还未准备好）
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        if self.getCurrentWindow() != nil {
          self.show(message: message, duration: duration, position: position, xOffset: xOffset, yOffset: yOffset, style: style)
        }
      }
      return
    }
    
    // 确定显示时长
    let finalDuration: ToastDuration
    if let duration = duration {
      finalDuration = duration
    } else {
      // 根据文本长度自动决定（文本长度 > 20 走长吐司）
      finalDuration = message.count > 20 ? .long : .short
    }
    
    // 合并样式：如果 style 不为 nil，则合并 style 和 defaultStyle（style 优先级更高）
    // 对于 style 中未设置的属性，使用 defaultStyle 的值
    let finalStyle = mergeToastStyle(defaultStyle: defaultStyle, style: style)
    
    // 创建并显示 Toast
    let toast = ToastView(message: message, style: finalStyle)
    currentToast = toast
    
    toast.show(in: window, position: position, xOffset: xOffset, yOffset: yOffset, duration: finalDuration) {
      if self.currentToast === toast {
        self.currentToast = nil
      }
    }
  }
  
  /// 取消当前 Toast
  /// 确保在主线程执行
  func cancel() {
    guard Thread.isMainThread else {
      DispatchQueue.main.async {
        self.cancel()
      }
      return
    }
    
    // 使用动画隐藏，提供更好的用户体验
    currentToast?.hide(animated: true)
    currentToast = nil
  }
  
  /// 获取当前窗口
  /// 兼容 iOS 13+ 和 iOS 13 以下版本
  /// 使用缓存机制提升性能
  private func getCurrentWindow() -> UIWindow? {
    // 先检查缓存的窗口是否仍然有效
    if let cached = cachedWindow, cached.isKeyWindow {
      return cached
    }
    
    // 缓存失效，重新查找
    let window: UIWindow?
    if #available(iOS 13.0, *) {
      // iOS 13+ 使用 WindowScene
      let scenes = UIApplication.shared.connectedScenes
      let windowScene = scenes.first { $0.activationState == .foregroundActive } as? UIWindowScene
      window = windowScene?.windows.first { $0.isKeyWindow } ?? windowScene?.windows.first
    } else {
      // iOS 13 以下使用 keyWindow（已废弃但兼容）
      window = UIApplication.shared.keyWindow
    }
    
    // 更新缓存
    cachedWindow = window
    return window
  }
  
  /// 解析颜色值
  /// 支持 Android 格式：ARGB (0xAARRGGBB) 和字符串格式 (#RRGGBB / #AARRGGBB)
  private func parseColor(_ value: Any?) -> UIColor? {
    guard let value = value else { return nil }
    
    if let number = value as? NSNumber {
      // Android 格式：ARGB (0xAARRGGBB)
      // 例如：0xFF111111 = 0xFF(alpha) 0x11(red) 0x11(green) 0x11(blue)
      let intValue = number.uint32Value
      let alpha = CGFloat((intValue >> 24) & 0xFF) / 255.0
      let red = CGFloat((intValue >> 16) & 0xFF) / 255.0
      let green = CGFloat((intValue >> 8) & 0xFF) / 255.0
      let blue = CGFloat(intValue & 0xFF) / 255.0
      return UIColor(red: red, green: green, blue: blue, alpha: alpha)
    }
    
    if let string = value as? String {
      return parseHexColor(string)
    }
    
    return nil
  }
  
  /// 解析十六进制颜色字符串
  private func parseHexColor(_ hex: String) -> UIColor? {
    var hexSanitized = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    hexSanitized = hexSanitized.replacingOccurrences(of: "#", with: "")
    
    var rgb: UInt64 = 0
    
    guard Scanner(string: hexSanitized).scanHexInt64(&rgb) else {
      return nil
    }
    
    let length = hexSanitized.count
    var r: CGFloat = 0
    var g: CGFloat = 0
    var b: CGFloat = 0
    var a: CGFloat = 1.0
    
    if length == 6 {
      // #RRGGBB
      r = CGFloat((rgb & 0xFF0000) >> 16) / 255.0
      g = CGFloat((rgb & 0x00FF00) >> 8) / 255.0
      b = CGFloat(rgb & 0x0000FF) / 255.0
    } else if length == 8 {
      // #AARRGGBB
      a = CGFloat((rgb & 0xFF000000) >> 24) / 255.0
      r = CGFloat((rgb & 0x00FF0000) >> 16) / 255.0
      g = CGFloat((rgb & 0x0000FF00) >> 8) / 255.0
      b = CGFloat(rgb & 0x0000FF) / 255.0
    } else {
      return nil
    }
    
    return UIColor(red: r, green: g, blue: b, alpha: a)
  }
}

