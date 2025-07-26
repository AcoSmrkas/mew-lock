# 🚀 Contributing MewLock to Minotaur Wallet

## 📋 Steps to Submit Pull Request

### 1. Fork the Repository
```bash
# Go to: https://github.com/minotaur-ergo/minotaur-wallet
# Click "Fork" button to create your fork
```

### 2. Clone Your Fork
```bash
git clone https://github.com/YOUR_USERNAME/minotaur-wallet.git
cd minotaur-wallet
git checkout dev  # Switch to dev branch (Minotaur uses dev branch)
```

### 3. Create Feature Branch
```bash
git checkout -b feature/add-mewlock-dapp
```

### 4. Add MewLock Files
Copy the MewLock dApp files to the correct location:
```bash
# Create the directory structure
mkdir -p apps/wallet/src/pages/wallet-page/dapps/apps/mewlock

# Copy all MewLock files
cp mewlock-minotaur/* apps/wallet/src/pages/wallet-page/dapps/apps/mewlock/
```

**Files to copy:**
- `MewLock.tsx`
- `useMewLockBoxes.ts`
- `utils.ts`
- `parameters.ts`
- `transactions.ts`
- `MewLockReadMe.tsx`

### 5. Register the dApp
Update the dApps configuration to include MewLock:

**Find and edit:** `apps/wallet/src/pages/wallet-page/dapps/WalletDApps.tsx`

Add MewLock to the dApps array:
```typescript
import MewLock from './apps/mewlock/MewLock';

// Add to dApps configuration
{
  id: 'mewlock',
  name: 'MewLock',
  title: 'MewLock - Time-Locked Storage',
  description: 'Lock ERG and tokens for specified time periods',
  icon: '🔒',
  component: MewLock,
  category: 'DeFi',
  status: 'active',
  version: '1.0.0'
}
```

### 6. Test the Integration
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Test on your platform
# Android: npx cap sync android && npx cap open android
# iOS: npx cap sync ios && npx cap open ios
# Desktop: npm run electron
```

### 7. Commit Changes
```bash
git add .
git commit -m "feat: Add MewLock dApp for time-locked asset storage

- Add complete MewLock dApp with lock/unlock functionality
- Support for 8 duration options (1 week to 10 years)
- Real-time ERG pricing and USD value display
- Material-UI integration matching wallet design
- Comprehensive documentation and help system
- 3% withdrawal fee structure with storage rent warnings

Closes #[issue_number] (if there's a related issue)"
```

### 8. Push to Your Fork
```bash
git push origin feature/add-mewlock-dapp
```

### 9. Create Pull Request
1. Go to your fork on GitHub
2. Click "Compare & pull request"
3. Set base repository: `minotaur-ergo/minotaur-wallet`
4. Set base branch: `dev`
5. Set compare branch: `feature/add-mewlock-dapp`
6. Use the pull request template we created

### 10. Fill Out PR Description
Use our comprehensive PR template that includes:
- Feature summary and benefits
- Technical implementation details
- Testing information
- Screenshots/demos
- Security considerations
- Integration instructions

## 📁 File Structure Preview

After integration, the structure should look like:
```
minotaur-wallet/
├── apps/wallet/src/pages/wallet-page/dapps/
│   ├── apps/
│   │   ├── air-drop/
│   │   ├── box-consolidation/
│   │   ├── burn-token/
│   │   ├── issue-token/
│   │   ├── sigma-usd/
│   │   └── mewlock/              # 🆕 Our new dApp
│   │       ├── MewLock.tsx
│   │       ├── useMewLockBoxes.ts
│   │       ├── utils.ts
│   │       ├── parameters.ts
│   │       ├── transactions.ts
│   │       └── MewLockReadMe.tsx
│   ├── components/
│   ├── WalletDAppView.tsx
│   ├── WalletDAppViewPage.tsx
│   └── WalletDApps.tsx           # 🔄 Modified to include MewLock
```

## 🔧 Integration Checklist

### Before Submitting:
- [ ] All MewLock files copied to correct directory
- [ ] dApp registered in WalletDApps.tsx
- [ ] No syntax errors in any files
- [ ] Material-UI imports match Minotaur's version
- [ ] Contract address points to mainnet
- [ ] All dependencies are available in Minotaur
- [ ] Code follows TypeScript strict mode
- [ ] No console.log statements left in production code

### Testing Checklist:
- [ ] dApp appears in Minotaur dApps list
- [ ] Create lock form renders correctly
- [ ] Blockchain data loads from Ergo Explorer
- [ ] ERG price displays in USD
- [ ] Lock creation transaction builds successfully
- [ ] My locks view shows user's locks
- [ ] Unlock functionality works for ready locks
- [ ] Help documentation displays properly
- [ ] Responsive design works on mobile
- [ ] No console errors

### PR Submission Checklist:
- [ ] Descriptive commit messages
- [ ] Feature branch created from dev
- [ ] PR targets dev branch (not main)
- [ ] Comprehensive PR description
- [ ] Screenshots or demo included
- [ ] Breaking changes documented (if any)
- [ ] Future enhancement ideas mentioned

## 🔍 Review Process

### What Minotaur Maintainers Will Check:
1. **Code Quality**: TypeScript standards, error handling
2. **Integration**: Fits with existing dApp architecture
3. **Security**: No private key exposure, proper validation
4. **Performance**: Efficient API calls, UI responsiveness
5. **UX**: Consistent with wallet design language
6. **Documentation**: Clear and comprehensive
7. **Testing**: Works across platforms

### Expected Timeline:
- **Initial review**: 1-2 weeks
- **Feedback cycles**: 2-3 rounds
- **Approval & merge**: 2-4 weeks total

### How to Handle Feedback:
1. Address all reviewer comments
2. Make requested changes promptly
3. Update tests if needed
4. Re-request review after changes
5. Be responsive to maintainer questions

## 🎯 Success Metrics

### For Approval:
- ✅ Clean code with no major issues
- ✅ Proper integration with wallet architecture  
- ✅ Comprehensive testing completed
- ✅ Documentation provided
- ✅ Security review passed
- ✅ UX meets wallet standards

### Post-Merge:
- 📈 User adoption tracking
- 🐛 Bug reports monitoring
- 💬 Community feedback collection
- 🔄 Feature enhancement planning

## 💡 Tips for Success

### Best Practices:
- **Start small**: Submit clean, focused PR
- **Communicate**: Engage with maintainers proactively
- **Document**: Over-document rather than under-document
- **Test thoroughly**: Multiple platforms and scenarios
- **Be patient**: Open source review takes time
- **Stay responsive**: Quick responses to feedback

### Common Pitfalls to Avoid:
- ❌ Submitting to wrong branch (use dev, not main)
- ❌ Large monolithic commits
- ❌ Insufficient testing
- ❌ Missing documentation
- ❌ Breaking existing functionality
- ❌ Ignoring code style guidelines

## 🎉 After Approval

### What Happens Next:
1. **Merge**: PR merged into dev branch
2. **Testing**: Maintainers test in dev environment
3. **Release**: Included in next Minotaur release
4. **Distribution**: Available to all users
5. **Support**: Ongoing maintenance and updates

### Your Ongoing Role:
- 🐛 Help fix bugs if found
- ✨ Contribute enhancements
- 📖 Update documentation as needed
- 🤝 Support community questions
- 🔄 Keep up with wallet updates

---

**Ready to contribute MewLock to Minotaur? Let's make time-locked storage available to all Ergo users! 🚀**