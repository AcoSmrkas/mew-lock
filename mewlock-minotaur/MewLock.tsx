import React, { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, Grid, Button, TextField, FormControl, InputLabel, Select, MenuItem, Alert, Chip, LinearProgress } from '@mui/material';
import { Lock, LockOpen, AccountBalanceWallet, Timeline, AttachMoney } from '@mui/icons-material';
import { useMewLockBoxes } from './useMewLockBoxes';
import { createLockTransaction, createUnlockTransaction } from './transactions';
import { formatErg, formatDuration, calculateFee } from './utils';
import { LOCK_DURATIONS, MEWLOCK_CONTRACT_ADDRESS } from './parameters';
import MewLockReadMe from './MewLockReadMe';

interface MewLockProps {
  wallet: any; // Minotaur wallet instance
  network: 'mainnet' | 'testnet';
}

const MewLock: React.FC<MewLockProps> = ({ wallet, network }) => {
  const [activeTab, setActiveTab] = useState<'create' | 'mylocks' | 'stats' | 'help'>('create');
  const [createForm, setCreateForm] = useState({
    amount: '',
    duration: '',
    loading: false
  });
  
  const { 
    allLocks, 
    userLocks, 
    globalStats, 
    loading, 
    error, 
    refreshData 
  } = useMewLockBoxes(wallet, network);

  const [ergPrice, setErgPrice] = useState<number>(0);

  // Fetch ERG price
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ergo&vs_currencies=usd');
        const data = await response.json();
        setErgPrice(data.ergo?.usd || 0);
      } catch (error) {
        console.error('Failed to fetch ERG price:', error);
      }
    };
    
    fetchPrice();
    const interval = setInterval(fetchPrice, 5 * 60 * 1000); // Update every 5 minutes
    return () => clearInterval(interval);
  }, []);

  const handleCreateLock = async () => {
    if (!createForm.amount || !createForm.duration) {
      return;
    }

    setCreateForm(prev => ({ ...prev, loading: true }));
    
    try {
      const amountNanoErg = Math.floor(parseFloat(createForm.amount) * 1e9);
      const duration = LOCK_DURATIONS.find(d => d.value === createForm.duration);
      
      if (!duration) throw new Error('Invalid duration selected');

      const transaction = await createLockTransaction(
        wallet,
        amountNanoErg,
        duration.blocks,
        network
      );

      // Submit transaction through Minotaur wallet
      await wallet.submitTransaction(transaction);
      
      // Reset form and refresh data
      setCreateForm({ amount: '', duration: '', loading: false });
      setTimeout(refreshData, 2000); // Refresh after 2 seconds
      
    } catch (error) {
      console.error('Failed to create lock:', error);
      setCreateForm(prev => ({ ...prev, loading: false }));
    }
  };

  const handleUnlock = async (boxId: string) => {
    try {
      const transaction = await createUnlockTransaction(wallet, boxId, network);
      await wallet.submitTransaction(transaction);
      setTimeout(refreshData, 2000);
    } catch (error) {
      console.error('Failed to unlock:', error);
    }
  };

  const renderCreateTab = () => {
    const amount = parseFloat(createForm.amount) || 0;
    const fee = calculateFee(amount);
    const usdValue = amount * ergPrice;
    const selectedDuration = LOCK_DURATIONS.find(d => d.value === createForm.duration);

    return (
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <Lock /> Create Time Lock
              </Typography>
              
              <TextField
                fullWidth
                label="ERG Amount"
                type="number"
                value={createForm.amount}
                onChange={(e) => setCreateForm(prev => ({ ...prev, amount: e.target.value }))}
                margin="normal"
                inputProps={{ min: 0.1, step: 0.1 }}
                helperText={amount > 0 ? `≈ $${usdValue.toFixed(2)} USD` : 'Minimum 0.1 ERG'}
              />

              <FormControl fullWidth margin="normal">
                <InputLabel>Lock Duration</InputLabel>
                <Select
                  value={createForm.duration}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, duration: e.target.value }))}
                >
                  {LOCK_DURATIONS.map((duration) => (
                    <MenuItem key={duration.value} value={duration.value}>
                      {duration.label} ({duration.days} days)
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {selectedDuration && selectedDuration.blocks > 1314000 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Locks longer than 4 years require storage rent payments.
                </Alert>
              )}

              <Button
                fullWidth
                variant="contained"
                onClick={handleCreateLock}
                disabled={!createForm.amount || !createForm.duration || createForm.loading}
                sx={{ mt: 3 }}
              >
                {createForm.loading ? 'Creating Lock...' : 'Create Lock'}
              </Button>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                <AttachMoney /> Fee Information
              </Typography>
              
              <Typography variant="body2" color="text.secondary" paragraph>
                • 3% withdrawal fee applies to all locks
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                • Network fee: ~0.0011 ERG per transaction
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                • Storage rent applies to locks &gt; 4 years
              </Typography>

              {amount > 0 && (
                <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                  <Typography variant="subtitle2">Fee Calculation:</Typography>
                  <Typography variant="body2">Withdrawal Fee (3%): {fee.toFixed(4)} ERG</Typography>
                  <Typography variant="body2">You'll receive: {(amount - fee).toFixed(4)} ERG</Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  const renderMyLocksTab = () => {
    const readyLocks = userLocks.filter(lock => lock.canWithdraw);
    const activeLocks = userLocks.filter(lock => !lock.canWithdraw);

    return (
      <Box>
        <Typography variant="h6" gutterBottom>
          <LockOpen /> My Locks ({userLocks.length})
        </Typography>

        <Button onClick={refreshData} sx={{ mb: 2 }}>
          Refresh
        </Button>

        {readyLocks.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" color="success.main" gutterBottom>
              ✅ Ready to Unlock ({readyLocks.length})
            </Typography>
            <Grid container spacing={2}>
              {readyLocks.map((lock) => (
                <Grid item xs={12} md={6} key={lock.boxId}>
                  <Card sx={{ bgcolor: 'success.50' }}>
                    <CardContent>
                      <Typography variant="subtitle2">
                        {formatErg(lock.ergAmount)} ERG
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Unlocked at height {lock.unlockHeight}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Box: {lock.boxId.substring(0, 8)}...
                      </Typography>
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        onClick={() => handleUnlock(lock.boxId)}
                        sx={{ mt: 1 }}
                      >
                        Unlock Assets
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {activeLocks.length > 0 && (
          <Box>
            <Typography variant="subtitle1" gutterBottom>
              ⏰ Active Locks ({activeLocks.length})
            </Typography>
            <Grid container spacing={2}>
              {activeLocks.map((lock) => (
                <Grid item xs={12} md={6} key={lock.boxId}>
                  <Card>
                    <CardContent>
                      <Typography variant="subtitle2">
                        {formatErg(lock.ergAmount)} ERG
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Unlocks in {formatDuration(lock.remainingBlocks)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        At height {lock.unlockHeight}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Box: {lock.boxId.substring(0, 8)}...
                      </Typography>
                      <LinearProgress 
                        variant="determinate" 
                        value={((lock.unlockHeight - lock.remainingBlocks) / lock.unlockHeight) * 100}
                        sx={{ mt: 1 }}
                      />
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

        {userLocks.length === 0 && !loading && (
          <Card>
            <CardContent>
              <Typography variant="h6" color="text.secondary" align="center">
                No locks found
              </Typography>
              <Typography variant="body2" color="text.secondary" align="center">
                Create your first lock to get started!
              </Typography>
            </CardContent>
          </Card>
        )}
      </Box>
    );
  };

  const renderStatsTab = () => (
    <Box>
      <Typography variant="h6" gutterBottom>
        <Timeline /> Global Statistics
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h4">{globalStats.totalLocks}</Typography>
              <Typography variant="body2" color="text.secondary">Total Locks</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h4">{globalStats.totalUsers}</Typography>
              <Typography variant="body2" color="text.secondary">Total Users</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h4">{formatErg(globalStats.totalValueLocked)}</Typography>
              <Typography variant="body2" color="text.secondary">ERG Locked</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h4">${(globalStats.totalValueLocked / 1e9 * ergPrice).toFixed(0)}K</Typography>
              <Typography variant="body2" color="text.secondary">USD Value</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {ergPrice > 0 && (
        <Card sx={{ mt: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>Market Data</Typography>
            <Chip label={`ERG Price: $${ergPrice.toFixed(2)}`} color="primary" />
          </CardContent>
        </Card>
      )}
    </Box>
  );

  if (loading && allLocks.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <LinearProgress sx={{ mb: 2 }} />
        <Typography>Loading MewLock data...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        🔒 MewLock
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        Time-Locked Asset Storage on Ergo
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Button 
          onClick={() => setActiveTab('create')}
          variant={activeTab === 'create' ? 'contained' : 'text'}
          sx={{ mr: 1 }}
        >
          Create Lock
        </Button>
        <Button 
          onClick={() => setActiveTab('mylocks')}
          variant={activeTab === 'mylocks' ? 'contained' : 'text'}
          sx={{ mr: 1 }}
        >
          My Locks
        </Button>
        <Button 
          onClick={() => setActiveTab('stats')}
          variant={activeTab === 'stats' ? 'contained' : 'text'}
          sx={{ mr: 1 }}
        >
          Statistics
        </Button>
        <Button 
          onClick={() => setActiveTab('help')}
          variant={activeTab === 'help' ? 'contained' : 'text'}
        >
          Help
        </Button>
      </Box>

      {activeTab === 'create' && renderCreateTab()}
      {activeTab === 'mylocks' && renderMyLocksTab()}
      {activeTab === 'stats' && renderStatsTab()}
      {activeTab === 'help' && <MewLockReadMe />}
    </Box>
  );
};

export default MewLock;