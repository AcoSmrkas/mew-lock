#!/bin/bash

# MewLock Mosaik Application Runner
# This script will help you build and run the MewLock Mosaik application

set -e

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

echo "🚀 MewLock Mosaik Application Runner"
echo "===================================="
echo ""

# Step 1: Check prerequisites
print_step "Checking prerequisites..."

# Check if we're in the right directory
if [ ! -f "build.gradle.kts" ]; then
    print_error "build.gradle.kts not found. Please run this script from the mewlock-mosaik directory."
    exit 1
fi

print_success "Project directory confirmed"

# Check Java version
if command -v java &> /dev/null; then
    JAVA_VERSION=$(java -version 2>&1 | head -n1 | cut -d'"' -f2 | cut -d'.' -f1)
    if [ "$JAVA_VERSION" -ge 17 ]; then
        print_success "Java $JAVA_VERSION found"
    else
        print_error "Java 17 or higher is required. Current version: $JAVA_VERSION"
        echo "Please install Java 17+:"
        echo "  Ubuntu/Debian: sudo apt install openjdk-17-jdk"
        echo "  Windows: choco install openjdk17"
        echo "  macOS: brew install openjdk@17"
        exit 1
    fi
else
    print_error "Java is not installed or not in PATH"
    echo ""
    echo "Please install Java 17 or higher:"
    echo "  Ubuntu/Debian: sudo apt update && sudo apt install openjdk-17-jdk"
    echo "  Windows (with Chocolatey): choco install openjdk17"
    echo "  macOS (with Homebrew): brew install openjdk@17"
    echo ""
    echo "After installation, verify with: java -version"
    exit 1
fi

# Make gradlew executable
if [ -f "gradlew" ]; then
    chmod +x gradlew
    print_success "Gradle wrapper permissions set"
else
    print_error "Gradle wrapper not found"
    exit 1
fi

echo ""

# Step 2: Test API connectivity
print_step "Testing API connectivity..."

# Test Ergo Explorer API
if curl -s --max-time 10 "https://api.ergoplatform.com/api/v1/info" | grep -q "height"; then
    print_success "Ergo Explorer API: Connected"
else
    print_warning "Ergo Explorer API: Connection failed (continuing anyway)"
fi

# Test CoinGecko API
if curl -s --max-time 10 "https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd" | grep -q "ergo"; then
    print_success "CoinGecko API: Connected"
else
    print_warning "CoinGecko API: Connection failed (continuing anyway)"
fi

echo ""

# Step 3: Build the application
print_step "Building the application..."

echo "Cleaning previous builds..."
if ./gradlew clean; then
    print_success "Clean completed"
else
    print_error "Clean failed"
    exit 1
fi

echo ""
echo "Compiling Kotlin code..."
if ./gradlew compileKotlin; then
    print_success "Compilation successful"
else
    print_error "Compilation failed"
    exit 1
fi

echo ""
echo "Running tests..."
if ./gradlew test; then
    print_success "All tests passed"
else
    print_warning "Some tests failed (continuing with build)"
fi

echo ""
echo "Building JAR..."
if ./gradlew bootJar; then
    print_success "JAR build successful"
    
    # Check JAR size
    if [ -f "backend/build/libs/backend-1.0.0.jar" ]; then
        JAR_SIZE=$(du -h backend/build/libs/backend-1.0.0.jar | cut -f1)
        print_success "JAR created: backend/build/libs/backend-1.0.0.jar ($JAR_SIZE)"
    fi
else
    print_error "JAR build failed"
    exit 1
fi

echo ""

# Step 4: Start the application
print_step "Starting the MewLock Mosaik application..."

echo ""
echo "🎉 Build completed successfully!"
echo ""
echo "Starting application server..."
echo "The application will be available at:"
echo "  - Local: http://localhost:8080/mewlock"
echo "  - Health: http://localhost:8080/mewlock/actuator/health"
echo ""
echo "For mobile testing:"
echo "1. Find your IP address: ip addr show | grep 'inet '"
echo "2. Download Mosaik Executor: https://github.com/MrStahlfelge/mosaik/releases"
echo "3. Connect to: http://YOUR_IP:8080/mewlock"
echo ""
echo "Press Ctrl+C to stop the application"
echo ""

# Start the application
exec ./gradlew bootRun