# 🚀 How to Run MewLock Mosaik Locally

## ✅ API Validation Results
- **Ergo Explorer API**: ✅ Working (Current height: ~1,576,452)
- **CoinGecko API**: ✅ Working (ERG price: ~$1.06)
- **Spectrum API**: ⚠️ Endpoint changed (fallback available)

## 📋 Prerequisites

### 1. Install Java 17 or Higher
```bash
# On Ubuntu/Debian
sudo apt update
sudo apt install openjdk-17-jdk

# On Windows (with Chocolatey)
choco install openjdk17

# On macOS (with Homebrew)
brew install openjdk@17

# Verify installation
java -version
# Should show: openjdk version "17.x.x"
```

### 2. Verify Project Structure
```bash
cd /mnt/d/new/lock/mewlock-mosaik
ls -la
# Should see: backend/, common/, ui/, build.gradle.kts, gradlew
```

## 🔧 Build and Run Steps

### Step 1: Make Gradle Wrapper Executable
```bash
chmod +x gradlew
```

### Step 2: Clean and Build
```bash
# Clean previous builds
./gradlew clean

# Compile the project
./gradlew compileKotlin

# Run tests (optional but recommended)
./gradlew test

# Build the complete application
./gradlew build
```

### Step 3: Start the Application
```bash
# Start the Spring Boot application
./gradlew bootRun

# Alternative: Run the JAR directly
# ./gradlew bootJar
# java -jar backend/build/libs/backend-1.0.0.jar
```

### Step 4: Verify Application is Running
```bash
# In a new terminal, test the endpoints:

# Health check
curl http://localhost:8080/mewlock/actuator/health
# Expected: {"status":"UP"}

# Mosaik app endpoint
curl http://localhost:8080/mewlock/
# Expected: JSON with Mosaik app definition

# Application info
curl http://localhost:8080/mewlock/actuator/info
# Expected: Application information
```

## 📱 Mobile Testing with Mosaik Executor

### Step 1: Download Mosaik Executor
- **Android**: [Download APK](https://github.com/MrStahlfelge/mosaik/releases)
- **iOS**: Build from source (requires Xcode)

### Step 2: Connect Mobile App
1. Ensure your computer and mobile device are on the same network
2. Find your computer's IP address:
   ```bash
   # On Linux/macOS
   ip addr show | grep "inet " | grep -v 127.0.0.1
   
   # On Windows
   ipconfig | findstr "IPv4"
   ```
3. Open Mosaik Executor on your mobile device
4. Enter URL: `http://YOUR_COMPUTER_IP:8080/mewlock`
   - Example: `http://192.168.1.100:8080/mewlock`

### Step 3: Test Functionality
1. **Home Screen**: Should show MewLock interface with statistics
2. **Connect Wallet**: Tap to connect your Ergo wallet (Nautilus/Minotaur)
3. **Create Lock**: Test lock creation flow with different durations
4. **My Locks**: View your existing locks (if any)
5. **Statistics**: Check global stats and leaderboard

## 🔍 Troubleshooting

### Build Issues

**Problem**: `./gradlew: command not found`
```bash
# Solution: Make it executable
chmod +x gradlew
# Or use gradle directly if installed
gradle build
```

**Problem**: Java version errors
```bash
# Check Java version
java -version
# Must be 17 or higher

# Set JAVA_HOME if needed
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
```

**Problem**: Compilation errors
```bash
# Clean and retry
./gradlew clean
./gradlew build --refresh-dependencies
```

### Runtime Issues

**Problem**: Port 8080 already in use
```bash
# Kill process using port 8080
sudo lsof -i :8080
sudo kill -9 <PID>

# Or change port in application.yml
# server.port: 8081
```

**Problem**: Application won't start
```bash
# Check logs
./gradlew bootRun --info

# Or check application logs
tail -f logs/application.log
```

### Mobile Connection Issues

**Problem**: Can't connect from mobile app
1. Check firewall settings - allow port 8080
2. Verify both devices on same network
3. Try accessing from mobile browser first: `http://YOUR_IP:8080/mewlock/actuator/health`

**Problem**: Wallet connection fails
1. Ensure Ergo wallet app is installed
2. Check wallet app supports Mosaik/dApp connections
3. Try different wallet (Nautilus vs Minotaur)

## 📊 Testing Checklist

### Backend Testing
- [ ] Application starts without errors
- [ ] Health endpoint responds: `curl http://localhost:8080/mewlock/actuator/health`
- [ ] Mosaik endpoint responds: `curl http://localhost:8080/mewlock/`
- [ ] APIs are accessible (Ergo Explorer, CoinGecko)
- [ ] Logs show no errors: `./gradlew bootRun`

### Mobile Testing
- [ ] Mobile app connects to server
- [ ] Home screen loads with statistics
- [ ] Navigation works (Home, Create, My Locks, Stats)
- [ ] Wallet connection flow works
- [ ] Lock creation form functions
- [ ] Price data displays correctly

### Functional Testing
- [ ] Real ERG prices display (current: ~$1.06)
- [ ] Lock durations selectable (1 week to 10 years)
- [ ] Fee calculations show 3% withdrawal fee
- [ ] Storage rent warning for >4 year locks
- [ ] USD values display throughout interface

## 🎯 Expected Results

When everything is working correctly:

1. **Console Output**: Application starts with Spring Boot banner and "Started MewLockApplication"
2. **Health Check**: Returns `{"status":"UP"}`
3. **Mobile App**: Shows professional MewLock interface
4. **Price Data**: Displays current ERG price (~$1.06)
5. **Lock Creation**: Form with validation and fee preview
6. **Statistics**: Global stats with total locks and value

## 🚨 Quick Start Commands

```bash
# Complete setup and run
cd /mnt/d/new/lock/mewlock-mosaik
chmod +x gradlew
./gradlew clean build
./gradlew bootRun

# In another terminal - test
curl http://localhost:8080/mewlock/actuator/health

# Then test mobile app at:
# http://YOUR_IP:8080/mewlock
```

## 📞 Need Help?

If you encounter issues:
1. Check the console output for error messages
2. Verify Java 17+ is installed: `java -version`
3. Ensure network connectivity to APIs
4. Check firewall allows port 8080
5. Try accessing health endpoint first

The application is fully implemented and ready to run! 🎉