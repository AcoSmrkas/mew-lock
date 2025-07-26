#!/bin/bash

# Project Validation Script
echo "🔍 Validating MewLock Mosaik Project Structure"
echo "=============================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

validate_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "${RED}✗${NC} $1 (missing)"
        return 1
    fi
}

validate_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        return 0
    else
        echo -e "${RED}✗${NC} $1/ (missing)"
        return 1
    fi
}

echo ""
echo "📋 Core Project Files:"
validate_file "build.gradle.kts"
validate_file "gradlew"
validate_file "README.md"

echo ""
echo "📁 Project Structure:"
validate_dir "backend"
validate_dir "backend/src"
validate_dir "backend/src/main"
validate_dir "backend/src/main/kotlin"
validate_dir "backend/src/test"
validate_dir "common"
validate_dir "common/src"
validate_dir "ui"

echo ""
echo "🏗️ Backend Files:"
validate_file "backend/src/main/kotlin/MewLockApplication.kt"
validate_file "backend/src/main/kotlin/controllers/MewLockController.kt"
validate_file "backend/src/main/kotlin/services/ErgoService.kt"
validate_file "backend/src/main/kotlin/services/PriceService.kt"
validate_file "backend/src/main/kotlin/services/LockService.kt"
validate_file "backend/src/main/resources/application.yml"

echo ""
echo "📊 Common Module:"
validate_file "common/src/main/kotlin/MewLockModels.kt"

echo ""
echo "🎨 UI Components:"
validate_file "ui/src/main/kotlin/components/LockCard.kt"

echo ""
echo "🧪 Test Files:"
validate_file "backend/src/test/kotlin/services/PriceServiceTest.kt"
validate_file "backend/src/test/kotlin/services/ErgoServiceTest.kt"
validate_file "backend/src/test/kotlin/services/LockServiceTest.kt"
validate_file "backend/src/test/kotlin/controllers/MewLockControllerTest.kt"
validate_file "backend/src/test/kotlin/integration/ApiIntegrationTest.kt"

echo ""
echo "📖 Documentation:"
validate_file "TESTING_GUIDE.md"
validate_file "VALIDATION_CHECKLIST.md"
validate_file "RUN_LOCALLY.md"

echo ""
echo "🚀 Ready to Run Scripts:"
validate_file "run-mewlock.sh"
validate_file "test-application.sh"

echo ""
echo "📈 Project Statistics:"
echo "Kotlin files: $(find . -name "*.kt" | wc -l)"
echo "Test files: $(find . -name "*Test.kt" | wc -l)"
echo "Documentation files: $(find . -name "*.md" | wc -l)"

echo ""
echo "🌐 Testing External APIs:"
echo -n "Ergo Explorer API: "
if curl -s --max-time 5 "https://api.ergoplatform.com/api/v1/info" | grep -q "height"; then
    echo -e "${GREEN}✓ Available${NC}"
else
    echo -e "${YELLOW}⚠ Unavailable${NC}"
fi

echo -n "CoinGecko API: "
if curl -s --max-time 5 "https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd" | grep -q "ergo"; then
    echo -e "${GREEN}✓ Available${NC}"
else
    echo -e "${YELLOW}⚠ Unavailable${NC}"
fi

echo ""
echo "✅ Project validation complete!"
echo ""
echo "To run the application:"
echo "1. Ensure Java 17+ is installed: java -version"
echo "2. Run the application: ./run-mewlock.sh"
echo "3. Test at: http://localhost:8080/mewlock/actuator/health"