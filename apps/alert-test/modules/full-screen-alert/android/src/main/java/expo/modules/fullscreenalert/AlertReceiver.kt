package expo.modules.fullscreenalert

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

/**
 * Posts the test alert when its delay ends. In production a push message does
 * this; the notification itself is the same: a full-screen intent that opens
 * the app over the lock screen, plus Reddet / Onayla actions.
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
    context.getSystemService(NotificationManager::class.java).notify(notificationId, notification)
  }

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
