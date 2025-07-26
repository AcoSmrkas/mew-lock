#!/bin/bash

# Quick MewLock Mosaik Build Test
echo "🚀 Quick Build Test for MewLock Mosaik"
echo "======================================"

cd /mnt/d/new/lock/mewlock-mosaik

# Check if we're in the right directory
if [ ! -f "build.gradle.kts" ]; then
    echo "❌ build.gradle.kts not found. Make sure you're in the project directory."
    exit 1
fi

echo "✓ Project directory confirmed"

# Clean and compile
echo ""
echo "🧹 Cleaning previous builds..."
./gradlew clean

echo ""
echo "🔨 Compiling project..."
if ./gradlew compileKotlin; then
    echo "✅ Compilation successful!"
else
    echo "❌ Compilation failed!"
    exit 1
fi

# Run quick tests
echo ""
echo "🧪 Running quick tests..."
if ./gradlew test --tests="*Test" --info; then
    echo "✅ Tests passed!"
else
    echo "⚠️  Some tests failed - check output above"
fi

# Try to build the JAR
echo ""
echo "📦 Building JAR..."
if ./gradlew bootJar; then
    echo "✅ JAR built successfully!"
    
    # Check if JAR exists
    if [ -f "backend/build/libs/backend-1.0.0.jar" ]; then
        echo "✅ JAR file created: backend/build/libs/backend-1.0.0.jar"
        
        # Show JAR size
        jar_size=$(du -h backend/build/libs/backend-1.0.0.jar | cut -f1)
        echo "📊 JAR size: $jar_size"
    else
        echo "⚠️  JAR file not found where expected"
    fi
else
    echo "❌ JAR build failed!"
    exit 1
fi

echo ""
echo "🎉 Quick test completed successfully!"
echo ""
echo "Next steps:"
echo "1. Run full test suite: ./test-application.sh"
echo "2. Start application: ./gradlew bootRun"
echo "3. Test with Mosaik Executor mobile app"
echo ""
echo "Application will be available at: http://localhost:8080/mewlock"