package com.salonrandevu.push

import android.app.Activity
import android.content.Context
import android.os.Bundle
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/**
 * When the alarm starts the app from scratch (phone locked, app closed), the
 * screen is shown over the lock screen as soon as it is created, not only once
 * the JavaScript has loaded.
 */
class SalonPushPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context?): List<ReactActivityLifecycleListener> =
    listOf(
      object : ReactActivityLifecycleListener {
        override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
          if (activity != null && activity.intent?.getBooleanExtra(Alerts.EXTRA_ALARM, false) == true) {
            Alerts.showOverLockScreen(activity, true)
          }
        }
      },
    )
}
