import UIKit

final class ToastManager {
  private struct ToastRequest {
    let message: String
    let duration: ToastDuration?
    let position: ToastPosition
    let xOffset: CGFloat
    let yOffset: CGFloat
    let style: [String: Any]?
  }

  static let shared = ToastManager()

  private var currentToast: ToastView?
  private var defaultStyle = ToastStyle()
  private weak var cachedWindow: UIWindow?
  private var pendingRequest: ToastRequest?
  private var pendingExpiresAt: Date?
  private var pendingRetry: DispatchWorkItem?

  private init() {}

  func initialize() {
    performOnMain {}
  }

  func enqueue(message: String, options: [String: Any]? = nil) {
    enqueue(requestFromOptions(message: message, options: options), delay: 0)
  }

  func enqueue(message: String, duration: ToastDuration) {
    enqueue(ToastRequest(message: message, duration: duration, position: .bottom, xOffset: 0, yOffset: 0, style: nil), delay: 0)
  }

  func enqueue(message: String, delay: TimeInterval) {
    let request = ToastRequest(message: message, duration: nil, position: .bottom, xOffset: 0, yOffset: 0, style: nil)
    enqueue(request, delay: delay)
  }

  func setDefaultStyle(_ style: [String: Any]?) {
    performOnMain {
      self.defaultStyle = ToastStyle()
      if let style = style {
        self.apply(style, to: &self.defaultStyle)
      }
    }
  }

  func flushPendingToast() {
    performOnMain { self.flushPendingToastOnMain() }
  }

  func cancel() {
    performOnMain {
      self.pendingRequest = nil
      self.pendingExpiresAt = nil
      self.pendingRetry?.cancel()
      self.pendingRetry = nil
      self.currentToast?.hide(animated: true)
      self.currentToast = nil
    }
  }

  private func enqueue(_ request: ToastRequest, delay: TimeInterval) {
    performOnMain {
      if delay > 0 {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
          self.enqueueOnMain(request)
        }
      } else {
        self.enqueueOnMain(request)
      }
    }
  }

  private func enqueueOnMain(_ request: ToastRequest) {
    pendingRequest = nil
    pendingExpiresAt = nil
    pendingRetry?.cancel()
    pendingRetry = nil

    guard let window = getCurrentWindow() else {
      queuePendingToast(request)
      return
    }
    show(request, in: window)
  }

  private func queuePendingToast(_ request: ToastRequest) {
    pendingRequest = request
    pendingExpiresAt = Date().addingTimeInterval(Self.pendingToastTimeout)
    schedulePendingRetry()
  }

  private func flushPendingToastOnMain() {
    guard let request = pendingRequest else { return }
    guard let expiresAt = pendingExpiresAt, Date() < expiresAt else {
      pendingRequest = nil
      pendingExpiresAt = nil
      return
    }
    guard let window = getCurrentWindow() else {
      schedulePendingRetry()
      return
    }

    pendingRequest = nil
    pendingExpiresAt = nil
    pendingRetry?.cancel()
    pendingRetry = nil
    show(request, in: window)
  }

  private func schedulePendingRetry() {
    pendingRetry?.cancel()
    let workItem = DispatchWorkItem { [weak self] in
      self?.flushPendingToastOnMain()
    }
    pendingRetry = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + Self.pendingToastRetryDelay, execute: workItem)
  }

  private func show(_ request: ToastRequest, in window: UIWindow) {
    currentToast?.hide(animated: false)
    currentToast = nil

    let duration = request.duration ?? (request.message.count > 20 ? .long : .short)
    let toast = ToastView(message: request.message, style: resolvedStyle(request.style))
    currentToast = toast
    toast.show(
      in: window,
      position: request.position,
      xOffset: request.xOffset,
      yOffset: request.yOffset,
      duration: duration
    ) { [weak self, weak toast] in
      guard let self = self, let toast = toast, self.currentToast === toast else { return }
      self.currentToast = nil
    }
  }

  private func requestFromOptions(message: String, options: [String: Any]?) -> ToastRequest {
    let duration: ToastDuration?
    switch options?["duration"] as? String {
    case "short": duration = .short
    case "long": duration = .long
    default: duration = nil
    }

    let position: ToastPosition
    switch options?["position"] as? String {
    case "top": position = .top
    case "center": position = .center
    default: position = .bottom
    }

    let style = options?["style"] as? [String: Any]
    return ToastRequest(
      message: message,
      duration: duration,
      position: position,
      xOffset: CGFloat((options?["xOffset"] as? NSNumber)?.doubleValue ?? 0),
      yOffset: CGFloat((options?["yOffset"] as? NSNumber)?.doubleValue ?? 0),
      style: style?.isEmpty == true ? nil : style
    )
  }

  private func resolvedStyle(_ override: [String: Any]?) -> ToastStyle {
    var style = defaultStyle
    if let override = override {
      apply(override, to: &style)
    }
    return style
  }

  private func apply(_ values: [String: Any], to style: inout ToastStyle) {
    if let color = parseColor(values["backgroundColor"]) { style.backgroundColor = color }
    if let color = parseColor(values["textColor"]) { style.textColor = color }
    if let value = values["textSize"] as? NSNumber { style.textSize = CGFloat(value.floatValue) }
    if let value = values["borderRadius"] as? NSNumber { style.borderRadius = CGFloat(value.floatValue) }
    if let value = values["paddingHorizontal"] as? NSNumber { style.paddingHorizontal = CGFloat(value.floatValue) }
    if let value = values["paddingVertical"] as? NSNumber { style.paddingVertical = CGFloat(value.floatValue) }
    if let value = values["maxLines"] as? NSNumber { style.maxLines = value.intValue }
  }

  private func getCurrentWindow() -> UIWindow? {
    if let cachedWindow = cachedWindow {
      if #available(iOS 13.0, *) {
        if cachedWindow.windowScene?.activationState == .foregroundActive {
          return cachedWindow
        }
      } else {
        return cachedWindow
      }
    }

    let window: UIWindow?
    if #available(iOS 13.0, *) {
      let activeScene = UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .first { $0.activationState == .foregroundActive }
      window = activeScene?.windows.first { $0.isKeyWindow } ?? activeScene?.windows.first
    } else {
      window = UIApplication.shared.keyWindow
    }
    cachedWindow = window
    return window
  }

  private func parseColor(_ value: Any?) -> UIColor? {
    if let number = value as? NSNumber {
      let argb = number.uint32Value
      return UIColor(
        red: CGFloat((argb >> 16) & 0xFF) / 255,
        green: CGFloat((argb >> 8) & 0xFF) / 255,
        blue: CGFloat(argb & 0xFF) / 255,
        alpha: CGFloat((argb >> 24) & 0xFF) / 255
      )
    }
    guard let string = value as? String else { return nil }
    let hex = string.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: "#", with: "")
    guard hex.count == 6 || hex.count == 8, let value = UInt64(hex, radix: 16) else { return nil }

    if hex.count == 6 {
      return UIColor(
        red: CGFloat((value >> 16) & 0xFF) / 255,
        green: CGFloat((value >> 8) & 0xFF) / 255,
        blue: CGFloat(value & 0xFF) / 255,
        alpha: 1
      )
    }
    return UIColor(
      red: CGFloat((value >> 16) & 0xFF) / 255,
      green: CGFloat((value >> 8) & 0xFF) / 255,
      blue: CGFloat(value & 0xFF) / 255,
      alpha: CGFloat((value >> 24) & 0xFF) / 255
    )
  }

  private func performOnMain(_ action: @escaping () -> Void) {
    if Thread.isMainThread {
      action()
    } else {
      DispatchQueue.main.async(execute: action)
    }
  }

  private static let pendingToastRetryDelay: TimeInterval = 0.1
  private static let pendingToastTimeout: TimeInterval = 1.5
}
