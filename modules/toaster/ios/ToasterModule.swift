import ExpoModulesCore

public class ToasterModule: Module {
  private let toastManager = ToastManager.shared
  
  public func definition() -> ModuleDefinition {
    Name("Toaster")

    Constant("isSupported") { true }

    Function("init") {
      // iOS 端无需初始化，直接返回
    }

    Function("isInit") {
      // iOS 端始终返回 true
      true
    }

    Function("show") { (message: String) in
      DispatchQueue.main.async {
        self.toastManager.show(message: message)
      }
    }

    Function("showShort") { (message: String) in
      DispatchQueue.main.async {
        self.toastManager.show(message: message, duration: .short)
      }
    }

    Function("showLong") { (message: String) in
      DispatchQueue.main.async {
        self.toastManager.show(message: message, duration: .long)
      }
    }

    Function("debugShow") { (message: String) in
      #if DEBUG
      DispatchQueue.main.async {
        self.toastManager.show(message: message)
      }
      #endif
    }

    Function("delayedShow") { (message: String, delayMillis: Double) in
      let delay = max(0, delayMillis / 1000.0)
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
        self.toastManager.show(message: message)
      }
    }

    Function("showSystem") { (message: String) in
      // iOS 端 showSystem 与 show 行为一致
      DispatchQueue.main.async {
        self.toastManager.show(message: message)
      }
    }

    Function("cancel") {
      DispatchQueue.main.async {
        self.toastManager.cancel()
      }
    }

    Function("showWithOptions") { (message: String, options: [String: Any]?) in
      DispatchQueue.main.async {
        self.showWithOptionsInternal(message: message, options: options)
      }
    }

    Function("setDefaultStyle") { (style: [String: Any]?) in
      self.toastManager.setDefaultStyle(style)
    }

    Function("setGravity") { (_ gravity: Int) in
      // iOS 端不支持全局 gravity 设置，此方法保留兼容性
    }

    Function("setGravityWithOffset") { (_ gravity: Int, _ xOffset: Int, _ yOffset: Int) in
      // iOS 端不支持全局 gravity 设置，此方法保留兼容性
    }
  }
  
  private func showWithOptionsInternal(message: String, options: [String: Any]?) {
    // 解析 duration
    let durationOpt = options?["duration"] as? String
    let duration: ToastDuration? = {
      switch durationOpt {
      case "short": return .short
      case "long": return .long
      default: return nil // 未指定时使用自动逻辑
      }
    }()
    
    // 解析 position
    let positionStr = options?["position"] as? String ?? "bottom"
    let position: ToastPosition = {
      switch positionStr {
      case "top": return .top
      case "center": return .center
      case "bottom": return .bottom
      default: return .bottom
      }
    }()
    
    // 解析偏移量
    let xOffset = (options?["xOffset"] as? NSNumber)?.doubleValue ?? 0
    let yOffset = (options?["yOffset"] as? NSNumber)?.doubleValue ?? 0
    
    // 解析样式
    // 使用 defaultStyle 作为基础，然后只覆盖 styleDict 中存在的属性
    let styleDict = options?["style"] as? [String: Any]
    let style: ToastStyle? = {
      guard let styleDict = styleDict else { return nil }
      
      // 从 defaultStyle 开始，而不是创建新的 ToastStyle()
      var toastStyle = toastManager.defaultStyle
      
      // 只覆盖 styleDict 中存在的属性
      if let bgColor = parseColor(styleDict["backgroundColor"]) {
        toastStyle.backgroundColor = bgColor
      }
      if let textColor = parseColor(styleDict["textColor"]) {
        toastStyle.textColor = textColor
      }
      if let textSize = styleDict["textSize"] as? NSNumber {
        toastStyle.textSize = CGFloat(textSize.floatValue)
      }
      if let borderRadius = styleDict["borderRadius"] as? NSNumber {
        toastStyle.borderRadius = CGFloat(borderRadius.floatValue)
      }
      if let paddingH = styleDict["paddingHorizontal"] as? NSNumber {
        toastStyle.paddingHorizontal = CGFloat(paddingH.floatValue)
      }
      if let paddingV = styleDict["paddingVertical"] as? NSNumber {
        toastStyle.paddingVertical = CGFloat(paddingV.floatValue)
      }
      if let maxLines = styleDict["maxLines"] as? NSNumber {
        toastStyle.maxLines = maxLines.intValue
      }
      
      return toastStyle
    }()
    
    toastManager.show(
      message: message,
      duration: duration,
      position: position,
      xOffset: CGFloat(xOffset),
      yOffset: CGFloat(yOffset),
      style: style
    )
  }
  
  private func parseColor(_ value: Any?) -> UIColor? {
    guard let value = value else { return nil }
    
    if let number = value as? NSNumber {
      // Android 格式：ARGB (0xAARRGGBB)
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
