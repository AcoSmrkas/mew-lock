package com.mewfinance.mewlock.backend.services

import com.mewfinance.mewlock.common.PriceInfo
import com.mewfinance.mewlock.common.MewLockConstants
import io.github.oshai.kotlinlogging.KotlinLogging
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.*
import org.springframework.stereotype.Service
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.net.URI
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

@Service
class PriceService {
    private val logger = KotlinLogging.logger {}
    private val httpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(30))
        .build()
    
    private val json = Json { ignoreUnknownKeys = true }
    private val priceCache = ConcurrentHashMap<String, Pair<Double, Long>>()
    private val cacheTimeout = 5 * 60 * 1000L // 5 minutes
    
    suspend fun getCurrentPrices(): PriceInfo = withContext(Dispatchers.IO) {
        val ergPrice = getErgPrice()
        val tokenPrices = getTokenPrices()
        
        PriceInfo(
            ergUsd = ergPrice,
            tokenPrices = tokenPrices,
            lastUpdated = System.currentTimeMillis()
        )
    }
    
    suspend fun getErgPrice(): Double = withContext(Dispatchers.IO) {
        val cacheKey = "ERG_USD"
        val cached = priceCache[cacheKey]
        
        if (cached != null && (System.currentTimeMillis() - cached.second) < cacheTimeout) {
            return@withContext cached.first
        }
        
        try {
            // Try CoinGecko first
            val price = getErgPriceFromCoinGecko() ?: getErgPriceFromSpectrum() ?: 0.0
            priceCache[cacheKey] = Pair(price, System.currentTimeMillis())
            price
        } catch (e: Exception) {
            logger.error(e) { "Failed to fetch ERG price" }
            cached?.first ?: 0.0
        }
    }
    
    private suspend fun getErgPriceFromCoinGecko(): Double? = withContext(Dispatchers.IO) {
        try {
            val request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd"))
                .GET()
                .build()
            
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            val jsonResponse = json.parseToJsonElement(response.body()).jsonObject
            
            jsonResponse["ergo"]?.jsonObject?.get("usd")?.jsonPrimitive?.double
        } catch (e: Exception) {
            logger.warn(e) { "Failed to get ERG price from CoinGecko" }
            null
        }
    }
    
    private suspend fun getErgPriceFromSpectrum(): Double? = withContext(Dispatchers.IO) {
        try {
            val request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.spectrum.fi/v1/price/erg"))
                .GET()
                .build()
            
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            val jsonResponse = json.parseToJsonElement(response.body()).jsonObject
            
            jsonResponse["usd"]?.jsonPrimitive?.double
        } catch (e: Exception) {
            logger.warn(e) { "Failed to get ERG price from Spectrum" }
            null
        }
    }
    
    suspend fun getTokenPrice(tokenId: String): Double = withContext(Dispatchers.IO) {
        val cacheKey = "TOKEN_${tokenId}"
        val cached = priceCache[cacheKey]
        
        if (cached != null && (System.currentTimeMillis() - cached.second) < cacheTimeout) {
            return@withContext cached.first
        }
        
        try {
            val price = getTokenPriceFromSpectrum(tokenId) ?: 0.0
            priceCache[cacheKey] = Pair(price, System.currentTimeMillis())
            price
        } catch (e: Exception) {
            logger.error(e) { "Failed to fetch token price for $tokenId" }
            cached?.first ?: 0.0
        }
    }
    
    private suspend fun getTokenPriceFromSpectrum(tokenId: String): Double? = withContext(Dispatchers.IO) {
        try {
            val request = HttpRequest.newBuilder()
                .uri(URI.create("https://api.spectrum.fi/v1/price/$tokenId"))
                .GET()
                .build()
            
            val response = httpClient.send(request, HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() != 200) return@withContext null
            
            val jsonResponse = json.parseToJsonElement(response.body()).jsonObject
            jsonResponse["usd"]?.jsonPrimitive?.double
        } catch (e: Exception) {
            logger.warn(e) { "Failed to get token price from Spectrum for $tokenId" }
            null
        }
    }
    
    private suspend fun getTokenPrices(): Map<String, Double> = withContext(Dispatchers.IO) {
        // This would fetch prices for all known tokens
        // For now, return empty map
        emptyMap()
    }
    
    fun calculateUsdValue(ergAmount: Long, tokenAmounts: List<Pair<String, Long>> = emptyList()): Double {
        val ergPrice = priceCache["ERG_USD"]?.first ?: 0.0
        val ergUsdValue = (ergAmount.toDouble() / Math.pow(10.0, MewLockConstants.ERGO_DECIMALS.toDouble())) * ergPrice
        
        val tokenUsdValue = tokenAmounts.sumOf { (tokenId, amount) ->
            val tokenPrice = priceCache["TOKEN_$tokenId"]?.first ?: 0.0
            // Assuming default decimals for now - in real implementation,
            // you'd need to get token info to know decimals
            val tokenAmount = amount.toDouble() / Math.pow(10.0, 0.0)
            tokenAmount * tokenPrice
        }
        
        return ergUsdValue + tokenUsdValue
    }
    
    fun formatUsd(value: Double): String {
        return when {
            value >= 1_000_000 -> "$%.2fM".format(value / 1_000_000)
            value >= 1_000 -> "$%.1fK".format(value / 1_000)
            else -> "$%.2f".format(value)
        }
    }
    
    fun formatErg(value: Long): String {
        val ergAmount = value.toDouble() / Math.pow(10.0, MewLockConstants.ERGO_DECIMALS.toDouble())
        return when {
            ergAmount >= 1_000_000 -> "%.2fM ERG".format(ergAmount / 1_000_000)
            ergAmount >= 1_000 -> "%.1fK ERG".format(ergAmount / 1_000)
            else -> "%.4f ERG".format(ergAmount)
        }
    }
}