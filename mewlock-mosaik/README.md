# MewLock Mosaik Application

A cross-platform Ergo dApp built with [Mosaik](https://github.com/MrStahlfelge/mosaik) framework for time-locked asset storage.

## Overview

MewLock allows users to lock ERG and tokens for specified time periods. The assets are secured by an Ergo smart contract and can only be withdrawn after the lock period expires, with a 3% withdrawal fee.

## Features

- **Time-locked Storage**: Lock ERG and tokens for periods from 1 week to 10 years
- **Cross-platform UI**: Works on Android, iOS, and desktop via Mosaik framework
- **Real-time Price Data**: USD values from CoinGecko and Spectrum APIs
- **Smart Contract Security**: Assets secured by audited ErgoScript contract
- **Withdrawal Fees**: 3% fee structure to incentivize long-term holding
- **Leaderboard**: Global statistics and user rankings

## Architecture

```
mewlock-mosaik/
├── common/           # Shared data models and constants
├── backend/          # Spring Boot Mosaik backend
│   ├── controllers/  # Mosaik UI controllers
│   ├── services/     # Business logic services
│   └── resources/    # Configuration files
├── ui/              # Reusable UI components
└── build.gradle.kts # Project configuration
```

## Quick Start

### Prerequisites

- Java 17 or higher
- Gradle 8.0+
- Android SDK (for mobile builds)
- Mosaik-compatible wallet (Nautilus, Minotaur)

### Backend Setup

1. **Clone and build:**
```bash
cd mewlock-mosaik
./gradlew build
```

2. **Run the backend:**
```bash
./gradlew :backend:bootRun
```

The backend will start on `http://localhost:8080/mewlock`

### Mobile App

1. **Install Mosaik Executor:**
   - Android: Download from [Mosaik releases](https://github.com/MrStahlfelge/mosaik/releases)
   - iOS: Build from source (requires Xcode)

2. **Connect to app:**
   - Open Mosaik Executor
   - Enter URL: `http://your-server:8080/mewlock`
   - Connect your Ergo wallet

## Smart Contract

The MewLock contract is deployed at: `QjvCfNTp9tLHWqvhfZL6rYtcC3TYkPm7GthjCPQh4uFBKHJXRU`

### Contract Registers:
- **R4**: Depositor's P2PK address (GroupElement)
- **R5**: Unlock height (Int)
- **R6**: Creation timestamp (Long)

### Validation Rules:
- Only the depositor can withdraw after unlock height
- 3% withdrawal fee is automatically deducted
- Minimum lock amounts: 0.1 ERG, 34 tokens
- Storage rent applies to locks > 4 years

## API Services

### ErgoService
- Fetches MewLock boxes from Ergo Explorer
- Parses contract registers and box data
- Calculates lock statistics and user data
- Builds lock and unlock transactions

### PriceService
- Real-time ERG prices from CoinGecko
- Token prices from Spectrum DEX
- USD value calculations with caching
- Price formatting utilities

### LockService
- Lock creation and validation
- Fee calculations (3% withdrawal)
- User statistics and leaderboards
- Storage rent requirement checks

## Lock Durations

| Duration | Blocks | Days | Label |
|----------|--------|------|-------|
| Week     | 5,040  | 7    | 1 Week |
| Month    | 21,600 | 30   | 1 Month |
| Quarter  | 64,800 | 90   | 3 Months |
| Half Year| 129,600| 180  | 6 Months |
| Year     | 262,800| 365  | 1 Year |
| 2 Years  | 525,600| 730  | 2 Years |
| 5 Years  | 1,314,000| 1,825| 5 Years |
| 10 Years | 2,628,000| 3,650| 10 Years |

## Configuration

### Environment Variables

```bash
ERGO_NODE_URL=https://213.239.193.208:9053
ERGO_EXPLORER_URL=https://api.ergoplatform.com/api/v1
MEWLOCK_CONTRACT_ADDRESS=QjvCfNTp9tLHWqvhfZL6rYtcC3TYkPm7GthjCPQh4uFBKHJXRU
PRICE_CACHE_TIMEOUT=300000
```

### Application Properties

See `backend/src/main/resources/application.yml` for full configuration options.

## Development

### Project Structure

- **Common Module**: Shared Kotlin data classes and constants
- **Backend Module**: Spring Boot application with Mosaik controllers
- **UI Module**: Reusable Mosaik UI components

### Key Components

1. **MewLockController**: Main Mosaik UI controller handling navigation and actions
2. **LockCard**: Reusable component for displaying individual locks
3. **ErgoService**: Blockchain interaction and data parsing
4. **PriceService**: Real-time price data with caching

### Adding New Features

1. **New UI View**: Add to `MewLockController.createMainContent()`
2. **New Action**: Handle in `MewLockController.onBackendRequest()`
3. **New Service**: Create in `services/` package with `@Service` annotation
4. **New Data Model**: Add to `common/src/main/kotlin/MewLockModels.kt`

## Testing

```bash
# Run all tests
./gradlew test

# Run backend tests only
./gradlew :backend:test

# Run with coverage
./gradlew jacocoTestReport
```

## Deployment

### Docker Build

```bash
./gradlew :backend:bootBuildImage
docker run -p 8080:8080 mewlock-backend:latest
```

### Production Deployment

1. Build production JAR:
```bash
./gradlew :backend:bootJar
```

2. Deploy JAR to server:
```bash
java -jar backend/build/libs/backend-1.0.0.jar --spring.profiles.active=production
```

3. Configure reverse proxy (nginx/Apache) for HTTPS

## Security Considerations

- **Private Keys**: Never store private keys in the application
- **Transaction Signing**: Always done client-side by wallet
- **Input Validation**: All user inputs are validated
- **Rate Limiting**: API calls are cached and rate-limited
- **HTTPS**: Always use HTTPS in production

## Monitoring

The application uses structured logging and can be monitored with:
- **Metrics**: Spring Boot Actuator endpoints
- **Logs**: JSON structured logging to stdout
- **Health**: `/actuator/health` endpoint
- **Price API**: Monitor CoinGecko and Spectrum API health

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make changes and add tests
4. Commit changes: `git commit -am 'Add new feature'`
5. Push to branch: `git push origin feature/new-feature`
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- **Documentation**: [Mosaik Framework Docs](https://github.com/MrStahlfelge/mosaik)
- **Ergo Platform**: [Developer Resources](https://docs.ergoplatform.com/)
- **Issues**: Report bugs via GitHub Issues
- **Community**: Join [Ergo Discord](https://discord.gg/ergo-platform-668903786361651200)

## Changelog

### v1.0.0 (Current)
- Initial Mosaik implementation
- Cross-platform UI with wallet integration
- Real-time price data and USD values
- Complete lock creation and withdrawal flow
- User statistics and global leaderboard
- Smart contract integration via Ergo Explorer API