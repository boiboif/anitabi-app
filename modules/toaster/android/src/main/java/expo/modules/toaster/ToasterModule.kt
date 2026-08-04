package expo.modules.toaster

import android.app.Activity
import android.app.Application
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
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
  private data class ToastRequest(
    val message: String,
    val duration: Int? = null,
    val position: String? = null,
    val xOffset: Int = 0,
    val yOffset: Int = 0,
    val style: Map<String, Any?>? = null,
  )

  private val mainHandler = Handler(Looper.getMainLooper())
  private var lastToast: IToast? = null
  private var defaultStyle: Map<String, Any?>? = null
  private var defaultGravity = Gravity.CENTER
  private var defaultXOffset = 0
  private var defaultYOffset = 0
  private var pendingRequest: ToastRequest? = null
  private var pendingExpiresAt = 0L
  private val pendingRetry = Runnable { flushPendingToast() }

  override fun definition() = ModuleDefinition {
    Name("Toaster")

    OnCreate {
      runOnMain {
        getApplicationOrNull()?.let(::ensureInitialized)
      }
    }

    OnActivityEntersForeground {
      runOnMain(::flushPendingToast)
    }

    OnActivityDestroys {
      runOnMain(::cancelCurrentToast)
    }

    OnDestroy {
      runOnMain {
        pendingRequest = null
        mainHandler.removeCallbacksAndMessages(null)
        cancelCurrentToast()
      }
    }

    Constant("isSupported") { true }

    Function("init") {
      runOnMain {
        getApplicationOrNull()?.let(::ensureInitialized)
      }
      null
    }

    Function("isInit") { Toaster.isInit() }

    Function("show") { message: String ->
      enqueue(ToastRequest(message = message))
      null
    }

    Function("showWithOptions") { message: String, options: Map<String, Any?>? ->
      enqueue(requestFromOptions(message, options))
      null
    }

    Function("showShort") { message: String ->
      enqueue(ToastRequest(message = message, duration = Toast.LENGTH_SHORT))
      null
    }

    Function("showLong") { message: String ->
      enqueue(ToastRequest(message = message, duration = Toast.LENGTH_LONG))
      null
    }

    Function("debugShow") { message: String ->
      val application = getApplicationOrNull() ?: return@Function null
      val isDebuggable = (application.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
      if (isDebuggable) enqueue(ToastRequest(message = message))
      null
    }

    Function("delayedShow") { message: String, delayMillis: Long ->
      val delay = delayMillis.coerceAtLeast(0)
      runOnMain {
        mainHandler.postDelayed({ enqueue(ToastRequest(message = message)) }, delay)
      }
      null
    }

    // This is the only entry point that intentionally uses the system Toast implementation.
    Function("showSystem") { message: String ->
      runOnMain {
        val application = getApplicationOrNull() ?: return@runOnMain
        ensureInitialized(application)
        cancelCurrentToast()
        Toaster.show(message)
      }
      null
    }

    Function("cancel") {
      runOnMain {
        pendingRequest = null
        mainHandler.removeCallbacks(pendingRetry)
        cancelCurrentToast()
      }
      null
    }

    Function("setDefaultStyle") { style: Map<String, Any?>? ->
      val copiedStyle = style?.toMap()
      runOnMain { defaultStyle = copiedStyle }
      null
    }

    Function("setGravity") { gravity: Int ->
      runOnMain {
        defaultGravity = gravity
        defaultXOffset = 0
        defaultYOffset = 0
        getApplicationOrNull()?.let {
          ensureInitialized(it)
          Toaster.setGravity(gravity)
        }
      }
      null
    }

    Function("setGravityWithOffset") { gravity: Int, xOffset: Int, yOffset: Int ->
      runOnMain {
        defaultGravity = gravity
        defaultXOffset = xOffset
        defaultYOffset = yOffset
        getApplicationOrNull()?.let {
          ensureInitialized(it)
          Toaster.setGravity(gravity, xOffset, yOffset)
        }
      }
      null
    }
  }

  private fun enqueue(request: ToastRequest) {
    runOnMain {
      pendingRequest = null
      mainHandler.removeCallbacks(pendingRetry)
      showOrQueue(request)
    }
  }

  private fun showOrQueue(request: ToastRequest) {
    val application = getApplicationOrNull()
    val activity = getActiveActivityOrNull()
    if (application == null || activity == null) {
      queuePendingToast(request)
      return
    }

    ensureInitialized(application)
    showActivityToast(application, activity, request)
  }

  private fun queuePendingToast(request: ToastRequest) {
    pendingRequest = request
    pendingExpiresAt = SystemClock.uptimeMillis() + PENDING_TOAST_TIMEOUT_MS
    schedulePendingRetry()
  }

  private fun flushPendingToast() {
    val request = pendingRequest ?: return
    val application = getApplicationOrNull()
    val activity = getActiveActivityOrNull()
    if (application == null || activity == null) {
      if (SystemClock.uptimeMillis() >= pendingExpiresAt) {
        pendingRequest = null
      } else {
        schedulePendingRetry()
      }
      return
    }

    pendingRequest = null
    ensureInitialized(application)
    showActivityToast(application, activity, request)
  }

  private fun schedulePendingRetry() {
    mainHandler.removeCallbacks(pendingRetry)
    mainHandler.postDelayed(pendingRetry, PENDING_TOAST_RETRY_MS)
  }

  private fun showActivityToast(application: Application, activity: Activity, request: ToastRequest) {
    cancelCurrentToast()

    val fallbackStyle = try {
      Toaster.getStyle()
    } catch (_: Throwable) {
      null
    }
    val toast = ActivityToast(activity)
    toast.setView(createToastView(application, mergeStyles(defaultStyle, request.style), fallbackStyle))

    val gravity = resolveGravity(request.position)
    val xOffset = if (request.position == null) defaultXOffset else request.xOffset
    val yOffset = resolveYOffset(application, request.position, request.yOffset)
    toast.setGravity(gravity, xOffset, yOffset)
    toast.setMargin(0f, 0f)
    toast.setDuration(request.duration ?: if (request.message.length > 20) Toast.LENGTH_LONG else Toast.LENGTH_SHORT)
    toast.setText(request.message)

    lastToast = toast
    toast.show()
  }

  private fun cancelCurrentToast() {
    try {
      lastToast?.cancel()
    } catch (_: Throwable) {
    }
    lastToast = null
    try {
      Toaster.cancel()
    } catch (_: Throwable) {
    }
  }

  private fun ensureInitialized(application: Application) {
    if (!Toaster.isInit()) Toaster.init(application)
  }

  private fun runOnMain(block: () -> Unit) {
    if (Looper.myLooper() == Looper.getMainLooper()) block() else mainHandler.post(block)
  }

  private fun getApplicationOrNull(): Application? {
    return appContext.reactContext?.applicationContext as? Application
  }

  private fun getActiveActivityOrNull(): Activity? {
    return appContext.currentActivity?.takeIf { !it.isFinishing && !it.isDestroyed }
  }

  private fun requestFromOptions(message: String, options: Map<String, Any?>?): ToastRequest {
    val duration = when (options?.get("duration") as? String) {
      "short" -> Toast.LENGTH_SHORT
      "long" -> Toast.LENGTH_LONG
      else -> null
    }
    val style = (options?.get("style") as? Map<*, *>)
      ?.entries
      ?.associate { it.key.toString() to it.value }
      ?.takeIf { it.isNotEmpty() }

    return ToastRequest(
      message = message,
      duration = duration,
      position = options?.get("position") as? String,
      xOffset = (options?.get("xOffset") as? Number)?.toInt() ?: 0,
      yOffset = (options?.get("yOffset") as? Number)?.toInt() ?: 0,
      style = style,
    )
  }

  private fun mergeStyles(
    base: Map<String, Any?>?,
    override: Map<String, Any?>?,
  ): Map<String, Any?>? = when {
    base == null -> override
    override == null -> base
    else -> base + override
  }

  private fun resolveGravity(position: String?): Int = when (position) {
    "top" -> Gravity.TOP or Gravity.CENTER_HORIZONTAL
    "bottom" -> Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
    "center" -> Gravity.CENTER
    else -> defaultGravity
  }

  private fun resolveYOffset(application: Application, position: String?, yOffset: Int): Int = when (position) {
    "top" -> yOffset + if (yOffset == 0) dp(application, 16f) else 0
    "bottom" -> yOffset + if (yOffset == 0) dp(application, 48f) else 0
    "center" -> yOffset - getStatusBarHeight(application) / 2
    else -> defaultYOffset
  }

  private fun createToastView(
    context: Application,
    style: Map<String, Any?>?,
    fallbackStyle: IToastStyle<*>?,
  ): View {
    if (style == null) {
      fallbackStyle?.createView(context)?.let { return it }
    }

    return TextView(context).apply {
      id = android.R.id.message
      layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT)
      gravity = Gravity.CENTER
      setTextColor(parseColor(style?.get("textColor")) ?: Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, (style?.get("textSize") as? Number)?.toFloat() ?: 14f)
      maxLines = (style?.get("maxLines") as? Number)?.toInt() ?: 2
      setPadding(
        dp(context, (style?.get("paddingHorizontal") as? Number)?.toFloat() ?: 16f),
        dp(context, (style?.get("paddingVertical") as? Number)?.toFloat() ?: 10f),
        dp(context, (style?.get("paddingHorizontal") as? Number)?.toFloat() ?: 16f),
        dp(context, (style?.get("paddingVertical") as? Number)?.toFloat() ?: 10f),
      )
      background = GradientDrawable().apply {
        setColor(parseColor(style?.get("backgroundColor")) ?: 0xB3000000.toInt())
        cornerRadius = dp(context, (style?.get("borderRadius") as? Number)?.toFloat() ?: 10f).toFloat()
      }
    }
  }

  private fun parseColor(value: Any?): Int? = when (value) {
    is Number -> value.toInt()
    is String -> runCatching { Color.parseColor(value) }.getOrNull()
    else -> null
  }

  private fun dp(context: Application, value: Float): Int = TypedValue.applyDimension(
    TypedValue.COMPLEX_UNIT_DIP,
    value,
    context.resources.displayMetrics,
  ).toInt()

  private fun getStatusBarHeight(context: Application): Int {
    val resourceId = context.resources.getIdentifier("status_bar_height", "dimen", "android")
    return if (resourceId > 0) context.resources.getDimensionPixelSize(resourceId) else 0
  }

  private companion object {
    const val PENDING_TOAST_RETRY_MS = 100L
    const val PENDING_TOAST_TIMEOUT_MS = 1_500L
  }
}
