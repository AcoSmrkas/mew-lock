# 🚀 Running MewLock Mosaik on Windows

## 📋 Step 1: Install Java 17+

### Option A: Using Chocolatey (Recommended)
1. **Install Chocolatey** (if not already installed):
   - Open PowerShell as Administrator
   - Run:
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```

2. **Install Java 17:**
   ```powershell
   choco install openjdk17
   ```

### Option B: Manual Installation
1. Download OpenJDK 17 from: https://adoptium.net/temurin/releases/
2. Choose: **OpenJDK 17 LTS** → **Windows** → **x64** → **MSI**
3. Run the installer
4. Add to PATH (installer usually does this automatically)

### Verify Java Installation
```cmd
java -version
```
**Expected output:**
```
openjdk version "17.0.x" 2023-xx-xx
OpenJDK Runtime Environment (build 17.0.x+x)
OpenJDK 64-Bit Server VM (build 17.0.x+x, mixed mode, sharing)
```

## 📂 Step 2: Navigate to Project

**Using Command Prompt:**
```cmd
cd /d D:\new\lock\mewlock-mosaik
dir
```

**Using PowerShell:**
```powershell
cd D:\new\lock\mewlock-mosaik
ls
```

**Expected files:**
- `backend/`
- `common/`
- `ui/`
- `build.gradle.kts`
- `gradlew.bat` (Windows Gradle wrapper)
- `README.md`

## 🔧 Step 3: Build the Application

**Using Command Prompt:**
```cmd
REM Clean and build
gradlew.bat clean
gradlew.bat compileKotlin
gradlew.bat test
gradlew.bat build
gradlew.bat bootJar
```

**Using PowerShell:**
```powershell
# Clean and build
.\gradlew.bat clean
.\gradlew.bat compileKotlin
.\gradlew.bat test
.\gradlew.bat build
.\gradlew.bat bootJar
```

## 🏃 Step 4: Run the Application

**Using Command Prompt:**
```cmd
gradlew.bat bootRun
```

**Using PowerShell:**
```powershell
.\gradlew.bat bootRun
```

**Alternative - Run JAR directly:**
```cmd
java -jar backend\build\libs\backend-1.0.0.jar
```

## 🌐 Step 5: Test the Application

### Open your browser and test:

1. **Health Check:**
   ```
   http://localhost:8080/mewlock/actuator/health
   ```
   **Should show:** `{"status":"UP"}`

2. **Mosaik App:**
   ```
   http://localhost:8080/mewlock/
   ```
   **Should show:** JSON with Mosaik app definition

### Command Line Testing:
```cmd
REM Test health endpoint
curl http://localhost:8080/mewlock/actuator/health

REM Test Mosaik endpoint  
curl http://localhost:8080/mewlock/

REM Test external APIs
curl "https://api.ergoplatform.com/api/v1/info"
curl "https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd"
```

## 📱 Step 6: Mobile Testing

### Find Your Windows IP Address:
```cmd
ipconfig | findstr "IPv4"
```
**Example output:** `IPv4 Address. . . . . . . . . . . : 192.168.1.100`

### Download Mosaik Executor:
1. Go to: https://github.com/MrStahlfelge/mosaik/releases
2. Download the latest Android APK
3. Install on your Android device

### Connect Mobile App:
1. Open Mosaik Executor on your phone
2. Enter URL: `http://192.168.1.100:8080/mewlock` (use your actual IP)
3. Should load the MewLock interface

## 🛠️ Windows-Specific Troubleshooting

### Java Issues:
**"Java not found"**
- Check if Java is in PATH: `echo %JAVA_HOME%`
- Restart Command Prompt after installing Java
- Try: `where java` to locate Java installation

**JAVA_HOME not set:**
```cmd
set JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.x.x-hotspot
set PATH=%JAVA_HOME%\bin;%PATH%
```

### Port Issues:
**"Port 8080 already in use"**
```cmd
REM Find process using port 8080
netstat -ano | findstr :8080

REM Kill the process (replace PID with actual number)
taskkill /PID 1234 /F
```

### Firewall Issues:
1. Open **Windows Defender Firewall**
2. Click **"Allow an app or feature through Windows Defender Firewall"**
3. Click **"Change Settings"** → **"Allow another app"**
4. Browse to your Java installation: `C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot\bin\java.exe`
5. Allow for **Private** and **Public** networks

### Gradle Issues:
**"gradlew.bat not found"**
- Use `gradlew` (without .bat) in some cases
- Or install Gradle manually: `choco install gradle`

**Permission denied:**
- Run Command Prompt as Administrator
- Or use PowerShell: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

## 🎯 Windows Quick Start Script

Create `run-mewlock.bat`:
```batch
@echo off
echo Starting MewLock Mosaik Application...
echo.

REM Check Java
java -version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Java is not installed or not in PATH
    echo Please install Java 17+ from: https://adoptium.net/temurin/releases/
    pause
    exit /b 1
)

REM Build and run
echo Building application...
gradlew.bat clean build
if errorlevel 1 (
    echo Build failed!
    pause
    exit /b 1
)

echo.
echo Starting application...
echo Access at: http://localhost:8080/mewlock/actuator/health
echo Mobile access: http://YOUR_IP:8080/mewlock
echo.
echo Press Ctrl+C to stop the application
echo.

gradlew.bat bootRun
```

## 📊 Expected Results

### Successful Startup:
- Spring Boot banner displays
- "Started MewLockApplication in X.XXX seconds"
- No error messages

### Browser Tests:
- `http://localhost:8080/mewlock/actuator/health` → `{"status":"UP"}`
- `http://localhost:8080/mewlock/` → Mosaik JSON response

### Mobile App:
- Professional MewLock interface
- Real ERG price display (~$1.06)
- Wallet connection prompts
- Lock creation form with all durations
- Statistics and leaderboard

## 🚨 Common Windows Issues

### Antivirus/Windows Defender:
- May block Java or network connections
- Add Java to exclusions if needed
- Allow port 8080 in firewall

### Network Issues:
- Ensure Windows firewall allows Java
- Check if VPN affects local network
- Try disabling Windows firewall temporarily for testing

### Path Issues:
- Windows paths use backslashes: `D:\new\lock\mewlock-mosaik`
- Use quotes for paths with spaces: `"D:\My Projects\mewlock-mosaik"`

## ✅ Success Checklist

- [ ] Java 17+ installed and in PATH
- [ ] Project files accessible at `D:\new\lock\mewlock-mosaik`
- [ ] Build completes without errors
- [ ] Application starts with Spring Boot banner
- [ ] Health endpoint returns `{"status":"UP"}`
- [ ] Mobile app connects to your Windows IP
- [ ] ERG prices display correctly
- [ ] All navigation works in mobile app

**You're ready to run MewLock Mosaik on Windows! 🎉**

### Quick Commands Summary:
```cmd
cd /d D:\new\lock\mewlock-mosaik
gradlew.bat clean build
gradlew.bat bootRun
REM Test: http://localhost:8080/mewlock/actuator/health
```