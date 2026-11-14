package expo.modules.fullscreenalert

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FullScreenAlertModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("FullScreenAlert")
    Events("onAlert")

    // Android 14+ only lets calling and alarm apps show full-screen alerts by default;
    // other apps need the user to allow it in settings.
    Function("openFullScreenSettings") {
      if (Build.VERSION.SDK_INT >= 34) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    // Phone and permission details, so test results can be matched to the phone.
    Function("diagnostics") { channelId: String ->
      val notifications = context.getSystemService(NotificationManager::class.java)
      val alarms = context.getSystemService(AlarmManager::class.java)
      mapOf(
        "manufacturer" to Build.MANUFACTURER,
        "model" to Build.MODEL,
        "androidVersion" to Build.VERSION.RELEASE,
        "sdk" to Build.VERSION.SDK_INT,
        "notificationsEnabled" to notifications.areNotificationsEnabled(),
        "channelImportance" to notifications.getNotificationChannel(channelId)?.importance,
        "canUseFullScreenIntent" to (Build.VERSION.SDK_INT < 34 || notifications.canUseFullScreenIntent()),
        "canDrawOverlays" to Settings.canDrawOverlays(context),
        "canScheduleExactAlarms" to (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()),
      )
    }

    // The app's permission page; on Xiaomi phones, their own page with "Show on lock screen".
    Function("openAppPermissions") {
      val xiaomi = Intent("miui.intent.action.APP_PERM_EDITOR")
        .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
        .putExtra("extra_pkgname", context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      val standard = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try {
        if (Build.MANUFACTURER.equals("xiaomi", ignoreCase = true)) context.startActivity(xiaomi) else context.startActivity(standard)
      } catch (e: ActivityNotFoundException) {
        context.startActivity(standard)
      } catch (e: SecurityException) {
        context.startActivity(standard)
      }
    }

    Function("openOverlaySettings") {
      val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    Function("takeNativeLog") {
      AlertLog.take(context)
    }

    Function("schedule") { delaySeconds: Int, channelId: String, title: String, body: String, payload: String, insistent: Boolean ->
      val notificationId = (System.currentTimeMillis() / 1000 % 100_000).toInt()
      val intent = Intent(context, AlertReceiver::class.java)
        .putExtra(AlertReceiver.EXTRA_NOTIFICATION_ID, notificationId)
        .putExtra(AlertReceiver.EXTRA_CHANNEL, channelId)
        .putExtra(AlertReceiver.EXTRA_TITLE, title)
        .putExtra(AlertReceiver.EXTRA_BODY, body)
        .putExtra(AlertReceiver.EXTRA_PAYLOAD, payload)
        .putExtra(AlertReceiver.EXTRA_INSISTENT, insistent)
      val pending = PendingIntent.getBroadcast(
        context,
        notificationId,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val alarms = context.getSystemService(AlarmManager::class.java)
      val at = System.currentTimeMillis() + delaySeconds * 1000L
      if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
        alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
      } else {
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending)
      }
      notificationId
    }

    Function("dismiss") { notificationId: Int ->
      context.getSystemService(NotificationManager::class.java).cancel(notificationId)
    }

    // The alert that opened the app from a cold start, if any (read once).
    Function("takeLaunchAlert") {
      val intent = appContext.currentActivity?.intent ?: return@Function null
      val alert = alertFrom(intent)
      if (alert != null) AlertLog.add(context, "Uygulama alarmla başlatıldı")
      intent.removeExtra(AlertReceiver.EXTRA_PAYLOAD)
      alert
    }

    // The app was already running when the alert or one of its buttons opened it.
    OnNewIntent { intent ->
      alertFrom(intent)?.let {
        AlertLog.add(context, "Uygulama alarmla açıldı")
        sendEvent("onAlert", it)
      }
      intent.removeExtra(AlertReceiver.EXTRA_PAYLOAD)
    }
  }

  private fun alertFrom(intent: Intent): Map<String, Any?>? {
    val payload = intent.getStringExtra(AlertReceiver.EXTRA_PAYLOAD) ?: return null
    return mapOf(
      "payload" to payload,
      "action" to intent.getStringExtra(AlertReceiver.EXTRA_ACTION),
      "notificationId" to intent.getIntExtra(AlertReceiver.EXTRA_NOTIFICATION_ID, 0),
    )
  }
}
