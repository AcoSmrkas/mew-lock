@echo off
echo.
echo ============================================
echo    MewLock Mosaik Application Runner
echo ============================================
echo.

REM Check if we're in the right directory
if not exist "build.gradle.kts" (
    echo ERROR: build.gradle.kts not found
    echo Please run this script from the mewlock-mosaik directory
    echo Current directory: %CD%
    pause
    exit /b 1
)

echo [1/5] Checking Java installation...
java -version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Java is not installed or not in PATH
    echo.
    echo Please install Java 17+ using one of these methods:
    echo   1. Chocolatey: choco install openjdk17
    echo   2. Manual: Download from https://adoptium.net/temurin/releases/
    echo.
    pause
    exit /b 1
) else (
    echo ✓ Java is installed
)

echo.
echo [2/5] Testing API connectivity...
curl -s --max-time 5 "https://api.ergoplatform.com/api/v1/info" | findstr "height" >nul
if errorlevel 1 (
    echo ⚠ Ergo Explorer API: Connection issue ^(continuing anyway^)
) else (
    echo ✓ Ergo Explorer API: Connected
)

curl -s --max-time 5 "https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd" | findstr "ergo" >nul
if errorlevel 1 (
    echo ⚠ CoinGecko API: Connection issue ^(continuing anyway^)
) else (
    echo ✓ CoinGecko API: Connected
)

echo.
echo [3/5] Cleaning previous builds...
gradlew.bat clean
if errorlevel 1 (
    echo ERROR: Clean failed
    pause
    exit /b 1
)
echo ✓ Clean completed

echo.
echo [4/5] Building application...
gradlew.bat build
if errorlevel 1 (
    echo ERROR: Build failed
    echo.
    echo Common solutions:
    echo   1. Check Java version: java -version
    echo   2. Check internet connection for dependencies
    echo   3. Try: gradlew.bat clean build --refresh-dependencies
    echo.
    pause
    exit /b 1
)
echo ✓ Build completed successfully

echo.
echo [5/5] Starting MewLock Mosaik application...
echo.
echo ============================================
echo    Application Starting
echo ============================================
echo.
echo The application will be available at:
echo   Local:  http://localhost:8080/mewlock
echo   Health: http://localhost:8080/mewlock/actuator/health
echo.
echo For mobile testing:
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr "IPv4"') do (
    set IP=%%a
    goto :found_ip
)
:found_ip
echo   Mobile: http://%IP: =%:8080/mewlock
echo.
echo Download Mosaik Executor from:
echo   https://github.com/MrStahlfelge/mosaik/releases
echo.
echo Press Ctrl+C to stop the application
echo ============================================
echo.

REM Start the application
gradlew.bat bootRun