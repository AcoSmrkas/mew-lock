import { MewLockBox } from './useMewLockBoxes';

/**
 * Get current blockchain height from Ergo Explorer
 */
export const getCurrentHeight = async (explorerUrl: string): Promise<number> => {
  try {
    const response = await fetch(`${explorerUrl}/info`);
    const data = await response.json();
    return data.height || 0;
  } catch (error) {
    console.error('Failed to get current height:', error);
    return 0;
  }
};

/**
 * Parse Ergo box to MewLock format
 */
export const parseMewLockBox = (box: any, currentHeight: number): MewLockBox | null => {
  try {
    const boxId = box.boxId;
    const ergAmount = BigInt(box.value || 0);
    const registers = box.additionalRegisters || {};

    // Parse depositor address from R4 (GroupElement -> P2PK address)
    const depositorAddress = parseAddressFromRegister(registers.R4);
    if (!depositorAddress) {
      throw new Error('Failed to parse depositor address');
    }

    // Parse unlock height from R5
    const unlockHeight = parseUnlockHeightFromRegister(registers.R5);
    if (!unlockHeight) {
      throw new Error('Failed to parse unlock height');
    }

    // Calculate remaining blocks and withdrawal status
    const remainingBlocks = Math.max(0, unlockHeight - currentHeight);
    const canWithdraw = currentHeight >= unlockHeight;

    // Parse tokens from assets
    const tokens = (box.assets || []).map((asset: any) => ({
      tokenId: asset.tokenId,
      amount: BigInt(asset.amount || 0),
      name: asset.name,
      decimals: asset.decimals || 0
    }));

    return {
      boxId,
      ergAmount,
      depositorAddress,
      unlockHeight,
      canWithdraw,
      remainingBlocks,
      tokens
    };
  } catch (error) {
    console.error('Failed to parse MewLock box:', error);
    return null;
  }
};

/**
 * Parse P2PK address from register R4
 */
const parseAddressFromRegister = (registerData: string | undefined): string | null => {
  if (!registerData) return null;
  
  try {
    // Register format: "0e[length][groupElement]"
    if (!registerData.startsWith('0e')) return null;
    
    // For now, return a simplified format
    // In a real implementation, you'd use Ergo's address encoding
    const groupElement = registerData.substring(4);
    
    // This would need proper GroupElement to Address conversion
    // For demo purposes, creating a mock P2PK address
    if (groupElement.length >= 66) {
      return '9' + groupElement.substring(0, 60); // Simplified P2PK format
    }
    
    return null;
  } catch (error) {
    console.error('Failed to parse address from register:', error);
    return null;
  }
};

/**
 * Parse unlock height from register R5
 */
const parseUnlockHeightFromRegister = (registerData: string | undefined): number | null => {
  if (!registerData) return null;
  
  try {
    // Register format for Int: "04[hex_value]"
    if (!registerData.startsWith('04')) return null;
    
    const hexValue = registerData.substring(2);
    return parseInt(hexValue, 16);
  } catch (error) {
    console.error('Failed to parse unlock height from register:', error);
    return null;
  }
};

/**
 * Format ERG amount from nanoERG to human readable
 */
export const formatErg = (nanoErg: bigint): string => {
  const erg = Number(nanoErg) / 1e9;
  
  if (erg >= 1_000_000) {
    return `${(erg / 1_000_000).toFixed(2)}M ERG`;
  } else if (erg >= 1_000) {
    return `${(erg / 1_000).toFixed(1)}K ERG`;
  } else {
    return `${erg.toFixed(4)} ERG`;
  }
};

/**
 * Format duration from blocks to human readable time
 */
export const formatDuration = (blocks: number): string => {
  const minutes = blocks * 2; // ~2 minutes per block
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${mins}m`;
  } else {
    return `${mins}m`;
  }
};

/**
 * Calculate 3% withdrawal fee
 */
export const calculateFee = (ergAmount: number): number => {
  return ergAmount * 0.03;
};

/**
 * Format token amount considering decimals
 */
export const formatTokenAmount = (amount: bigint, decimals: number = 0): string => {
  const tokenAmount = Number(amount) / Math.pow(10, decimals);
  
  if (tokenAmount >= 1_000_000) {
    return `${(tokenAmount / 1_000_000).toFixed(2)}M`;
  } else if (tokenAmount >= 1_000) {
    return `${(tokenAmount / 1_000).toFixed(1)}K`;
  } else {
    return tokenAmount.toFixed(Math.min(decimals, 4));
  }
};

/**
 * Validate ERG amount
 */
export const validateErgAmount = (amount: string): { valid: boolean; error?: string } => {
  const num = parseFloat(amount);
  
  if (isNaN(num)) {
    return { valid: false, error: 'Invalid number' };
  }
  
  if (num < 0.1) {
    return { valid: false, error: 'Minimum amount is 0.1 ERG' };
  }
  
  if (num > 1000000) {
    return { valid: false, error: 'Amount too large' };
  }
  
  return { valid: true };
};

/**
 * Check if storage rent is required (locks > 4 years)
 */
export const isStorageRentRequired = (blocks: number): boolean => {
  const fourYearsInBlocks = 4 * 365 * 24 * 30; // ~4 years in blocks
  return blocks > fourYearsInBlocks;
};

/**
 * Convert ERG to nanoERG
 */
export const ergToNanoErg = (erg: number): bigint => {
  return BigInt(Math.floor(erg * 1e9));
};

/**
 * Convert nanoERG to ERG
 */
export const nanoErgToErg = (nanoErg: bigint): number => {
  return Number(nanoErg) / 1e9;
};

/**
 * Generate lock box script (simplified)
 */
export const generateLockScript = (depositorPk: string, unlockHeight: number): string => {
  // This would be the actual ErgoScript for MewLock
  // For demo purposes, returning a placeholder
  return `{
    val depositor = proveDlog(fromBase16("${depositorPk}"))
    val unlockHeight = ${unlockHeight}
    
    sigmaProp(
      HEIGHT >= unlockHeight && depositor
    )
  }`;
};

/**
 * Estimate transaction fee
 */
export const estimateTransactionFee = (): bigint => {
  return BigInt(1100000); // ~0.0011 ERG in nanoERG
};