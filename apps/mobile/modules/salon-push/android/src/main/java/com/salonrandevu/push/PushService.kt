package com.salonrandevu.push

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Receives the server's push messages, also while the app is closed: they are
 * data-only, so this code always decides how they look (Alerts.show).
 */
class PushService : FirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val data = message.data
    if (data.isEmpty()) return
    Alerts.show(applicationContext, data)
    SalonPushModule.onPush?.invoke(data)
  }

  override fun onNewToken(token: String) {
    // The app registers the new token with the server (at once if it is running, else at its next start).
    SalonPushModule.onToken?.invoke(token)
  }
}
