#!/bin/bash

# MewLock Mosaik Application Testing Script
set -e

echo "🔧 MewLock Mosaik Testing Suite"
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}➤${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check prerequisites
print_step "Checking prerequisites..."

if ! command -v java &> /dev/null; then
    print_error "Java is not installed. Please install Java 17 or higher."
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -n1 | cut -d'"' -f2 | cut -d'.' -f1)
if [ "$JAVA_VERSION" -lt 17 ]; then
    print_error "Java 17 or higher is required. Current version: $JAVA_VERSION"
    exit 1
fi

if ! command -v ./gradlew &> /dev/null; then
    print_error "Gradle wrapper not found. Make sure you're in the project directory."
    exit 1
fi

print_success "Prerequisites check passed"

# Clean build
print_step "Cleaning previous builds..."
./gradlew clean
print_success "Clean completed"

# Compile project
print_step "Compiling project..."
if ./gradlew compileKotlin; then
    print_success "Compilation successful"
else
    print_error "Compilation failed"
    exit 1
fi

# Run unit tests
print_step "Running unit tests..."
if ./gradlew test; then
    print_success "All unit tests passed"
else
    print_warning "Some unit tests failed - check test reports"
fi

# Generate test report
print_step "Generating test reports..."
./gradlew jacocoTestReport
print_success "Test reports generated in build/reports/"

# Build application
print_step "Building application..."
if ./gradlew build; then
    print_success "Build successful"
else
    print_error "Build failed"
    exit 1
fi

# Check if application starts
print_step "Testing application startup..."
timeout 30s ./gradlew bootRun &
APP_PID=$!
sleep 15

# Check if app is running
if kill -0 $APP_PID 2>/dev/null; then
    print_success "Application started successfully"
    
    # Test basic endpoints
    print_step "Testing application endpoints..."
    
    # Test health endpoint
    if curl -f http://localhost:8080/mewlock/actuator/health >/dev/null 2>&1; then
        print_success "Health endpoint responding"
    else
        print_warning "Health endpoint not responding"
    fi
    
    # Test Mosaik endpoint
    if curl -f http://localhost:8080/mewlock/ >/dev/null 2>&1; then
        print_success "Mosaik endpoint responding"
    else
        print_warning "Mosaik endpoint not responding"
    fi
    
    # Stop application
    kill $APP_PID
    wait $APP_PID 2>/dev/null
    print_success "Application stopped"
else
    print_error "Application failed to start"
    exit 1
fi

# API Integration Tests
print_step "Running API integration tests..."

echo "Testing Ergo Explorer API..."
if curl -f "https://api.ergoplatform.com/api/v1/info" >/dev/null 2>&1; then
    print_success "Ergo Explorer API accessible"
else
    print_warning "Ergo Explorer API not accessible - check network connection"
fi

echo "Testing CoinGecko API..."
if curl -f "https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd" >/dev/null 2>&1; then
    print_success "CoinGecko API accessible"
else
    print_warning "CoinGecko API not accessible - price data may not work"
fi

echo "Testing Spectrum API..."
if curl -f "https://api.spectrum.fi/v1/price/erg" >/dev/null 2>&1; then
    print_success "Spectrum API accessible"
else
    print_warning "Spectrum API not accessible - token prices may not work"
fi

# Performance tests
print_step "Running performance tests..."

echo "Testing concurrent requests..."
for i in {1..10}; do
    curl -s http://localhost:8080/mewlock/ &
done
wait
print_success "Concurrent request test completed"

echo ""
echo "🎉 Testing completed!"
echo "================================"
echo ""
echo "📊 Test Results Summary:"
echo "- Unit Tests: Check build/reports/tests/test/"
echo "- Coverage: Check build/reports/jacoco/test/html/"
echo "- Build Artifacts: Check build/libs/"
echo ""
echo "🚀 Next Steps:"
echo "1. Review test reports for any failures"
echo "2. Test with Mosaik Executor mobile app:"
echo "   - Install Mosaik Executor on Android/iOS"
echo "   - Connect to: http://your-server-ip:8080/mewlock"
echo "3. Connect your Ergo wallet and test functionality"
echo ""
echo "📱 Mobile Testing:"
echo "1. Download Mosaik Executor:"
echo "   - Android: https://github.com/MrStahlfelge/mosaik/releases"
echo "   - iOS: Build from source"
echo "2. Start the application: ./gradlew bootRun"
echo "3. Open Mosaik Executor and enter URL: http://YOUR_IP:8080/mewlock"
echo "4. Connect your Ergo wallet (Nautilus/Minotaur)"
echo "5. Test creating locks and viewing statistics"
echo ""
echo "🔧 Development:"
echo "- Start dev server: ./gradlew bootRun"
echo "- Run tests: ./gradlew test"
echo "- Check logs: tail -f logs/application.log"