package com.salonrandevu.push

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import org.json.JSONObject

/**
 * How each push message looks on the phone (phase 3).
 *
 * A new appointment (request or confirmed) and the reminder for an unanswered
 * request ring as an alarm: the alarm sound, a full-screen view over the lock
 * screen, and, for a request, Onayla / Reddet; a request keeps ringing until it
 * is answered or dismissed (founder, after alert test 1). Everything else is an
 * ordinary notification. Outside the salon's working hours the server marks a
 * message quiet: it is shown without any sound and never as an alarm. All
 * messages about one appointment share one notification, so a later one
 * (automatically confirmed, cancelled) replaces and silences the alarm.
 */
object Alerts {
  const val CHANNEL_ALARM = "randevu_alarm"
  const val CHANNEL_DEFAULT = "bildirimler"
  /** Outside the salon's working hours: shown, but without sound, vibration or a banner. */
  const val CHANNEL_QUIET = "sessiz_bildirimler"
  const val EXTRA_PAYLOAD = "salonPushPayload"
  const val EXTRA_ACTION = "salonPushAction"
  const val EXTRA_NOTIFICATION_ID = "salonPushNotificationId"
  const val EXTRA_ALARM = "salonPushAlarm"

  private val ALARM_KINDS = setOf("request", "confirmed", "reminder")
  private val ANSWERABLE_KINDS = setOf("request", "reminder")

  fun ensureChannels(context: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL_ALARM) == null) {
      val sound = Uri.parse("android.resource://${context.packageName}/raw/randevu_alert")
      val audio = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_ALARM)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ALARM, "Randevu alarmı", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Yeni randevular: alarm sesiyle, yanıtlanana kadar çalar."
          setSound(sound, audio)
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 600, 300, 600, 300, 600)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
          setBypassDnd(true)
        },
      )
    }
    if (manager.getNotificationChannel(CHANNEL_QUIET) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_QUIET, "Mesai dışı bildirimler", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Salonun çalışma saatleri dışında gelenler: sessiz."
          setSound(null, null)
          enableVibration(false)
          lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        },
      )
    }
    if (manager.getNotificationChannel(CHANNEL_DEFAULT) == null) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_DEFAULT, "Bildirimler", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Randevularınızla ilgili gelişmeler."
          lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        },
      )
    }
  }

  fun notificationIdFor(key: String): Int = key.hashCode() and 0x0FFFFFFF

  fun show(context: Context, data: Map<String, String>) {
    ensureChannels(context)
    val kind = data["kind"] ?: ""
    // Outside the salon's working hours the server marks it quiet: no alarm, no sound (founder, 7 November 2026).
    val quiet = data["quiet"] == "1"
    val alarm = kind in ALARM_KINDS && !quiet
    val answerable = kind in ANSWERABLE_KINDS
    val title = data["title"] ?: "Salon Randevu"
    val body = data["body"] ?: ""
    val id = notificationIdFor(data["appointmentId"] ?: (title + body))
    val payload = JSONObject(data).toString()
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)!!.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      putExtra(EXTRA_PAYLOAD, payload)
      putExtra(EXTRA_NOTIFICATION_ID, id)
      putExtra(EXTRA_ALARM, alarm)
    }

    fun open(action: String?, slot: Int): PendingIntent =
      PendingIntent.getActivity(
        context,
        id * 4 + slot,
        Intent(launch).putExtra(EXTRA_ACTION, action),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )

    val channel = when {
      alarm -> CHANNEL_ALARM
      quiet -> CHANNEL_QUIET
      else -> CHANNEL_DEFAULT
    }
    val builder = NotificationCompat.Builder(context, channel)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(
        when {
          alarm -> NotificationCompat.PRIORITY_MAX
          quiet -> NotificationCompat.PRIORITY_LOW
          else -> NotificationCompat.PRIORITY_HIGH
        },
      )
      .setSilent(quiet)
      .setAutoCancel(true)
      .setContentIntent(open(null, 1))
    if (alarm) {
      builder
        .setCategory(NotificationCompat.CATEGORY_ALARM)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setFullScreenIntent(open(null, 0), true)
    }
    if (answerable) {
      builder.addAction(0, "Reddet", open("reddet", 2)).addAction(0, "Onayla", open("onayla", 3))
    }
    val notification = builder.build()
    // A request rings until it is answered or the notification is dismissed (not when quiet).
    if (answerable && alarm) notification.flags = notification.flags or Notification.FLAG_INSISTENT
    context.getSystemService(NotificationManager::class.java).notify(id, notification)
  }

  /** What opened the app, if a notification did. */
  fun alertFrom(intent: Intent?): Map<String, Any?>? {
    val payload = intent?.getStringExtra(EXTRA_PAYLOAD) ?: return null
    return mapOf(
      "payload" to payload,
      "action" to intent.getStringExtra(EXTRA_ACTION),
      "notificationId" to intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0),
    )
  }

  /**
   * The alarm shows the app over the lock screen and turns the screen on, only
   * while it is answered: the app is never left open on a locked phone.
   */
  fun showOverLockScreen(activity: Activity, show: Boolean) {
    activity.runOnUiThread {
      if (Build.VERSION.SDK_INT >= 27) {
        activity.setShowWhenLocked(show)
        activity.setTurnScreenOn(show)
      } else {
        @Suppress("DEPRECATION")
        val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        if (show) activity.window.addFlags(flags) else activity.window.clearFlags(flags)
      }
    }
  }
}
