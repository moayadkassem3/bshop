package com.salonrandevu.push

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.google.firebase.messaging.FirebaseMessaging
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Push notifications and the appointment alarm for the app's JavaScript (src/lib/push.ts). */
class SalonPushModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  override fun definition() = ModuleDefinition {
    Name("SalonPush")
    Events("onAlert", "onPush", "onToken")

    OnCreate {
      onPush = { data -> sendEvent("onPush", data) }
      onToken = { token -> sendEvent("onToken", mapOf("token" to token)) }
    }
    OnDestroy {
      onPush = null
      onToken = null
    }

    Function("ensureChannels") {
      Alerts.ensureChannels(context)
    }

    AsyncFunction("getToken") { promise: Promise ->
      try {
        FirebaseMessaging.getInstance().token
          .addOnSuccessListener { promise.resolve(it) }
          .addOnFailureListener { promise.reject("E_PUSH_TOKEN", it.message ?: "Push token unavailable", it) }
      } catch (e: Exception) {
        promise.reject("E_PUSH_TOKEN", e.message ?: "Firebase is not set up", e)
      }
    }

    // Notifications allowed, the alarm channel not silenced, and (Android 14+) full-screen alerts allowed.
    Function("status") {
      val manager = context.getSystemService(NotificationManager::class.java)
      val alarmChannel = if (Build.VERSION.SDK_INT >= 26) manager.getNotificationChannel(Alerts.CHANNEL_ALARM) else null
      mapOf(
        "notificationsEnabled" to manager.areNotificationsEnabled(),
        "alarmChannelEnabled" to (alarmChannel == null || alarmChannel.importance != NotificationManager.IMPORTANCE_NONE),
        "canUseFullScreenIntent" to (Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent()),
        "sdk" to Build.VERSION.SDK_INT,
      )
    }

    Function("openNotificationSettings") {
      val intent = if (Build.VERSION.SDK_INT >= 26) {
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
      } else {
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    // Android 14+ only lets calling and alarm apps show full-screen alerts by default.
    Function("openFullScreenSettings") {
      if (Build.VERSION.SDK_INT >= 34) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
      }
    }

    Function("dismiss") { notificationId: Int ->
      context.getSystemService(NotificationManager::class.java).cancel(notificationId)
    }

    // After the alarm is answered: the app no longer shows over the lock screen.
    Function("releaseLockScreen") {
      appContext.currentActivity?.let { Alerts.showOverLockScreen(it, false) }
    }

    // The notification that started the app from scratch, if any (read once).
    Function("takeLaunchAlert") {
      val intent = appContext.currentActivity?.intent ?: return@Function null
      val alert = Alerts.alertFrom(intent)
      intent.removeExtra(Alerts.EXTRA_PAYLOAD)
      alert
    }

    // The app was running when a notification or one of its buttons opened it.
    OnNewIntent { intent ->
      Alerts.alertFrom(intent)?.let { alert ->
        if (intent.getBooleanExtra(Alerts.EXTRA_ALARM, false)) {
          appContext.currentActivity?.let { Alerts.showOverLockScreen(it, true) }
        }
        sendEvent("onAlert", alert)
      }
      intent.removeExtra(Alerts.EXTRA_PAYLOAD)
    }
  }

  companion object {
    @Volatile var onPush: ((Map<String, String>) -> Unit)? = null
    @Volatile var onToken: ((String) -> Unit)? = null
  }
}
