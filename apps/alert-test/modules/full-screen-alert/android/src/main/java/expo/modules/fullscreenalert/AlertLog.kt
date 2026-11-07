package expo.modules.fullscreenalert

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** What the native side did while the app was not on screen; the app shows it in its event log. */
object AlertLog {
  private const val PREFS = "full_screen_alert_log"
  private const val KEY = "entries"

  fun add(context: Context, message: String) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val time = SimpleDateFormat("HH:mm:ss", Locale.US).format(Date())
    val entries = (prefs.getString(KEY, "") ?: "").lines().filter { it.isNotBlank() }.takeLast(30)
    prefs.edit().putString(KEY, (entries + "$time · $message").joinToString("\n")).apply()
  }

  fun take(context: Context): List<String> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val entries = (prefs.getString(KEY, "") ?: "").lines().filter { it.isNotBlank() }
    prefs.edit().remove(KEY).apply()
    return entries
  }
}
