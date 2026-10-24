package expo.modules.fullscreenalert

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.app.NotificationCompat

/**
 * Posts the test alert when its delay ends. In production a push message does
 * this; the notification itself is the same: a full-screen intent that opens
 * the app over the lock screen, plus Reddet / Onayla actions.
 *
 * Build 3 also records the phone's state, wakes the screen, and (when the
 * "display over other apps" permission is on) opens the app directly, to find
 * out which of these works on phones whose makers block full-screen alerts.
 */
class AlertReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 1)
    val payload = intent.getStringExtra(EXTRA_PAYLOAD) ?: "{}"
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)!!.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(EXTRA_PAYLOAD, payload)
      putExtra(EXTRA_NOTIFICATION_ID, notificationId)
    }

    val power = context.getSystemService(PowerManager::class.java)
    val keyguard = context.getSystemService(KeyguardManager::class.java)
    val notifications = context.getSystemService(NotificationManager::class.java)
    val canOverlay = Settings.canDrawOverlays(context)
    val canFullScreen = Build.VERSION.SDK_INT < 34 || notifications.canUseFullScreenIntent()
    AlertLog.add(
      context,
      "Alarm geldi · ekran ${onOff(power.isInteractive)} · kilit ${onOff(keyguard.isKeyguardLocked)} · " +
        "tam ekran izni ${onOff(canFullScreen)} · üstte gösterme ${onOff(canOverlay)}",
    )

    // Turn the screen on, in case the phone ignores the full-screen request while it is off.
    @Suppress("DEPRECATION")
    val wakeLock = power.newWakeLock(
      PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
      "bshop:alert",
    )
    wakeLock.acquire(10_000)

    fun open(action: String?, requestCode: Int): PendingIntent =
      PendingIntent.getActivity(
        context,
        requestCode,
        Intent(launch).putExtra(EXTRA_ACTION, action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

    val base = notificationId * 4
    val notification = NotificationCompat.Builder(context, intent.getStringExtra(EXTRA_CHANNEL) ?: "default")
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(intent.getStringExtra(EXTRA_TITLE))
      .setContentText(intent.getStringExtra(EXTRA_BODY))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)
      .setFullScreenIntent(open(null, base), true)
      .setContentIntent(open(null, base + 1))
      .addAction(0, "Reddet", open("reddet", base + 2))
      .addAction(0, "Onayla", open("onayla", base + 3))
      .build()
    if (intent.getBooleanExtra(EXTRA_INSISTENT, false)) {
      // Repeats the sound until the alert is answered or dismissed.
      notification.flags = notification.flags or Notification.FLAG_INSISTENT
    }
    notifications.notify(notificationId, notification)

    // Fallback: apps allowed to display over other apps may open a screen from the background.
    if (canOverlay) {
      try {
        context.startActivity(launch)
        AlertLog.add(context, "Uygulama doğrudan açılmaya çalışıldı")
      } catch (e: Exception) {
        AlertLog.add(context, "Doğrudan açma başarısız: ${e.javaClass.simpleName}")
      }
    }
  }

  private fun onOff(value: Boolean) = if (value) "açık" else "kapalı"

  companion object {
    const val EXTRA_PAYLOAD = "fullScreenAlertPayload"
    const val EXTRA_ACTION = "fullScreenAlertAction"
    const val EXTRA_NOTIFICATION_ID = "fullScreenAlertNotificationId"
    const val EXTRA_CHANNEL = "fullScreenAlertChannel"
    const val EXTRA_TITLE = "fullScreenAlertTitle"
    const val EXTRA_BODY = "fullScreenAlertBody"
    const val EXTRA_INSISTENT = "fullScreenAlertInsistent"
  }
}
