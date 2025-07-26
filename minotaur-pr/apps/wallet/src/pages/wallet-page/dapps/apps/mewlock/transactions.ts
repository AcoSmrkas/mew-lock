import { PROTOCOL_PARAMETERS, getContractAddress, TRANSACTION_PARAMETERS } from './parameters';
import { getCurrentHeight, estimateTransactionFee, ergToNanoErg } from './utils';

/**
 * Create a time-lock transaction
 */
export const createLockTransaction = async (
  wallet: any,
  ergAmount: number, // in nanoERG
  durationBlocks: number,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<any> => {
  try {
    if (!wallet) {
      throw new Error('Wallet not connected');
    }

    // Get current height
    const explorerUrl = PROTOCOL_PARAMETERS.MAINNET_EXPLORER_URL;
    const currentHeight = await getCurrentHeight(explorerUrl);
    const unlockHeight = currentHeight + durationBlocks;

    // Get user's P2PK address and convert to GroupElement
    const userAddresses = wallet.getAddresses();
    if (!userAddresses || userAddresses.length === 0) {
      throw new Error('No wallet addresses available');
    }
    
    const userAddress = userAddresses[0];
    const userPk = await wallet.getPublicKey(userAddress);
    
    // Get available UTXOs
    const utxos = await wallet.getUtxos();
    if (!utxos || utxos.length === 0) {
      throw new Error('No UTXOs available');
    }

    // Calculate required ERG (amount + fees)
    const txFee = estimateTransactionFee();
    const totalRequired = ergToNanoErg(ergAmount) + txFee;

    // Select UTXOs for input
    let selectedUtxos: any[] = [];
    let totalInput = BigInt(0);
    
    for (const utxo of utxos) {
      selectedUtxos.push(utxo);
      totalInput += BigInt(utxo.value);
      
      if (totalInput >= totalRequired) {
        break;
      }
    }

    if (totalInput < totalRequired) {
      throw new Error('Insufficient ERG balance');
    }

    // Build transaction
    const txBuilder = wallet.createTransactionBuilder();

    // Add inputs
    for (const utxo of selectedUtxos) {
      txBuilder.addInput(utxo);
    }

    // Create MewLock output box
    const lockBoxValue = ergToNanoErg(ergAmount);
    const contractAddress = getContractAddress(network);
    
    const lockBox = {
      value: lockBoxValue.toString(),
      address: contractAddress,
      registers: {
        R4: {
          serializedValue: `0e20${userPk}`, // GroupElement (32 bytes)
          renderedValue: userPk
        },
        R5: {
          serializedValue: `04${unlockHeight.toString(16).padStart(8, '0')}`, // Int
          renderedValue: unlockHeight.toString()
        },
        R6: {
          serializedValue: `05${Date.now().toString(16)}`, // Long (creation timestamp)
          renderedValue: Date.now().toString()
        }
      },
      assets: [] // No tokens for basic ERG lock
    };

    txBuilder.addOutput(lockBox);

    // Add change output if needed
    const change = totalInput - totalRequired;
    if (change > TRANSACTION_PARAMETERS.MIN_BOX_VALUE) {
      const changeBox = {
        value: change.toString(),
        address: userAddress,
        registers: {},
        assets: []
      };
      txBuilder.addOutput(changeBox);
    }

    // Build and sign transaction
    const unsignedTx = txBuilder.build();
    const signedTx = await wallet.signTransaction(unsignedTx);

    return signedTx;

  } catch (error) {
    console.error('Failed to create lock transaction:', error);
    throw error;
  }
};

/**
 * Create an unlock transaction (withdrawal with 3% fee)
 */
export const createUnlockTransaction = async (
  wallet: any,
  boxId: string,
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<any> => {
  try {
    if (!wallet) {
      throw new Error('Wallet not connected');
    }

    // Get the lock box details
    const explorerUrl = PROTOCOL_PARAMETERS.MAINNET_EXPLORER_URL;
    const boxResponse = await fetch(`${explorerUrl}/boxes/${boxId}`);
    
    if (!boxResponse.ok) {
      throw new Error('Lock box not found');
    }

    const lockBox = await boxResponse.json();
    
    // Verify this is a MewLock box
    const contractAddress = getContractAddress(network);
    if (lockBox.address !== contractAddress) {
      throw new Error('Not a valid MewLock box');
    }

    // Parse box data
    const boxValue = BigInt(lockBox.value);
    const registers = lockBox.additionalRegisters || {};
    
    // Parse unlock height from R5
    const unlockHeightHex = registers.R5?.serializedValue?.substring(2);
    if (!unlockHeightHex) {
      throw new Error('Invalid lock box - missing unlock height');
    }
    
    const unlockHeight = parseInt(unlockHeightHex, 16);
    const currentHeight = await getCurrentHeight(explorerUrl);
    
    // Check if lock is ready for withdrawal
    if (currentHeight < unlockHeight) {
      throw new Error(`Lock not ready for withdrawal. Unlocks at height ${unlockHeight}, current height is ${currentHeight}`);
    }

    // Parse depositor from R4 and verify ownership
    const depositorPk = registers.R4?.renderedValue;
    const userAddresses = wallet.getAddresses();
    const userPk = await wallet.getPublicKey(userAddresses[0]);
    
    if (depositorPk !== userPk) {
      throw new Error('You are not the owner of this lock');
    }

    // Calculate withdrawal amounts (3% fee)
    const feePercent = PROTOCOL_PARAMETERS.WITHDRAWAL_FEE_PERCENT / 100;
    const feeAmount = BigInt(Math.floor(Number(boxValue) * feePercent));
    const userAmount = boxValue - feeAmount;
    const txFee = estimateTransactionFee();

    // Ensure amounts are valid
    if (userAmount <= txFee) {
      throw new Error('Lock amount too small to cover fees');
    }

    // Get additional UTXOs for transaction fee if needed
    const utxos = await wallet.getUtxos();
    const txBuilder = wallet.createTransactionBuilder();

    // Add the lock box as input
    txBuilder.addInput({
      boxId: lockBox.boxId,
      value: lockBox.value,
      address: lockBox.address,
      registers: lockBox.additionalRegisters,
      assets: lockBox.assets || []
    });

    // Add additional UTXOs if needed for tx fee
    let totalAdditionalInput = BigInt(0);
    const additionalUtxos = utxos.filter((utxo: any) => utxo.boxId !== boxId);
    
    for (const utxo of additionalUtxos) {
      if (totalAdditionalInput >= txFee) break;
      
      txBuilder.addInput(utxo);
      totalAdditionalInput += BigInt(utxo.value);
    }

    // Create output for user (minus 3% fee and tx fee)
    const userOutputValue = userAmount - txFee;
    const userOutput = {
      value: userOutputValue.toString(),
      address: userAddresses[0],
      registers: {},
      assets: lockBox.assets || [] // Return any tokens
    };
    txBuilder.addOutput(userOutput);

    // Create output for protocol fee (3%)
    const feeOutput = {
      value: feeAmount.toString(),
      address: PROTOCOL_PARAMETERS.FEE_RECIPIENT_ADDRESS,
      registers: {},
      assets: []
    };
    txBuilder.addOutput(feeOutput);

    // Add change output if there's excess from additional UTXOs
    const totalInput = boxValue + totalAdditionalInput;
    const totalOutput = userOutputValue + feeAmount + txFee;
    const change = totalInput - totalOutput;
    
    if (change > TRANSACTION_PARAMETERS.MIN_BOX_VALUE) {
      const changeOutput = {
        value: change.toString(),
        address: userAddresses[0],
        registers: {},
        assets: []
      };
      txBuilder.addOutput(changeOutput);
    }

    // Build and sign transaction
    const unsignedTx = txBuilder.build();
    const signedTx = await wallet.signTransaction(unsignedTx);

    return signedTx;

  } catch (error) {
    console.error('Failed to create unlock transaction:', error);
    throw error;
  }
};

/**
 * Create a transaction to consolidate multiple small locks (utility function)
 */
export const createConsolidationTransaction = async (
  wallet: any,
  lockBoxIds: string[],
  network: 'mainnet' | 'testnet' = 'mainnet'
): Promise<any> => {
  try {
    if (!wallet) {
      throw new Error('Wallet not connected');
    }

    if (lockBoxIds.length < 2) {
      throw new Error('Need at least 2 boxes to consolidate');
    }

    // This would be used to consolidate multiple ready-to-unlock boxes
    // into a single transaction for efficiency
    
    // Implementation would be similar to createUnlockTransaction
    // but handling multiple inputs and calculating total fees
    
    throw new Error('Consolidation not yet implemented');

  } catch (error) {
    console.error('Failed to create consolidation transaction:', error);
    throw error;
  }
};

/**
 * Estimate transaction cost
 */
export const estimateTransactionCost = (
  ergAmount: number,
  hasTokens: boolean = false
): { totalCost: number; breakdown: { amount: number; txFee: number; networkFee: number } } => {
  const txFee = Number(estimateTransactionFee()) / 1e9; // Convert to ERG
  const networkFee = PROTOCOL_PARAMETERS.ESTIMATED_TX_FEE;
  
  return {
    totalCost: ergAmount + txFee + networkFee,
    breakdown: {
      amount: ergAmount,
      txFee: txFee,
      networkFee: networkFee
    }
  };
};

/**
 * Validate transaction before submission
 */
export const validateTransaction = (
  tx: any,
  expectedOutputs: number
): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (!tx) {
    errors.push('Transaction is null or undefined');
    return { valid: false, errors };
  }
  
  if (!tx.inputs || tx.inputs.length === 0) {
    errors.push('Transaction has no inputs');
  }
  
  if (!tx.outputs || tx.outputs.length === 0) {
    errors.push('Transaction has no outputs');
  }
  
  if (tx.outputs && tx.outputs.length !== expectedOutputs) {
    errors.push(`Expected ${expectedOutputs} outputs, got ${tx.outputs.length}`);
  }
  
  // Validate input/output value balance
  if (tx.inputs && tx.outputs) {
    const totalInputValue = tx.inputs.reduce((sum: bigint, input: any) => sum + BigInt(input.value || 0), BigInt(0));
    const totalOutputValue = tx.outputs.reduce((sum: bigint, output: any) => sum + BigInt(output.value || 0), BigInt(0));
    
    if (totalInputValue < totalOutputValue) {
      errors.push('Total input value is less than total output value');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};