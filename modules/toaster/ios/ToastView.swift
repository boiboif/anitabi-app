import UIKit

/// Toast 视图配置
struct ToastStyle {
  var backgroundColor: UIColor = UIColor(white: 0, alpha: 0.8)
  var textColor: UIColor = .white
  var textSize: CGFloat = 14
  var borderRadius: CGFloat = 10
  var paddingHorizontal: CGFloat = 16
  var paddingVertical: CGFloat = 10
  var maxLines: Int = 2
}

/// Toast 显示位置
enum ToastPosition {
  case top
  case center
  case bottom
}

/// Toast 显示时长
enum ToastDuration {
  case short  // 约 2 秒
  case long   // 约 3.5 秒
  
  var timeInterval: TimeInterval {
    switch self {
    case .short:
      return 2.0
    case .long:
      return 3.5
    }
  }
}

/// 自定义 Toast 视图
class ToastView: UIView {
  private let messageLabel: UILabel
  private var hideTimer: Timer?
  private var hideCompletion: (() -> Void)?
  
  init(message: String, style: ToastStyle) {
    messageLabel = UILabel()
    super.init(frame: .zero)
    
    setupView(message: message, style: style)
  }
  
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
  
  private func setupView(message: String, style: ToastStyle) {
    // 配置容器
    backgroundColor = style.backgroundColor
    layer.cornerRadius = style.borderRadius
    layer.masksToBounds = true
    
    // 性能优化：对于简单的 Toast 视图，启用光栅化可以提升动画性能
    // 但只在视图稳定后启用，避免影响首次渲染
    layer.shouldRasterize = false
    
    // 配置标签
    messageLabel.text = message
    messageLabel.textColor = style.textColor
    messageLabel.font = UIFont.systemFont(ofSize: style.textSize)
    messageLabel.textAlignment = .center
    messageLabel.numberOfLines = style.maxLines
    messageLabel.lineBreakMode = .byTruncatingTail
    
    addSubview(messageLabel)
    messageLabel.translatesAutoresizingMaskIntoConstraints = false
    
    NSLayoutConstraint.activate([
      messageLabel.topAnchor.constraint(equalTo: topAnchor, constant: style.paddingVertical),
      messageLabel.leadingAnchor.constraint(equalTo: leadingAnchor, constant: style.paddingHorizontal),
      messageLabel.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -style.paddingHorizontal),
      messageLabel.bottomAnchor.constraint(equalTo: bottomAnchor, constant: -style.paddingVertical),
    ])
  }
  
  /// 显示 Toast（带动画）
  /// 必须在主线程调用（ToastManager 已确保）
  func show(in window: UIWindow, position: ToastPosition, xOffset: CGFloat, yOffset: CGFloat, duration: ToastDuration, completion: @escaping () -> Void) {
    // ToastManager 已确保在主线程，这里不再重复检查以提升性能
    hideCompletion = completion
    
    // 添加到窗口
    window.addSubview(self)
    translatesAutoresizingMaskIntoConstraints = false
    
    // 设置位置约束
    let centerXConstraint = centerXAnchor.constraint(equalTo: window.centerXAnchor, constant: xOffset)
    var positionConstraint: NSLayoutConstraint
    
    switch position {
    case .top:
      let defaultTopSpacing: CGFloat = 16
      let topOffset = yOffset == 0 ? defaultTopSpacing : yOffset
      if #available(iOS 11.0, *) {
        positionConstraint = topAnchor.constraint(equalTo: window.safeAreaLayoutGuide.topAnchor, constant: topOffset)
      } else {
        // iOS 11 以下使用 topLayoutGuide（已废弃但兼容）
        positionConstraint = topAnchor.constraint(equalTo: window.topAnchor, constant: topOffset + 20) // 20 是状态栏高度
      }
    case .center:
      positionConstraint = centerYAnchor.constraint(equalTo: window.centerYAnchor, constant: yOffset)
    case .bottom:
      let defaultBottomSpacing: CGFloat = 48
      let bottomOffset = yOffset == 0 ? -defaultBottomSpacing : -yOffset
      if #available(iOS 11.0, *) {
        positionConstraint = bottomAnchor.constraint(equalTo: window.safeAreaLayoutGuide.bottomAnchor, constant: bottomOffset)
      } else {
        // iOS 11 以下直接使用 window bottom
        positionConstraint = bottomAnchor.constraint(equalTo: window.bottomAnchor, constant: bottomOffset)
      }
    }
    
    NSLayoutConstraint.activate([
      centerXConstraint,
      positionConstraint,
      leadingAnchor.constraint(greaterThanOrEqualTo: window.leadingAnchor, constant: 16),
      trailingAnchor.constraint(lessThanOrEqualTo: window.trailingAnchor, constant: -16),
    ])
    
    // 初始状态：透明且缩小
    alpha = 0
    transform = CGAffineTransform(scaleX: 0.8, y: 0.8)
    
    // 显示动画
    UIView.animate(withDuration: 0.3, delay: 0, usingSpringWithDamping: 0.7, initialSpringVelocity: 0.5, options: [.curveEaseOut, .allowUserInteraction]) {
      self.alpha = 1
      self.transform = .identity
    } completion: { _ in
      // 动画完成后启用光栅化，提升后续动画性能
      self.layer.shouldRasterize = true
      self.layer.rasterizationScale = UIScreen.main.scale
    }
    
    // Keep the timeout running while the user is scrolling.
    let timer = Timer(timeInterval: duration.timeInterval, repeats: false) { [weak self] timer in
      timer.invalidate()
      self?.hide()
    }
    RunLoop.main.add(timer, forMode: .common)
    hideTimer = timer
  }
  
  /// 隐藏 Toast（带动画）
  func hide() {
    hide(animated: true)
  }
  
  /// 隐藏 Toast
  /// - Parameter animated: 是否使用动画
  /// 必须在主线程调用（ToastManager 已确保）
  func hide(animated: Bool) {
    // ToastManager 已确保在主线程，这里不再重复检查以提升性能
    hideTimer?.invalidate()
    hideTimer = nil
    
    if animated {
      // 禁用光栅化，准备动画
      layer.shouldRasterize = false
      
      UIView.animate(withDuration: 0.2, animations: {
        self.alpha = 0
        self.transform = CGAffineTransform(scaleX: 0.8, y: 0.8)
      }) { _ in
        self.removeFromSuperview()
        self.hideCompletion?()
        self.hideCompletion = nil
      }
    } else {
      // 立即移除，不等待动画
      layer.shouldRasterize = false
      removeFromSuperview()
      hideCompletion?()
      hideCompletion = nil
    }
  }
  
  deinit {
    hideTimer?.invalidate()
  }
}

