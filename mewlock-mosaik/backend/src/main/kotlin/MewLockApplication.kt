package com.mewfinance.mewlock.backend

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class MewLockApplication

fun main(args: Array<String>) {
    runApplication<MewLockApplication>(*args)
}