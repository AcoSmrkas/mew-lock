# MewLock Mosaik Testing Guide

This guide provides comprehensive testing instructions for the MewLock Mosaik application.

## Prerequisites

Before testing, ensure you have:

- **Java 17+**: `java -version` should show version 17 or higher
- **Gradle 8.0+**: Project includes wrapper, but you can install Gradle separately
- **Android SDK** (for mobile testing): Required for Mosaik Executor
- **Ergo Wallet**: Nautilus, Minotaur, or compatible wallet
- **Internet Connection**: For API calls to Ergo Explorer, CoinGecko, Spectrum

## Quick Start Testing

### 1. Environment Setup

```bash
# Clone/navigate to project
cd mewlock-mosaik

# Verify Java installation
java -version

# Check project structure
ls -la
# Should see: backend/, common/, ui/, build.gradle.kts, README.md
```

### 2. Build and Test

```bash
# Clean and build
./gradlew clean build

# Run unit tests
./gradlew test

# Generate test reports
./gradlew jacocoTestReport

# Build JAR
./gradlew bootJar
```

### 3. Start Application

```bash
# Start development server
./gradlew bootRun

# Application will be available at:
# http://localhost:8080/mewlock
```

## Detailed Testing Procedures

### Unit Tests

**Test Categories:**
- Service layer tests (ErgoService, PriceService, LockService)
- Controller tests (MewLockController)
- Data model validation
- API integration tests

**Run specific test suites:**
```bash
# All tests
./gradlew test

# Service tests only
./gradlew test --tests="*Service*"

# Controller tests only
./gradlew test --tests="*Controller*"

# Integration tests only
./gradlew test --tests="*Integration*"
```

**Expected Results:**
- All unit tests should pass
- Test coverage should be > 80%
- No compilation errors

### API Integration Tests

**Test External APIs:**

1. **Ergo Explorer API**
   ```bash
   curl "https://api.ergoplatform.com/api/v1/info"
   # Should return current blockchain height
   ```

2. **CoinGecko API**
   ```bash
   curl "https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd"
   # Should return ERG price in USD
   ```

3. **Spectrum API**
   ```bash
   curl "https://api.spectrum.fi/v1/price/erg"
   # Should return ERG price or 404
   ```

**Expected Results:**
- All APIs should respond with 200 status
- JSON responses should contain expected fields
- Price data should be reasonable (ERG: $0.50-$10 range)

### Application Testing

**Start the application:**
```bash
./gradlew bootRun
```

**Test endpoints:**

1. **Health Check**
   ```bash
   curl http://localhost:8080/mewlock/actuator/health
   # Should return: {"status":"UP"}
   ```

2. **Mosaik Root**
   ```bash
   curl http://localhost:8080/mewlock/
   # Should return Mosaik app definition JSON
   ```

3. **Application Info**
   ```bash
   curl http://localhost:8080/mewlock/actuator/info
   # Should return app information
   ```

### Mobile Testing with Mosaik Executor

**Setup Mosaik Executor:**

1. **Download Mosaik Executor:**
   - Android: [GitHub Releases](https://github.com/MrStahlfelge/mosaik/releases)
   - iOS: Build from source (requires Xcode)

2. **Install on device**

3. **Configure network access:**
   - Ensure your server is accessible from mobile device
   - If testing locally, use your computer's IP address
   - Example: `http://192.168.1.100:8080/mewlock`

**Testing Procedure:**

1. **Connect to App:**
   - Open Mosaik Executor
   - Enter URL: `http://your-server-ip:8080/mewlock`
   - Should see MewLock home screen

2. **Test Navigation:**
   - Tap navigation buttons (Home, Create Lock, My Locks, Statistics)
   - All views should load without errors

3. **Test Wallet Connection:**
   - Tap "Connect Wallet"
   - Should integrate with device wallet
   - Verify address and balance display

4. **Test Lock Creation:**
   - Navigate to "Create Lock"
   - Enter ERG amount (minimum 0.1)
   - Select duration
   - Verify fee calculations
   - Create lock (requires wallet signature)

5. **Test My Locks:**
   - Navigate to "My Locks"
   - Should show user's locks
   - Test unlock functionality for ready locks

6. **Test Statistics:**
   - Navigate to "Statistics"
   - Should show global stats and leaderboard

## Performance Testing

### Load Testing

```bash
# Test concurrent requests
for i in {1..10}; do
  curl -s http://localhost:8080/mewlock/ &
done
wait

# Monitor response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:8080/mewlock/
```

Create `curl-format.txt`:
```
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
```

**Expected Performance:**
- Response time < 2 seconds for UI requests
- API calls < 5 seconds (depending on external APIs)
- No memory leaks during extended operation

### Memory Testing

```bash
# Monitor memory usage
top -p $(pgrep -f "mewlock")

# Or use JVM monitoring
jstat -gc $(pgrep -f "mewlock") 5s
```

## Blockchain Testing

### Test with Real Data

1. **Verify Contract Address:**
   - Contract: `QjvCfNTp9tLHWqvhfZL6rYtcC3TYkPm7GthjCPQh4uFBKHJXRU`
   - Check on Ergo Explorer: https://explorer.ergoplatform.com/

2. **Test Data Parsing:**
   - Fetch actual MewLock boxes
   - Verify register parsing (R4: depositor, R5: unlock height)
   - Check USD value calculations

3. **Test Edge Cases:**
   - Empty box lists
   - Invalid register data
   - Network timeouts
   - API rate limiting

## Security Testing

### Input Validation

1. **Test Invalid Inputs:**
   - Negative ERG amounts
   - Invalid addresses
   - Malformed requests

2. **Test API Security:**
   - No sensitive data in logs
   - Proper error handling
   - Rate limiting (if implemented)

3. **Test Transaction Security:**
   - No private key storage
   - Proper transaction signing flow
   - Fee validation

## Troubleshooting Common Issues

### Build Issues

**Problem:** Compilation errors
**Solution:** 
- Check Java version (must be 17+)
- Update dependencies in build.gradle.kts
- Clean build directory: `./gradlew clean`

**Problem:** Test failures
**Solution:**
- Check network connectivity for API tests
- Verify test data expectations
- Run tests individually to isolate issues

### Runtime Issues

**Problem:** Application won't start
**Solution:**
- Check port 8080 is available
- Verify Java runtime environment
- Check application logs

**Problem:** API calls failing
**Solution:**
- Test external APIs manually with curl
- Check firewall/proxy settings
- Verify API endpoints in configuration

### Mobile Issues

**Problem:** Can't connect to app
**Solution:**
- Verify server is running and accessible
- Check IP address and port
- Ensure mobile device and server on same network

**Problem:** Wallet connection fails
**Solution:**
- Ensure compatible wallet is installed
- Check wallet permissions
- Verify wallet supports Mosaik protocol

## Automated Testing

### CI/CD Pipeline

Create `.github/workflows/test.yml`:
```yaml
name: Test MewLock Mosaik

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Set up JDK 17
      uses: actions/setup-java@v3
      with:
        java-version: '17'
        distribution: 'temurin'
    
    - name: Cache Gradle packages
      uses: actions/cache@v3
      with:
        path: ~/.gradle/caches
        key: ${{ runner.os }}-gradle-${{ hashFiles('**/*.gradle*') }}
        restore-keys: ${{ runner.os }}-gradle
    
    - name: Run tests
      run: ./gradlew test
      
    - name: Generate test report
      run: ./gradlew jacocoTestReport
      
    - name: Build application
      run: ./gradlew build
```

## Test Checklist

### Pre-deployment Checklist

- [ ] All unit tests pass
- [ ] Integration tests pass  
- [ ] API endpoints respond correctly
- [ ] Mobile app loads and functions
- [ ] Wallet integration works
- [ ] Lock creation flow complete
- [ ] Fee calculations correct
- [ ] Price data loading
- [ ] Error handling graceful
- [ ] Performance acceptable
- [ ] Security validated
- [ ] Documentation up-to-date

### Post-deployment Verification

- [ ] Application accessible via public URL
- [ ] Mobile app connects successfully
- [ ] Real blockchain data loading
- [ ] Transaction creation works
- [ ] User locks display correctly
- [ ] Statistics accurate
- [ ] No errors in logs
- [ ] Performance monitoring active

## Support and Debugging

### Log Analysis

**Application Logs:**
```bash
# View application logs
tail -f logs/application.log

# Filter for errors
grep ERROR logs/application.log

# Monitor API calls
grep "Backend request" logs/application.log
```

**Common Log Patterns:**
- `Backend request: navigate` - UI navigation
- `Backend request: connectWallet` - Wallet connection
- `Backend request: createLock` - Lock creation
- `Failed to fetch` - API errors
- `Transaction built` - Successful transaction creation

### Performance Monitoring

```bash
# Monitor JVM metrics
curl http://localhost:8080/mewlock/actuator/metrics

# Check memory usage
curl http://localhost:8080/mewlock/actuator/metrics/jvm.memory.used

# Monitor HTTP requests
curl http://localhost:8080/mewlock/actuator/metrics/http.server.requests
```

For production deployment, consider:
- Application Performance Monitoring (APM) tools
- Log aggregation (ELK stack)
- Monitoring dashboards (Grafana)
- Alerting systems

## Conclusion

This testing guide covers all aspects of validating the MewLock Mosaik application. Follow the procedures in order, starting with unit tests and progressing to full integration testing with mobile devices.

Remember to test with real Ergo wallets and actual blockchain data to ensure complete functionality before production deployment.