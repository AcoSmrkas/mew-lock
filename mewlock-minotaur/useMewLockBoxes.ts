import { useState, useEffect, useCallback } from 'react';
import { MEWLOCK_CONTRACT_ADDRESS } from './parameters';
import { parseMewLockBox, getCurrentHeight } from './utils';

export interface MewLockBox {
  boxId: string;
  ergAmount: bigint;
  depositorAddress: string;
  unlockHeight: number;
  canWithdraw: boolean;
  remainingBlocks: number;
  tokens: Array<{
    tokenId: string;
    amount: bigint;
    name?: string;
    decimals?: number;
  }>;
}

export interface GlobalStats {
  totalLocks: number;
  totalUsers: number;
  totalValueLocked: bigint;
}

export const useMewLockBoxes = (wallet: any, network: 'mainnet' | 'testnet') => {
  const [allLocks, setAllLocks] = useState<MewLockBox[]>([]);
  const [userLocks, setUserLocks] = useState<MewLockBox[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({
    totalLocks: 0,
    totalUsers: 0,
    totalValueLocked: BigInt(0)
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const explorerUrl = network === 'mainnet' 
    ? 'https://api.ergoplatform.com/api/v1'
    : 'https://api-testnet.ergoplatform.com/api/v1';

  const fetchMewLockBoxes = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch current blockchain height
      const currentHeight = await getCurrentHeight(explorerUrl);

      // Fetch all unspent boxes for MewLock contract
      const response = await fetch(
        `${explorerUrl}/boxes/unspent/byAddress/${MEWLOCK_CONTRACT_ADDRESS}?limit=1000`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch boxes: ${response.status}`);
      }

      const data = await response.json();
      const boxes = data.items || [];

      // Parse boxes into MewLock format
      const parsedLocks: MewLockBox[] = [];
      
      for (const box of boxes) {
        try {
          const parsedBox = parseMewLockBox(box, currentHeight);
          if (parsedBox) {
            parsedLocks.push(parsedBox);
          }
        } catch (err) {
          console.warn('Failed to parse box:', box.boxId, err);
        }
      }

      setAllLocks(parsedLocks);

      // Filter user locks if wallet is connected
      if (wallet && wallet.getAddresses) {
        const userAddresses = wallet.getAddresses();
        const userBoxes = parsedLocks.filter(lock => 
          userAddresses.some((addr: string) => addr === lock.depositorAddress)
        );
        setUserLocks(userBoxes);
      }

      // Calculate global statistics
      const uniqueUsers = new Set(parsedLocks.map(lock => lock.depositorAddress));
      const totalValue = parsedLocks.reduce((sum, lock) => sum + lock.ergAmount, BigInt(0));

      setGlobalStats({
        totalLocks: parsedLocks.length,
        totalUsers: uniqueUsers.size,
        totalValueLocked: totalValue
      });

    } catch (err) {
      console.error('Error fetching MewLock boxes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load MewLock data');
    } finally {
      setLoading(false);
    }
  }, [wallet, network, explorerUrl]);

  const refreshData = useCallback(() => {
    fetchMewLockBoxes();
  }, [fetchMewLockBoxes]);

  // Initial load and setup interval for periodic updates
  useEffect(() => {
    fetchMewLockBoxes();

    // Refresh every 2 minutes
    const interval = setInterval(fetchMewLockBoxes, 2 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [fetchMewLockBoxes]);

  // Refresh when wallet changes
  useEffect(() => {
    if (wallet && allLocks.length > 0) {
      // Re-filter user locks when wallet changes
      try {
        const userAddresses = wallet.getAddresses();
        const userBoxes = allLocks.filter(lock => 
          userAddresses.some((addr: string) => addr === lock.depositorAddress)
        );
        setUserLocks(userBoxes);
      } catch (err) {
        console.warn('Failed to get wallet addresses:', err);
        setUserLocks([]);
      }
    }
  }, [wallet, allLocks]);

  return {
    allLocks,
    userLocks,
    globalStats,
    loading,
    error,
    refreshData
  };
};