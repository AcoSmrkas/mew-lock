/**
 * MewLock Contract Address on Ergo Mainnet
 */
export const MEWLOCK_CONTRACT_ADDRESS = 'QjvCfNTp9tLHWqvhfZL6rYtcC3TYkPm7GthjCPQh4uFBKHJXRU';

/**
 * MewLock Contract Address on Ergo Testnet
 */
export const MEWLOCK_CONTRACT_ADDRESS_TESTNET = 'your_testnet_contract_address_here';

/**
 * Available lock durations with their corresponding block counts
 */
export interface LockDuration {
  value: string;
  label: string;
  days: number;
  blocks: number;
  description: string;
}

export const LOCK_DURATIONS: LockDuration[] = [
  {
    value: 'week',
    label: '1 Week',
    days: 7,
    blocks: 5040,
    description: 'Short-term lock for testing or quick holds'
  },
  {
    value: 'month',
    label: '1 Month',
    days: 30,
    blocks: 21600,
    description: 'Monthly lock for medium-term hodling'
  },
  {
    value: 'quarter',
    label: '3 Months',
    days: 90,
    blocks: 64800,
    description: 'Quarterly lock for seasonal strategies'
  },
  {
    value: 'half_year',
    label: '6 Months',
    days: 180,
    blocks: 129600,
    description: 'Half-year lock for mid-term investment'
  },
  {
    value: 'year',
    label: '1 Year',
    days: 365,
    blocks: 262800,
    description: 'Annual lock for long-term hodling'
  },
  {
    value: 'two_years',
    label: '2 Years',
    days: 730,
    blocks: 525600,
    description: 'Two-year lock for serious long-term commitment'
  },
  {
    value: 'five_years',
    label: '5 Years',
    days: 1825,
    blocks: 1314000,
    description: 'Five-year lock for maximum diamond hands (requires storage rent)'
  },
  {
    value: 'ten_years',
    label: '10 Years',
    days: 3650,
    blocks: 2628000,
    description: 'Decade lock for ultimate long-term vision (requires storage rent)'
  }
];

/**
 * MewLock Protocol Parameters
 */
export const PROTOCOL_PARAMETERS = {
  // Withdrawal fee percentage (3%)
  WITHDRAWAL_FEE_PERCENT: 3,
  
  // Minimum lock amounts
  MIN_ERG_AMOUNT: 0.1, // in ERG
  MIN_TOKEN_AMOUNT: 34, // in base units
  
  // Network fees
  ESTIMATED_TX_FEE: 0.0011, // in ERG
  
  // Storage rent threshold (4 years in blocks)
  STORAGE_RENT_THRESHOLD: 1051200, // ~4 years
  
  // Block time (approximate)
  BLOCK_TIME_MINUTES: 2,
  
  // Fee recipient address (for 3% fees)
  FEE_RECIPIENT_ADDRESS: '9fMXyimRGbeGLEgJsQREEQJJF6QJj8eJVi8vPXSJ6YSXRF5TenB',
  
  // API endpoints
  MAINNET_EXPLORER_URL: 'https://api.ergoplatform.com/api/v1',
  TESTNET_EXPLORER_URL: 'https://api-testnet.ergoplatform.com/api/v1',
  
  // External APIs
  COINGECKO_API_URL: 'https://api.coingecko.com/api/v3',
  SPECTRUM_API_URL: 'https://api.spectrum.fi/v1'
};

/**
 * ErgoScript template for MewLock contract
 */
export const MEWLOCK_SCRIPT_TEMPLATE = `{
  // MewLock Time-Lock Contract
  
  val depositorPk = SELF.R4[GroupElement].get
  val unlockHeight = SELF.R5[Int].get
  val creationTimestamp = SELF.R6[Long].get
  
  val validUnlock = HEIGHT >= unlockHeight
  val depositorSig = proveDlog(depositorPk)
  
  // Allow withdrawal only after unlock height by original depositor
  sigmaProp(validUnlock && depositorSig)
}`;

/**
 * Transaction building parameters
 */
export const TRANSACTION_PARAMETERS = {
  // Minimum box value (to cover storage costs)
  MIN_BOX_VALUE: 1000000n, // 0.001 ERG in nanoERG
  
  // Maximum inputs per transaction
  MAX_INPUTS: 50,
  
  // Maximum outputs per transaction  
  MAX_OUTPUTS: 50,
  
  // Data size limits
  MAX_REGISTER_SIZE: 256, // bytes
  MAX_BOX_SIZE: 4096, // bytes
  
  // Gas limits
  MAX_COST: 1000000,
  
  // Token limits
  MAX_TOKENS_PER_BOX: 120
};

/**
 * UI Configuration
 */
export const UI_CONFIG = {
  // Refresh intervals
  DATA_REFRESH_INTERVAL: 2 * 60 * 1000, // 2 minutes
  PRICE_REFRESH_INTERVAL: 5 * 60 * 1000, // 5 minutes
  
  // Display limits
  MAX_LOCKS_PER_PAGE: 20,
  MAX_LEADERBOARD_ENTRIES: 50,
  
  // Animation durations
  LOADING_TIMEOUT: 30000, // 30 seconds
  TRANSACTION_TIMEOUT: 60000, // 1 minute
  
  // Chart parameters
  CHART_COLORS: {
    primary: '#1976d2',
    secondary: '#dc004e',
    success: '#2e7d32',
    warning: '#ed6c02',
    error: '#d32f2f'
  }
};

/**
 * Error messages
 */
export const ERROR_MESSAGES = {
  WALLET_NOT_CONNECTED: 'Please connect your wallet first',
  INSUFFICIENT_BALANCE: 'Insufficient ERG balance',
  INVALID_AMOUNT: 'Please enter a valid ERG amount',
  INVALID_DURATION: 'Please select a lock duration',
  TRANSACTION_FAILED: 'Transaction failed to submit',
  NETWORK_ERROR: 'Network error - please try again',
  BOX_NOT_FOUND: 'Lock box not found',
  ALREADY_UNLOCKED: 'This lock has already been unlocked',
  NOT_READY_TO_UNLOCK: 'Lock is not ready for withdrawal yet',
  PARSE_ERROR: 'Failed to parse blockchain data'
};

/**
 * Success messages
 */
export const SUCCESS_MESSAGES = {
  LOCK_CREATED: 'Lock created successfully!',
  LOCK_UNLOCKED: 'Assets unlocked successfully!',
  DATA_REFRESHED: 'Data refreshed',
  WALLET_CONNECTED: 'Wallet connected successfully'
};

/**
 * Get contract address for network
 */
export const getContractAddress = (network: 'mainnet' | 'testnet'): string => {
  return network === 'mainnet' ? MEWLOCK_CONTRACT_ADDRESS : MEWLOCK_CONTRACT_ADDRESS_TESTNET;
};

/**
 * Get explorer URL for network
 */
export const getExplorerUrl = (network: 'mainnet' | 'testnet'): string => {
  return network === 'mainnet' 
    ? PROTOCOL_PARAMETERS.MAINNET_EXPLORER_URL 
    : PROTOCOL_PARAMETERS.TESTNET_EXPLORER_URL;
};

/**
 * Calculate blocks from days
 */
export const calculateBlocksFromDays = (days: number): number => {
  const minutesPerDay = 24 * 60;
  const minutes = days * minutesPerDay;
  return Math.floor(minutes / PROTOCOL_PARAMETERS.BLOCK_TIME_MINUTES);
};

/**
 * Calculate days from blocks
 */
export const calculateDaysFromBlocks = (blocks: number): number => {
  const minutes = blocks * PROTOCOL_PARAMETERS.BLOCK_TIME_MINUTES;
  return Math.floor(minutes / (24 * 60));
};