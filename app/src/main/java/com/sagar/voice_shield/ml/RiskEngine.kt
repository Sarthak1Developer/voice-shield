package com.sagar.voice_shield.ml

import kotlin.math.max
import kotlin.math.min
import kotlin.math.round

/**
 * Risk Engine matching the backend's weighted scoring model.
 * Computes a 0-100 risk score from multiple signal dimensions.
 */
class RiskEngine {

    data class RiskSignals(
        val deepfakeScore: Double = 0.0,
        val speakerSimilarity: Double = 1.0,
        val prosodyScore: Double = 0.0,
        val contextScore: Double = 0.0,
        val threatScore: Double = 0.0
    )

    data class RiskResult(
        val score: Double,
        val severity: String,
        val explanations: List<String>
    )

    fun calculateRisk(signals: RiskSignals): RiskResult {
        val deepfake = bounded(signals.deepfakeScore)
        val speakerMismatch = 1.0 - bounded(signals.speakerSimilarity)
        val prosody = bounded(signals.prosodyScore)
        val context = bounded(signals.contextScore)
        val threat = bounded(signals.threatScore)

        val maxAnomaly = max(deepfake, max(threat, prosody))

        // Normal: 12 - 18
        // Suspicious: 30 - 50, or at most 60
        val baseScore = when {
            // Extreme shouting / synthetic attack: 52 to 62
            maxAnomaly >= 0.70 -> 50.0 + ((maxAnomaly - 0.70) / 0.30) * 12.0
            // Suspicious / scammer cadence / urgency: scales smoothly 30 to 50!
            maxAnomaly >= 0.25 -> 30.0 + ((maxAnomaly - 0.25) / 0.45) * 20.0
            // Normal clean human voice: scales strictly 12 to 18!
            else -> 12.0 + (maxAnomaly / 0.25) * 6.0
        }

        val roundedScore = round(baseScore.coerceIn(12.0, 60.0) * 10) / 10
        val severity = severity(roundedScore)

        val explanations = mutableListOf<String>()
        if (threat >= 0.35) explanations.add("⚠️ Scammer threat dynamics: Aggressive urgency / vocal stress (${(threat * 100).toInt()}% threat)")
        if (deepfake >= 0.45) explanations.add("Possible synthetic voice detected (${(deepfake * 100).toInt()}%)")
        if (speakerMismatch > 0.5) explanations.add("Low speaker similarity (${((1 - speakerMismatch) * 100).toInt()}% match)")
        if (prosody >= 0.45) explanations.add("Acoustic prosody anomaly: Robotic cadence or vocoder compression")
        if (context > 0.5) explanations.add("Suspicious conversation patterns identified")
        if (explanations.isEmpty()) explanations.add("Natural human voice verified safe")

        return RiskResult(roundedScore, severity, explanations)
    }

    fun severity(score: Double): String {
        return when {
            score < 28.0 -> "LOW"
            score <= 52.0 -> "MEDIUM"
            else -> "HIGH"
        }
    }

    private fun bounded(value: Double): Double {
        return max(0.0, min(1.0, value))
    }
}
