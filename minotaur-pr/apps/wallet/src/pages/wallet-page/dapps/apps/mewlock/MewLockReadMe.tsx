import React from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Alert, 
  Accordion, 
  AccordionSummary, 
  AccordionDetails,
  Link,
  Chip,
  Divider
} from '@mui/material';
import { 
  ExpandMore, 
  Lock, 
  LockOpen, 
  AttachMoney, 
  Schedule, 
  Security,
  Code,
  Warning
} from '@mui/icons-material';
import { PROTOCOL_PARAMETERS, LOCK_DURATIONS } from './parameters';

const MewLockReadMe: React.FC = () => {
  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      <Typography variant="h4" gutterBottom>
        <Lock /> MewLock Documentation
      </Typography>
      
      <Typography variant="subtitle1" color="text.secondary" paragraph>
        Complete guide to using MewLock time-locked asset storage on Ergo
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        <strong>What is MewLock?</strong> MewLock allows you to lock ERG and tokens for specified time periods. 
        Assets are secured by an Ergo smart contract and can only be withdrawn after the lock period expires.
      </Alert>

      {/* How It Works */}
      <Accordion defaultExpanded>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h6">
            <Security /> How MewLock Works
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ pl: 2 }}>
            <Typography variant="h6" gutterBottom>Step 1: Lock Assets</Typography>
            <Typography paragraph>
              Choose an amount of ERG and a lock duration. Your assets will be sent to a smart contract 
              that prevents withdrawal until the specified blockchain height is reached.
            </Typography>

            <Typography variant="h6" gutterBottom>Step 2: Wait for Unlock</Typography>
            <Typography paragraph>
              Your assets remain secure in the smart contract. You can view your locks and see exactly 
              when they'll be ready for withdrawal.
            </Typography>

            <Typography variant="h6" gutterBottom>Step 3: Withdraw</Typography>
            <Typography paragraph>
              Once the unlock height is reached, you can withdraw your assets. A 3% fee is charged 
              on withdrawal to support the protocol.
            </Typography>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Lock Durations */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h6">
            <Schedule /> Available Lock Durations
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            {LOCK_DURATIONS.map((duration) => (
              <Chip 
                key={duration.value}
                label={`${duration.label} (${duration.days} days)`}
                variant="outlined"
                size="small"
              />
            ))}
          </Box>
          
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <Warning sx={{ fontSize: 16, mr: 1, verticalAlign: 'text-bottom' }} />
              <strong>Storage Rent Notice:</strong> Locks longer than 4 years (5-year and 10-year options) 
              require periodic storage rent payments to maintain the boxes on the blockchain.
            </Typography>
          </Alert>
        </AccordionDetails>
      </Accordion>

      {/* Fees and Costs */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h6">
            <AttachMoney /> Fees and Costs
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ pl: 2 }}>
            <Typography variant="h6" gutterBottom>Withdrawal Fee</Typography>
            <Typography paragraph>
              A <strong>3% fee</strong> is charged when you withdraw your assets. This fee supports 
              the MewLock protocol development and maintenance.
            </Typography>

            <Typography variant="h6" gutterBottom>Network Fees</Typography>
            <Typography paragraph>
              Standard Ergo network transaction fees apply (~0.0011 ERG per transaction).
            </Typography>

            <Typography variant="h6" gutterBottom>Storage Rent</Typography>
            <Typography paragraph>
              For locks longer than 4 years, you may need to pay storage rent to keep your 
              boxes active on the blockchain. Learn more at:{' '}
              <Link href="https://ergoplatform.org/en/blog/2022-02-18-ergo-explainer-storage-rent/" target="_blank">
                Ergo Storage Rent Explanation
              </Link>
            </Typography>

            <Typography variant="h6" gutterBottom>Minimum Amounts</Typography>
            <Typography>
              • Minimum ERG lock: <strong>0.1 ERG</strong><br/>
              • Minimum token lock: <strong>34 base units</strong>
            </Typography>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Smart Contract Details */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h6">
            <Code /> Smart Contract Details
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ pl: 2 }}>
            <Typography variant="h6" gutterBottom>Contract Address</Typography>
            <Card sx={{ mb: 2, bgcolor: 'grey.50' }}>
              <CardContent>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {PROTOCOL_PARAMETERS.MAINNET_EXPLORER_URL.includes('mainnet') ? 
                    'QjvCfNTp9tLHWqvhfZL6rYtcC3TYkPm7GthjCPQh4uFBKHJXRU' : 
                    'Testnet contract address'
                  }
                </Typography>
              </CardContent>
            </Card>

            <Typography variant="h6" gutterBottom>Register Structure</Typography>
            <Typography paragraph>
              MewLock boxes store data in these registers:
            </Typography>
            <Typography component="div" sx={{ pl: 2 }}>
              • <strong>R4:</strong> Depositor's public key (GroupElement)<br/>
              • <strong>R5:</strong> Unlock height (Int)<br/>
              • <strong>R6:</strong> Creation timestamp (Long)
            </Typography>

            <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Security Features</Typography>
            <Typography component="div" sx={{ pl: 2 }}>
              • Only the original depositor can withdraw<br/>
              • Withdrawal only possible after unlock height<br/>
              • Immutable lock duration (cannot be changed)<br/>
              • Open source and auditable smart contract
            </Typography>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Transaction Examples */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h6">
            <Code /> Transaction Building Examples
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ pl: 2 }}>
            <Typography variant="h6" gutterBottom>Lock Transaction</Typography>
            <Card sx={{ mb: 2, bgcolor: 'grey.50' }}>
              <CardContent>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
{`// Create a 1-year ERG lock
Input: Your wallet UTXO (e.g., 5 ERG)
Output 1: MewLock box (1 ERG locked)
  - Address: MewLock contract
  - R4: Your public key (GroupElement)
  - R5: Current height + 262,800 blocks
  - R6: Creation timestamp
Output 2: Change back to you (remaining ERG minus fees)`}
                </Typography>
              </CardContent>
            </Card>

            <Typography variant="h6" gutterBottom>Unlock Transaction</Typography>
            <Card sx={{ mb: 2, bgcolor: 'grey.50' }}>
              <CardContent>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
{`// Withdraw after lock expires
Input: MewLock box (1 ERG locked)
Output 1: To you (0.97 ERG - after 3% fee)
Output 2: Protocol fee (0.03 ERG)
Validation: HEIGHT >= unlock_height && depositor_signature`}
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Safety and Best Practices */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h6">
            <Security /> Safety and Best Practices
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ pl: 2 }}>
            <Alert severity="warning" sx={{ mb: 2 }}>
              <strong>Important:</strong> Once you create a lock, the duration cannot be changed. 
              Make sure you select the correct lock period!
            </Alert>

            <Typography variant="h6" gutterBottom>Best Practices</Typography>
            <Typography component="div" sx={{ pl: 2, mb: 2 }}>
              • Start with smaller amounts and shorter durations to test<br/>
              • Double-check your lock duration before confirming<br/>
              • Keep your wallet seed phrase secure<br/>
              • Monitor storage rent requirements for long locks<br/>
              • Consider the 3% withdrawal fee in your planning
            </Typography>

            <Typography variant="h6" gutterBottom>What to Avoid</Typography>
            <Typography component="div" sx={{ pl: 2 }}>
              • Don't lock funds you might need access to<br/>
              • Don't lose your wallet or seed phrase<br/>
              • Don't create locks you can't afford storage rent for<br/>
              • Don't rush - transaction mistakes can't be undone
            </Typography>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* FAQ */}
      <Accordion>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Typography variant="h6">Frequently Asked Questions</Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ pl: 2 }}>
            <Typography variant="h6" gutterBottom>Q: Can I unlock my assets early?</Typography>
            <Typography paragraph>
              No, the smart contract enforces the lock duration. Assets cannot be withdrawn 
              before the specified unlock height is reached.
            </Typography>

            <Typography variant="h6" gutterBottom>Q: What happens if I lose my wallet?</Typography>
            <Typography paragraph>
              If you lose access to your wallet (seed phrase), you will lose access to your locked assets. 
              Always keep your seed phrase secure and backed up.
            </Typography>

            <Typography variant="h6" gutterBottom>Q: Can I extend a lock duration?</Typography>
            <Typography paragraph>
              No, lock durations are immutable. You would need to wait for unlock, withdraw, 
              and create a new lock with a longer duration.
            </Typography>

            <Typography variant="h6" gutterBottom>Q: Are my assets really safe?</Typography>
            <Typography paragraph>
              Yes, your assets are secured by the Ergo blockchain and smart contract. The contract 
              code is open source and has been reviewed by the community.
            </Typography>
          </Box>
        </AccordionDetails>
      </Accordion>

      <Divider sx={{ my: 3 }} />

      {/* Links and Resources */}
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Resources and Links</Typography>
          <Typography component="div">
            • <Link href="https://ergoplatform.org/" target="_blank">Ergo Platform</Link><br/>
            • <Link href="https://github.com/ergoplatform/ergo" target="_blank">Ergo GitHub</Link><br/>
            • <Link href="https://explorer.ergoplatform.com/" target="_blank">Ergo Explorer</Link><br/>
            • <Link href="https://discord.gg/ergo-platform-668903786361651200" target="_blank">Ergo Discord</Link><br/>
            • <Link href="https://ergoplatform.org/en/blog/2022-02-18-ergo-explainer-storage-rent/" target="_blank">Storage Rent Explanation</Link>
          </Typography>
        </CardContent>
      </Card>

      <Alert severity="info" sx={{ mt: 3 }}>
        <Typography variant="body2">
          <strong>Disclaimer:</strong> MewLock is experimental software. Use at your own risk. 
          Always test with small amounts first and never invest more than you can afford to lose.
        </Typography>
      </Alert>
    </Box>
  );
};

export default MewLockReadMe;