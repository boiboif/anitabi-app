package expo.modules.toaster

import android.app.Activity
import android.app.Application
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import com.hjq.toast.ActivityToast
import com.hjq.toast.Toaster
import com.hjq.toast.config.IToast
import com.hjq.toast.config.IToastStyle
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ToasterModule : Module() {
  private val mainHandler = Handler(Looper.getMainLooper())
  private var lastToast: IToast? = null
  private var defaultStyle: Map<String, Any?>? = null

  override fun definition() = ModuleDefinition {

    Name("Toaster")

    OnCreate {
      // 仅在可取到 Application 的情况下初始化；避免在启动早期抛异常
      val application = getApplicationOrNull() ?: return@OnCreate
      if (!Toaster.isInit()) {
        Toaster.init(application)
      }
    }

    Constant("isSupported") { true }

    Function("init") {
      val application = getApplicationOrNull()
      if (application != null && !Toaster.isInit()) {
        Toaster.init(application)
      }
      null
    }

    Function("isInit") {
      Toaster.isInit()
    }

    // 默认优先走 ActivityToast（WindowManager），避免触发 SystemUIToast 读取 base.apk
    Function("show") { message: String ->
      showInternal(message, null, allowSystemFallback = false)
      null
    }

    // 更推荐的入口：支持 options（duration/position/offset/safeArea/style）
    // duration 仅支持枚举值 'short' | 'long'，未指定时使用 Toaster 默认逻辑
    Function("showWithOptions") { message: String, options: Map<String, Any?>? ->
      showWithOptionsInternal(message, options)
      null
    }

    Function("showShort") { message: String ->
      showInternal(message, Toast.LENGTH_SHORT, allowSystemFallback = false)
      null
    }

    Function("showLong") { message: String ->
      showInternal(message, Toast.LENGTH_LONG, allowSystemFallback = false)
      null
    }

    Function("debugShow") { message: String ->
      val application = getApplicationOrNull() ?: return@Function null
      val isDebuggable = (application.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
      if (!isDebuggable) return@Function null
      showInternal(message, null, allowSystemFallback = false)
      null
    }

    Function("delayedShow") { message: String, delayMillis: Long ->
      val delay = if (delayMillis < 0) 0 else delayMillis
      mainHandler.postDelayed(
        {
          showInternal(message, null, allowSystemFallback = false)
        },
        delay,
      )
      null
    }

    // 明确走系统 Toast（可能触发 SystemUIToast 读取 base.apk）
    Function("showSystem") { message: String ->
      val application = getApplicationOrNull() ?: return@Function null
      if (!Toaster.isInit()) {
        Toaster.init(application)
      }
      Toaster.show(message)
      null
    }

    Function("cancel") {
      lastToast?.cancel()
      lastToast = null
      Toaster.cancel()
      null
    }

    // 设置默认样式（仅影响本模块 showWithOptions/showInternal 创建的 View；不强制调用 Toaster.setStyle）
    Function("setDefaultStyle") { style: Map<String, Any?>? ->
      defaultStyle = style
      null
    }

    Function("setGravity") { gravity: Int ->
      val application = getApplicationOrNull()
      if (application != null && !Toaster.isInit()) {
        Toaster.init(application)
      }
      Toaster.setGravity(gravity)
      null
    }

    Function("setGravityWithOffset") { gravity: Int, xOffset: Int, yOffset: Int ->
      val application = getApplicationOrNull()
      if (application != null && !Toaster.isInit()) {
        Toaster.init(application)
      }
      Toaster.setGravity(gravity, xOffset, yOffset)
      null
    }
  }

  private fun getApplicationOrNull(): Application? {
    val reactContext = appContext.reactContext ?: return null
    val app = reactContext.applicationContext
    return app as? Application
  }

  private fun getCurrentActivityOrNull(): Activity? {
    return appContext.currentActivity
  }

  private fun showWithOptionsInternal(message: String, options: Map<String, Any?>?) {
    val durationOpt = options?.get("duration") as? String
    val duration: Int? = when (durationOpt) {
      "short" -> Toast.LENGTH_SHORT
      "long" -> Toast.LENGTH_LONG
      else -> null // 未指定时使用 Toaster 默认逻辑（文本长度 > 20 走长吐司）
    }

    val position = options?.get("position") as? String

    val xOffset = (options?.get("xOffset") as? Number)?.toInt() ?: 0
    val yOffset = (options?.get("yOffset") as? Number)?.toInt() ?: 0

    val style = (options?.get("style") as? Map<*, *>)?.entries
      ?.associate { it.key.toString() to it.value } ?: defaultStyle

    showInternal(
      message = message,
      duration = duration,
      allowSystemFallback = false,
      position = position,
      xOffset = xOffset,
      yOffset = yOffset,
      style = style,
    )
  }

  private fun showInternal(
    message: String,
    duration: Int? = null,
    allowSystemFallback: Boolean,
    position: String? = null,
    xOffset: Int = 0,
    yOffset: Int = 0,
    style: Map<String, Any?>? = null,
  ) {
    val application = getApplicationOrNull() ?: return
    if (!Toaster.isInit()) {
      Toaster.init(application)
    }

    val activity = getCurrentActivityOrNull()
    if (activity == null) {
      if (allowSystemFallback) {
        // 回退到系统 Toast：可能触发 SystemUIToast 读取 base.apk（某些设备/ROM 会报 I/O error）
        Toaster.show(message)
      }
      return
    }

    // 确保在主线程中执行取消和显示操作，避免线程竞争
    mainHandler.post {
      // 先取消上一个 Toast（兼容性处理：必须在创建新 Toast 之前取消，避免在某些机型上出现重叠）
      lastToast?.cancel()
      Toaster.cancel()

      val defaultToasterStyle: IToastStyle<*>? = try { Toaster.getStyle() } catch (_: Throwable) { null }

      val toast = ActivityToast(activity)

      val view = createToastView(application, style, defaultToasterStyle)
      toast.setView(view)

      val resolvedGravity = resolveGravity(position ?: "center")
      val resolvedYOffset = when (position) {
        "top" -> {
          // top 位置时，如果用户未设置 yOffset（为 0），自动添加默认顶部偏移，避免紧贴屏幕边缘
          val defaultTopSpacing = if (yOffset == 0) dp(application, 16f) else 0
          yOffset + defaultTopSpacing
        }
        "bottom" -> {
          // bottom 位置时，如果用户未设置 yOffset（为 0），自动添加默认底部偏移，避免紧贴屏幕边缘
          val defaultBottomSpacing = if (yOffset == 0) dp(application, 48f) else 0
          yOffset + defaultBottomSpacing
        }
        "center" -> {
          // center 位置时，Gravity.CENTER 是相对于窗口内容区域的中心，
          // 由于状态栏的存在，视觉上会偏下。向上偏移状态栏高度的一半来补偿
          val statusBarHeight = getStatusBarHeight(application)
          yOffset - statusBarHeight / 2
        }
        else -> yOffset
      }
      toast.setGravity(resolvedGravity, xOffset, resolvedYOffset)
      toast.setMargin(0f, 0f)

      // duration 优先级：用户指定 > Toaster 默认逻辑（文本长度 > 20 走长吐司，否则短吐司）
      val finalDuration = duration ?: if (message.length > 20) Toast.LENGTH_LONG else Toast.LENGTH_SHORT
      toast.setDuration(finalDuration)
      toast.setText(message)

      lastToast = toast
      toast.show()
    }
  }

  private fun resolveGravity(position: String): Int {
    return when (position) {
      "top" -> Gravity.TOP or Gravity.CENTER_HORIZONTAL
      "bottom" -> Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
      else -> Gravity.CENTER
    }
  }

  private fun createToastView(
    context: Application,
    style: Map<String, Any?>?,
    fallbackStyle: IToastStyle<*>?,
  ): View {
    if (style == null) {
      // 尽量复用 Toaster 当前全局 style（通常是 BlackToastStyle）
      val view = fallbackStyle?.createView(context)
      if (view != null) return view
    }

    // 纯代码创建 TextView（必须 id=android.R.id.message）
    val textView = TextView(context)
    textView.id = android.R.id.message
    textView.layoutParams = ViewGroup.LayoutParams(
      ViewGroup.LayoutParams.WRAP_CONTENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    )
    textView.gravity = Gravity.CENTER

    val textColor = parseColor(style?.get("textColor")) ?: 0XFFFFFFFF.toInt()
    val bgColor = parseColor(style?.get("backgroundColor")) ?: 0xB3000000.toInt()
    val textSizeSp = (style?.get("textSize") as? Number)?.toFloat() ?: 14f
    val radiusDp = (style?.get("borderRadius") as? Number)?.toFloat() ?: 10f
    val paddingHDp = (style?.get("paddingHorizontal") as? Number)?.toFloat() ?: 24f
    val paddingVDp = (style?.get("paddingVertical") as? Number)?.toFloat() ?: 16f
    val maxLines = (style?.get("maxLines") as? Number)?.toInt() ?: 2

    textView.setTextColor(textColor)
    textView.setTextSize(TypedValue.COMPLEX_UNIT_SP, textSizeSp)
    textView.maxLines = maxLines

    val paddingH = dp(context, paddingHDp)
    val paddingV = dp(context, paddingVDp)
    textView.setPadding(paddingH, paddingV, paddingH, paddingV)

    val drawable = GradientDrawable()
    drawable.setColor(bgColor)
    drawable.cornerRadius = dp(context, radiusDp).toFloat()
    textView.background = drawable

    return textView
  }

  private fun parseColor(value: Any?): Int? {
    return when (value) {
      is Number -> value.toInt()
      is String -> try {
        Color.parseColor(value)
      } catch (_: Throwable) {
        null
      }
      else -> null
    }
  }

  private fun dp(context: Application, dp: Float): Int {
    return TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      dp,
      context.resources.displayMetrics,
    ).toInt()
  }

  private fun getStatusBarHeight(context: Application): Int {
    val resourceId = context.resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (resourceId > 0) context.resources.getDimensionPixelSize(resourceId) else 0
  }
}
