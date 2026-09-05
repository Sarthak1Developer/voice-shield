package com.sagar.voice_shield.notification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat

class NotificationHelper(private val context: Context) {

    companion object {
        const val CHANNEL_ALERTS = "voiceshield_alerts"
        const val CHANNEL_PROTECTION = "voiceshield_protection"
        const val ALERT_NOTIFICATION_ID = 2001
    }

    init {
        createChannels()
    }

    private fun createChannels() {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val alertChannel = NotificationChannel(
            CHANNEL_ALERTS, "Threat Alerts", NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "VoiceShield threat detection alerts"
            enableVibration(true)
        }

        val protectionChannel = NotificationChannel(
            CHANNEL_PROTECTION, "Protection Status", NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Speaker Protection Mode status"
        }

        manager.createNotificationChannel(alertChannel)
        manager.createNotificationChannel(protectionChannel)
    }

    fun showThreatAlert(title: String, message: String, severity: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val notification = NotificationCompat.Builder(context, CHANNEL_ALERTS)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle("⚠️ $title")
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(if (severity == "HIGH") NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()

        manager.notify(ALERT_NOTIFICATION_ID + (System.currentTimeMillis() % 1000).toInt(), notification)
    }

    fun showCallNotification(title: String, message: String) {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val notification = NotificationCompat.Builder(context, CHANNEL_ALERTS)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        manager.notify(ALERT_NOTIFICATION_ID + 100 + (System.currentTimeMillis() % 1000).toInt(), notification)
    }
}
