package com.sagar.voice_shield.ml

import kotlin.math.*

/**
 * On-device prosody analysis using digital signal processing.
 * Extracts pitch (F0), jitter, shimmer, and speaking rate from raw audio.
 */
class ProsodyAnalyzer {

    data class ProsodyFeatures(
        val meanPitch: Double,
        val pitchVariance: Double,
        val jitter: Double,
        val shimmer: Double,
        val speakingRate: Double,
        val unnaturalnessScore: Double,
        val threatScore: Double = 0.0
    )

    fun analyze(audioData: ShortArray, sampleRate: Int = 16000): ProsodyFeatures {
        if (audioData.isEmpty()) return emptyFeatures()
        val floatData = audioData.map { it.toDouble() / Short.MAX_VALUE }.toDoubleArray()
        val pitchValues = extractPitch(floatData, sampleRate)
        val meanPitch = if (pitchValues.isNotEmpty()) pitchValues.average() else 0.0
        val pitchVariance = if (pitchValues.size > 1) pitchValues.map { (it - meanPitch).pow(2) }.average() else 0.0
        val jitter = computeJitter(pitchValues)
        val shimmer = computeShimmer(floatData, sampleRate)
        val speakingRate = estimateSpeakingRate(floatData, sampleRate)
        val (unnaturalness, threat) = computeAcousticScores(meanPitch, pitchVariance, jitter, shimmer, speakingRate, floatData)
        return ProsodyFeatures(meanPitch, pitchVariance, jitter, shimmer, speakingRate, unnaturalness, threat)
    }

    private fun extractPitch(data: DoubleArray, sampleRate: Int): List<Double> {
        val pitchValues = mutableListOf<Double>()
        val frameSize = sampleRate / 10
        val hopSize = frameSize / 2
        val minLag = sampleRate / 500
        val maxLag = sampleRate / 60
        var offset = 0
        while (offset + frameSize <= data.size) {
            val frame = data.sliceArray(offset until offset + frameSize)
            val pitch = autocorrelationPitch(frame, sampleRate, minLag, maxLag)
            if (pitch > 0) pitchValues.add(pitch)
            offset += hopSize
        }
        return pitchValues
    }

    private fun autocorrelationPitch(frame: DoubleArray, sampleRate: Int, minLag: Int, maxLag: Int): Double {
        val n = frame.size
        if (maxLag >= n) return 0.0
        var bestLag = 0
        var bestCorr = -1.0
        for (lag in minLag..min(maxLag, n - 1)) {
            var correlation = 0.0; var norm1 = 0.0; var norm2 = 0.0
            for (i in 0 until n - lag) {
                correlation += frame[i] * frame[i + lag]
                norm1 += frame[i] * frame[i]
                norm2 += frame[i + lag] * frame[i + lag]
            }
            val normalizedCorr = if (norm1 > 0 && norm2 > 0) correlation / sqrt(norm1 * norm2) else 0.0
            if (normalizedCorr > bestCorr) { bestCorr = normalizedCorr; bestLag = lag }
        }
        return if (bestCorr > 0.3 && bestLag > 0) sampleRate.toDouble() / bestLag else 0.0
    }

    private fun computeJitter(pitchValues: List<Double>): Double {
        if (pitchValues.size < 2) return 0.0
        val periods = pitchValues.map { if (it > 0) 1.0 / it else 0.0 }
        val diffs = (1 until periods.size).map { abs(periods[it] - periods[it - 1]) }
        val meanPeriod = periods.average()
        return if (meanPeriod > 0) diffs.average() / meanPeriod else 0.0
    }

    private fun computeShimmer(data: DoubleArray, sampleRate: Int): Double {
        val frameSize = sampleRate / 20
        val amplitudes = mutableListOf<Double>()
        var offset = 0
        while (offset + frameSize <= data.size) {
            val rms = sqrt(data.sliceArray(offset until offset + frameSize).map { it * it }.average())
            if (rms > 0.01) amplitudes.add(rms)
            offset += frameSize
        }
        if (amplitudes.size < 2) return 0.0
        val diffs = (1 until amplitudes.size).map { abs(amplitudes[it] - amplitudes[it - 1]) }
        val meanAmp = amplitudes.average()
        return if (meanAmp > 0) diffs.average() / meanAmp else 0.0
    }

    private fun estimateSpeakingRate(data: DoubleArray, sampleRate: Int): Double {
        val frameSize = sampleRate / 50
        val energies = mutableListOf<Double>()
        var offset = 0
        while (offset + frameSize <= data.size) {
            energies.add(data.sliceArray(offset until offset + frameSize).map { it * it }.average())
            offset += frameSize
        }
        if (energies.isEmpty()) return 0.0
        val threshold = energies.average() * 1.5
        var peaks = 0; var wasAbove = false
        for (e in energies) {
            if (e > threshold && !wasAbove) { peaks++; wasAbove = true }
            else if (e < threshold) wasAbove = false
        }
        val durationSecs = data.size.toDouble() / sampleRate
        return if (durationSecs > 0) peaks / durationSecs else 0.0
    }

    private fun computeAcousticScores(
        meanPitch: Double,
        pitchVariance: Double,
        jitter: Double,
        shimmer: Double,
        speakingRate: Double,
        floatData: DoubleArray
    ): Pair<Double, Double> {
        var unnaturalness = 0.0
        var threat = 0.0

        // 1. Robotic / Synthetic Speech / Text-to-Speech artifacts
        // Genuine TTS has unnaturally flat pitch (< 35) AND near-zero micro-fluctuation together
        if (pitchVariance < 35.0 && meanPitch > 80.0 && jitter > 0 && jitter < 0.003 && shimmer < 0.008) {
            unnaturalness += 0.50
        }
        if (speakingRate > 7.5) {
            unnaturalness += 0.20
        }

        // 2. Scammer & Social Engineering Threat Dynamics
        // Peak energy / shouting / loudness (intimidation):
        val maxAmp = if (floatData.isNotEmpty()) floatData.maxOf { abs(it) } else 0.0
        if (maxAmp > 0.60) {
            threat += 0.35
        } else if (maxAmp > 0.42) {
            threat += 0.20
        }

        // Frantic rushed speech cadence (pushing victim to panic):
        if (speakingRate > 4.8) {
            threat += 0.30
        } else if (speakingRate > 3.8) {
            threat += 0.18
        }

        // Extreme high pitch / screaming / aggressive vocal strain:
        if (meanPitch > 250.0) {
            threat += 0.30
        } else if (meanPitch > 210.0) {
            threat += 0.18
        }

        // Severe pitch volatility (wild erratic screeching):
        if (pitchVariance > 450.0) {
            threat += 0.25
        } else if (pitchVariance > 280.0) {
            threat += 0.15
        }

        // Vocal harshness / severe distortion from shouting:
        if (shimmer > 0.065 && jitter > 0.035) {
            threat += 0.20
        } else if (shimmer > 0.050 && jitter > 0.028) {
            threat += 0.12
        }

        return Pair(min(1.0, unnaturalness), min(1.0, threat))
    }

    private fun emptyFeatures() = ProsodyFeatures(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0)
}
