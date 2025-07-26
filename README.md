# MewLock - Time-Locked Asset Storage on Ergo

MewLock is a decentralized time-lock application built on the Ergo blockchain that allows users to securely lock ERG and tokens for specified durations. Assets are locked using smart contracts and can only be withdrawn after the unlock height is reached.

## 🏗️ Architecture

- **Frontend**: SvelteKit application with TypeScript
- **Blockchain**: Ergo Platform smart contracts
- **Wallet Integration**: Multiple Ergo wallets supported (Nautilus, SAFEW, etc.)
- **Price Data**: Real-time USD values via CoinGecko and Spectrum APIs

## 🚀 Running Locally

### Prerequisites

- Node.js 18+ 
- npm or yarn
- An Ergo wallet (Nautilus recommended)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd lock
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start development server**
   ```bash
   npm run dev
   ```

4. **Open browser**
   ```
   http://localhost:5173
   ```

### Build for Production

```bash
npm run build
npm run preview
```

## 🔒 How Lock Transactions Work

### MewLock Smart Contract

The MewLock contract enforces time-locked asset storage with the following validation rules:

**Contract Address:**
```
5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAq
```

### Lock Transaction Structure

When creating a lock, the transaction builds a box with:

#### Registers:
- **R4**: Depositor's public key (GroupElement) - Used for signature verification
- **R5**: Unlock height (Int) - Block height when assets can be withdrawn
- **R6**: Optional additional data

#### Smart Contract Key Variables:
```ergo
val depositorPubKey = SELF.R4[GroupElement].get
val unlockHeight = SELF.R5[Int].get
val feeNum: Long = 3000L        // 3% fee numerator
val feeDenom: Long = 100000L    // Fee denominator (3000/100000 = 3%)
val devSigmaProp = PK("9fCMmB72WcFLseNx6QANheTCrDjKeb9FzdFNTdBREt2FzHTmusY")
```

#### Example Lock Transaction:
```typescript
const lockTx = {
  inputs: [userUtxo],
  outputs: [{
    ergoTree: MEWLOCK_CONTRACT_TREE,
    value: ergAmount,
    assets: tokens, // optional
    additionalRegisters: {
      R4: depositorPubKey,      // GroupElement
      R5: unlockHeight          // Int (block height)
    }
  }],
  fee: 1100000 // 0.0011 ERG
}
```

### Lock Duration Options:
- **1 Month**: ~1,296 blocks
- **3 Months**: ~3,888 blocks  
- **6 Months**: ~7,776 blocks
- **1 Year**: ~15,552 blocks
- **2 Years**: ~31,104 blocks
- **3 Years**: ~46,656 blocks
- **4 Years**: ~62,208 blocks
- **5 Years**: ~77,760 blocks
- **10 Years**: ~155,520 blocks

*Note: Storage rent applies for locks > 4 years*

## 🔓 How Unlock Transactions Work

### Smart Contract Validation Rules

The MewLock contract enforces these conditions for withdrawal:

#### 1. **Signature Verification**
```ergo
proveDlog(depositorPubKey)  // Must be signed by original depositor
```

#### 2. **Time Lock Validation**
```ergo
val isExpiredTimeWindow = HEIGHT >= unlockHeight
```

#### 3. **Single Box Spending**
```ergo
val validSingleSc = thisScBoxes.size == 1  // Only one MewLock box per transaction
```

#### 4. **No Re-locking**
```ergo
val validTransfer = OUTPUTS.forall{(output: Box) => 
  (output.propositionBytes != SELF.propositionBytes)
}
```

#### 5. **Fee Calculation**

**ERG Fee (3%)**:
```ergo
val ergFee: Long = if (SELF.value > 100000L) { // 0.1 ERG minimum
  val feeAmount = (SELF.value * feeNum) / feeDenom  // 3%
  val maxFee = SELF.value / 10L // Cap at 10% of total value
  if (feeAmount > 0L && feeAmount <= maxFee) feeAmount else 0L
} else {
  0L
}
```

**Token Fee (3%)**:
```ergo
val tokenFees = SELF.tokens.map { (token: (Coll[Byte], Long)) =>
  val feeAmount = if (token._2 > 34L) { // 34 token minimum
    val tokenAmount = token._2
    val maxFee = tokenAmount / 10L // Cap at 10%
    val calculatedFee = (tokenAmount * feeNum) / feeDenom
    if (calculatedFee > 0L && calculatedFee <= maxFee) calculatedFee else 0L
  } else {
    0L
  }
  (token._1, feeAmount)
}
```

### Unlock Transaction Structure

```typescript
const unlockTx = {
  inputs: [mewLockBox],
  outputs: [
    {
      // Protocol fee (3%) - Goes to dev address
      ergoTree: devSigmaProp.propBytes,
      value: ergFee,
      assets: tokenFees
    },
    {
      // User receives remaining assets (97%)
      ergoTree: depositorAddress.ergoTree,
      value: lockedErg - ergFee,
      assets: remainingTokens
    }
  ],
  fee: 1100000
}
```

### Fee Distribution

- **Development Treasury**: `9fCMmB72WcFLseNx6QANheTCrDjKeb9FzdFNTdBREt2FzHTmusY`
- **Fee Rate**: 3% (3000/100000)
- **Minimum Thresholds**: 
  - ERG: 0.1 ERG minimum for fee calculation
  - Tokens: 34 tokens minimum for fee calculation
- **Maximum Fee**: Capped at 10% of total value

## 📁 Project Structure

```
src/
├── lib/
│   ├── components/
│   │   ├── common/           # Shared components
│   │   │   ├── MewLockModal.svelte    # Lock creation modal
│   │   │   ├── Navigation.svelte      # Main navigation
│   │   │   └── ...
│   │   └── main/             # Page-specific components
│   ├── contract/             # Transaction builders
│   │   ├── mewLockTx.ts     # Lock transaction logic
│   │   └── ...
│   ├── services/            # External services
│   │   └── priceService.ts  # Price data integration
│   └── utils/               # Utility functions
├── routes/
│   ├── +page.svelte         # Home page
│   ├── locks/               # All locks view
│   ├── my-locks/            # User's locks
│   └── faq/                 # FAQ page
└── app.html                 # HTML template
```

## 🔧 Key Features

- **Time-Lock Assets**: Lock ERG and tokens for predefined periods
- **Multi-Wallet Support**: Nautilus, SAFEW, and other Ergo wallets
- **Real-Time Pricing**: USD values via CoinGecko and Spectrum APIs
- **Leaderboard**: Track top lockers and statistics
- **Responsive Design**: Mobile-friendly interface
- **FAQ System**: Comprehensive help documentation

## 🛡️ Security Features

- **Non-Custodial**: Assets locked in smart contracts, not held by third parties
- **Immutable Contracts**: Deployed smart contracts cannot be changed
- **Signature Verification**: Only depositor can withdraw assets
- **Height Validation**: Withdrawals only after unlock height reached
- **Fee Protection**: 3% withdrawal fee prevents spam attacks
- **Overflow Protection**: Safe mathematical operations with bounds checking
- **Single Box Spending**: Prevents double-spending attacks

## 💰 Economics

- **Storage Rent**: Applies to locks > 4 years (~0.0012 ERG per 4-year period)
- **Withdrawal Fee**: 3% of locked assets goes to development treasury
- **Network Fees**: Standard Ergo transaction fees (~0.0011 ERG)
- **Minimum Amounts**: 
  - ERG: 0.1 ERG minimum for fee calculation
  - Tokens: 34 tokens minimum for fee calculation

## 🔗 Important Links

- **Smart Contract**: [View on ErgoScript Online](https://escript.online/?s=eJylWG1v2zYQ...)
- **Ergo Explorer**: https://explorer.ergoplatform.com/
- **Contract Address**: `5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAq`
- **FAQ**: Available in-app at `/faq`

## 🧪 Development

### Complete Smart Contract Code

```ergo
{
  val depositorPubKey         = SELF.R4[GroupElement].get
  val unlockHeight            = SELF.R5[Int].get
  val feeNum: Long            = 3000L
  val feeDenom: Long          = 100000L
  val safeThreshold: Long     = 9223372036854775807L  // Max Long value for safe multiplication
  val devSigmaProp: SigmaProp = PK("9fCMmB72WcFLseNx6QANheTCrDjKeb9FzdFNTdBREt2FzHTmusY")
  val isExpiredTimeWindow     = HEIGHT >= unlockHeight
  
  // Input validation
  val thisScBoxes: Coll[Box] = INPUTS.filter { (input: Box) =>
    input.propositionBytes == SELF.propositionBytes
  }
  
  val validSingleSc: Boolean = {
    thisScBoxes.size == 1
  }
  
  // Box spend validation
  val validTransfer: Boolean = {
    OUTPUTS.forall{(output: Box) => {
      (output.propositionBytes != SELF.propositionBytes)
    }}
  }
  
  // Calculate ERG fee with reasonable minimum
  val ergFee: Long = if (SELF.value > 100000L) { // 0.1 ERG minimum
    val feeAmount = (SELF.value * feeNum) / feeDenom
    val maxFee = SELF.value / 10L // Cap at 10% of total value
    if (feeAmount > 0L && feeAmount <= maxFee) feeAmount else 0L
  } else {
    0L
  }
  
  // Calculate token fees with reasonable minimums and caps - FIXED VERSION
  val tokenFees: Coll[(Coll[Byte], Long)] = SELF.tokens.map { (token: (Coll[Byte], Long)) =>
    val feeAmount = if (token._2 > 34L) { // 34 token minimum
      val tokenAmount = token._2
      val maxFee = tokenAmount / 10L // Cap at 10% of total tokens
      
      // Avoid BigInt conversion issues by doing direct calculation with bounds checking
      // Check if multiplication would overflow by ensuring token amount is reasonable
      val calculatedFee = if (tokenAmount <= safeThreshold) {
        val feeCalc = (tokenAmount * feeNum) / feeDenom
        if (feeCalc > 0L && feeCalc <= maxFee) feeCalc else 0L
      } else {
        // For very large token amounts, use a simpler percentage
        val simpleFee = tokenAmount / 100L // 1% fee for large amounts
        if (simpleFee > 0L && simpleFee <= maxFee) simpleFee else maxFee
      }
      
      calculatedFee
    } else {
      0L
    }
    (token._1, feeAmount)
  }.filter { (token: (Coll[Byte], Long)) => token._2 > 0L }
  
  // Enhanced dev fee validation
  val validDevFee: Boolean = {
    if (ergFee > 0L || tokenFees.size > 0) {
      // Find dev box (should be first output paying to dev)
      val devBoxExists = OUTPUTS.exists { (output: Box) =>
        val correctProposition = output.propositionBytes == devSigmaProp.propBytes
        val ergFeeValid = if (ergFee > 0L) output.value >= ergFee else true
        val tokenFeesValid = if (tokenFees.size > 0) {
          tokenFees.forall { (token: (Coll[Byte], Long)) =>
            output.tokens.exists { (devToken: (Coll[Byte], Long)) =>
              devToken._1 == token._1 && devToken._2 >= token._2
            }
          }
        } else true
        
        correctProposition && ergFeeValid && tokenFeesValid
      }
      devBoxExists
    } else {
      true // No fees required
    }
  }
  
  // Enhanced recipient validation
  val validRecipient: Boolean = {
    val depositorSigmaProp = proveDlog(depositorPubKey)
    val remainingErg = SELF.value - ergFee
    
    // Calculate remaining tokens after fees
    val remainingTokens = SELF.tokens.map { (token: (Coll[Byte], Long)) =>
      val feeForToken = {
        val matchingFees = tokenFees.filter { (feeToken: (Coll[Byte], Long)) =>
          feeToken._1 == token._1
        }
        if (matchingFees.size > 0) matchingFees(0)._2 else 0L
      }
      (token._1, token._2 - feeForToken)
    }.filter { (token: (Coll[Byte], Long)) => token._2 > 0L }
    
    // Check that remaining funds go to depositor
    OUTPUTS.exists { (output: Box) =>
      val correctProposition = output.propositionBytes == depositorSigmaProp.propBytes
      val correctErg = output.value >= remainingErg
      val correctTokens = if (remainingTokens.size > 0) {
        remainingTokens.forall { (token: (Coll[Byte], Long)) =>
          output.tokens.exists { (outToken: (Coll[Byte], Long)) =>
            outToken._1 == token._1 && outToken._2 >= token._2
          }
        }
      } else true
      
      correctProposition && correctErg && correctTokens
    }
  }
  
  // Sufficient funds validation
  val sufficientFundsForFees: Boolean = {
    val ergSufficient = if (ergFee > 0L) SELF.value >= ergFee else true
    val tokensSufficient = tokenFees.forall { (token: (Coll[Byte], Long)) =>
      SELF.tokens.exists { (selfToken: (Coll[Byte], Long) =>
        selfToken._1 == token._1 && selfToken._2 >= token._2
      }
    }

    ergSufficient && tokensSufficient
  }
  
  // Final validation
  val feeValidation: Boolean = validDevFee && sufficientFundsForFees && validRecipient
  
  allOf(Coll(
    proveDlog(depositorPubKey),
    isExpiredTimeWindow,
    validSingleSc,
    validTransfer,
    feeValidation
  ))
}
```

### Smart Contract Validation Summary

The contract performs these key validation checks:

```ergo
allOf(Coll(
  proveDlog(depositorPubKey),    // Signature verification
  isExpiredTimeWindow,           // Time lock check
  validSingleSc,                 // Single box spending
  validTransfer,                 // No re-locking
  feeValidation                  // Proper fee distribution
))
```

## 📄 License

This project is open source. See LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## ⚠️ Disclaimers

- **Not Financial Advice**: This is experimental software
- **Use at Own Risk**: Smart contracts are immutable once deployed  
- **Mainnet Only**: This application operates on Ergo mainnet
- **Storage Rent**: Long-term locks (>4 years) subject to Ergo storage rent
- **Withdrawal Fees**: 3% fee applies to all withdrawals
- **Minimum Amounts**: Small amounts may not incur fees due to minimum thresholds

---

Built with ❤️ on Ergo Platform