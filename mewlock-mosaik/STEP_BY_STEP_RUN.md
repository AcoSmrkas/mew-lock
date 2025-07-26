# 🚀 Step-by-Step Guide to Run MewLock Mosaik

## ✅ Project Status
- **12 Kotlin files** implemented ✅
- **5 test files** created ✅  
- **APIs tested** - Ergo Explorer & CoinGecko working ✅
- **Complete Spring Boot application** ready ✅

## 📋 Step 1: Install Java 17+

### On Windows:
```powershell
# Using Chocolatey (recommended)
choco install openjdk17

# Or download from: https://adoptium.net/temurin/releases/
```

### On macOS:
```bash
# Using Homebrew
brew install openjdk@17

# Add to PATH
echo 'export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### On Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install openjdk-17-jdk

# Verify installation
java -version
```

**Expected output:**
```
openjdk version "17.0.x" 2023-xx-xx
OpenJDK Runtime Environment (build 17.0.x+x)
OpenJDK 64-Bit Server VM (build 17.0.x+x, mixed mode, sharing)
```

## 📂 Step 2: Navigate to Project

```bash
# Navigate to the project directory
cd /mnt/d/new/lock/mewlock-mosaik

# Verify you're in the right place
ls -la
# Should see: backend/, common/, ui/, build.gradle.kts, gradlew, etc.
```

## 🔧 Step 3: Build the Application

```bash
# Make gradle wrapper executable
chmod +x gradlew

# Clean any previous builds
./gradlew clean

# Compile the project
./gradlew compileKotlin

# Run tests (optional but recommended)
./gradlew test

# Build the complete application
./gradlew build

# Create executable JAR
./gradlew bootJar
```

**Expected output for successful build:**
```
BUILD SUCCESSFUL in Xs
5 actionable tasks: 5 executed
```

## 🏃 Step 4: Run the Application

### Option A: Using Gradle (Recommended for development)
```bash
./gradlew bootRun
```

### Option B: Using the JAR directly
```bash
java -jar backend/build/libs/backend-1.0.0.jar
```

**Expected startup output:**
```
  .   ____          _            __ _ _
 /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
( ( )\___ | '_ | '_| | '_ \/ _` | \ \ \ \
 \\/  ___)| |_)| | | | | || (_| |  ) ) ) )
  '  |____| .__|_| |_|_| |_\__, | / / / /
 =========|_|==============|___/=/_/_/_/
 :: Spring Boot ::               (v3.2.0)

INFO  MewLockApplication - Started MewLockApplication in X.XXX seconds
```

## 🌐 Step 5: Test the Application

### Browser Testing:

1. **Health Check:**
   ```
   http://localhost:8080/mewlock/actuator/health
   ```
   **Expected:** `{"status":"UP"}`

2. **Mosaik App Endpoint:**
   ```
   http://localhost:8080/mewlock/
   ```
   **Expected:** JSON with Mosaik app definition

3. **Application Info:**
   ```
   http://localhost:8080/mewlock/actuator/info
   ```

### Command Line Testing:
```bash
# Test health endpoint
curl http://localhost:8080/mewlock/actuator/health

# Test Mosaik endpoint
curl http://localhost:8080/mewlock/

# Test that external APIs are accessible
curl "https://api.ergoplatform.com/api/v1/info"
curl "https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd"
```

## 📱 Step 6: Mobile Testing with Mosaik Executor

### Download Mosaik Executor:
- **Android:** [Download APK](https://github.com/MrStahlfelge/mosaik/releases)
- **iOS:** Build from source (requires Xcode)

### Setup Mobile Connection:

1. **Find your computer's IP address:**
   ```bash
   # On Linux/macOS
   ip addr show | grep "inet " | grep -v 127.0.0.1
   
   # On Windows
   ipconfig | findstr "IPv4"
   ```

2. **Ensure both devices are on the same network**

3. **Open Mosaik Executor on your phone**

4. **Enter the URL:**
   ```
   http://YOUR_COMPUTER_IP:8080/mewlock
   ```
   Example: `http://192.168.1.100:8080/mewlock`

### Test Mobile Functionality:

1. **Home Screen** - Should show MewLock interface with statistics
2. **Navigation** - Test all tabs (Home, Create Lock, My Locks, Statistics)
3. **Wallet Connection** - Connect your Ergo wallet (Nautilus/Minotaur)
4. **Price Display** - Should show current ERG price (~$1.06)
5. **Lock Creation** - Test form with different durations
6. **Fee Calculations** - Verify 3% withdrawal fee display

## 🔧 Troubleshooting

### Common Issues:

**"Java not found"**
- Ensure Java 17+ is installed: `java -version`
- Check JAVA_HOME is set correctly

**"Port 8080 already in use"**
```bash
# Kill process using port 8080
sudo lsof -i :8080
sudo kill -9 <PID>
```

**"Permission denied: ./gradlew"**
```bash
chmod +x gradlew
```

**Mobile app can't connect**
- Check firewall allows port 8080
- Verify both devices on same network  
- Test with browser first: `http://YOUR_IP:8080/mewlock/actuator/health`

**Build fails**
```bash
./gradlew clean
./gradlew build --refresh-dependencies --info
```

## 📊 What You Should See

### Successful Application Startup:
- Spring Boot banner
- "Started MewLockApplication" message
- No error messages in console

### Browser Tests:
- Health endpoint returns: `{"status":"UP"}`
- Mosaik endpoint returns JSON with app definition
- No 404 or 500 errors

### Mobile App:
- Professional MewLock interface loads
- Current ERG price displays (~$1.06)
- All navigation works smoothly
- Wallet connection prompt appears
- Lock creation form with all durations (1 week to 10 years)
- Fee calculator shows 3% withdrawal fee

## 🎯 Success Criteria

✅ **Application starts without errors**  
✅ **Health endpoint responds**  
✅ **Mosaik endpoint serves app definition**  
✅ **Mobile app connects and displays UI**  
✅ **Wallet integration prompts work**  
✅ **Real ERG prices display**  
✅ **All navigation functions**  

## 🚨 If You Need Help

If you encounter any issues:

1. **Check the console output** for error messages
2. **Verify Java version** is 17 or higher
3. **Test API connectivity** with curl commands
4. **Check network/firewall** settings for port 8080
5. **Review the logs** for specific error details

The application is fully implemented and ready to run! 🎉

### Quick Start Command Summary:
```bash
cd /mnt/d/new/lock/mewlock-mosaik
chmod +x gradlew
./gradlew clean build
./gradlew bootRun
# Then test: http://localhost:8080/mewlock/actuator/health
```