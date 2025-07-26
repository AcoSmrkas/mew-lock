@echo off
echo.
echo ============================================
echo    MewLock Mosaik Windows Setup
echo ============================================
echo.

echo [1/4] Checking Java installation...
java -version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Java is not installed
    echo.
    echo Please install Java 17+ using:
    echo   choco install openjdk17
    echo.
    echo Or download from: https://adoptium.net/temurin/releases/
    echo.
    pause
    exit /b 1
) else (
    echo ✓ Java is installed
)

echo.
echo [2/4] Setting up Gradle wrapper...
if not exist "gradle\wrapper\gradle-wrapper.jar" (
    echo Downloading Gradle wrapper...
    
    REM Create wrapper directory if it doesn't exist
    if not exist "gradle\wrapper" mkdir "gradle\wrapper"
    
    REM Download gradle-wrapper.jar
    curl -L -o "gradle\wrapper\gradle-wrapper.jar" "https://github.com/gradle/gradle/raw/v8.5.0/gradle/wrapper/gradle-wrapper.jar"
    
    if errorlevel 1 (
        echo ERROR: Failed to download Gradle wrapper
        echo.
        echo Manual setup required:
        echo 1. Install Gradle: choco install gradle
        echo 2. Or download wrapper manually from: https://gradle.org/releases/
        echo.
        pause
        exit /b 1
    )
    
    echo ✓ Gradle wrapper downloaded
) else (
    echo ✓ Gradle wrapper already exists
)

echo.
echo [3/4] Testing Gradle...
gradlew.bat --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Gradle wrapper not working
    echo Trying to initialize Gradle wrapper...
    
    REM Try to use system Gradle if available
    gradle --version >nul 2>&1
    if not errorlevel 1 (
        echo Using system Gradle to create wrapper...
        gradle wrapper --gradle-version 8.5
    ) else (
        echo Please install Gradle manually: choco install gradle
        pause
        exit /b 1
    )
) else (
    echo ✓ Gradle is working
)

echo.
echo [4/4] Testing build...
echo This may take a few minutes on first run...
gradlew.bat compileKotlin
if errorlevel 1 (
    echo ⚠ Build test failed, but setup is complete
    echo Try running: gradlew.bat clean build
) else (
    echo ✓ Build test successful
)

echo.
echo ============================================
echo    Setup Complete!
echo ============================================
echo.
echo Next steps:
echo   1. Run: run-mewlock.bat
echo   2. Or manually: gradlew.bat bootRun
echo   3. Test at: http://localhost:8080/mewlock/actuator/health
echo.
pause