import ExpoModulesCore

public final class ToasterModule: Module {
  private let toastManager = ToastManager.shared

  public func definition() -> ModuleDefinition {
    Name("Toaster")

    OnAppEntersForeground {
      self.toastManager.flushPendingToast()
    }

    OnAppBecomesActive {
      self.toastManager.flushPendingToast()
    }

    OnDestroy {
      self.toastManager.cancel()
    }

    Constant("isSupported") { true }

    Function("init") {
      self.toastManager.initialize()
    }

    Function("isInit") { true }

    Function("show") { (message: String) in
      self.toastManager.enqueue(message: message)
    }

    Function("showWithOptions") { (message: String, options: [String: Any]?) in
      self.toastManager.enqueue(message: message, options: options)
    }

    Function("showShort") { (message: String) in
      self.toastManager.enqueue(message: message, duration: .short)
    }

    Function("showLong") { (message: String) in
      self.toastManager.enqueue(message: message, duration: .long)
    }

    Function("debugShow") { (message: String) in
      #if DEBUG
      self.toastManager.enqueue(message: message)
      #endif
    }

    Function("delayedShow") { (message: String, delayMillis: Double) in
      self.toastManager.enqueue(message: message, delay: max(0, delayMillis / 1000.0))
    }

    // iOS has no system Toast equivalent, so this deliberately uses the normal presentation path.
    Function("showSystem") { (message: String) in
      self.toastManager.enqueue(message: message)
    }

    Function("cancel") {
      self.toastManager.cancel()
    }

    Function("setDefaultStyle") { (style: [String: Any]?) in
      self.toastManager.setDefaultStyle(style)
    }

    // Kept for Android API compatibility. JS uses semantic positions instead.
    Function("setGravity") { (_: Int) in }
    Function("setGravityWithOffset") { (_: Int, _: Int, _: Int) in }
  }
}
