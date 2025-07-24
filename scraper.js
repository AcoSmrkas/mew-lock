async function processMewLockTransactions(block) {
    const MEWLOCK_TOKEN_CONTRACT = "5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAqCCBNBMNDXk66AhdKCbK5jFqnZWPwKm6eZ1BXjr9Au8sjhi4HKhrxZWbvr4yi9bBFFKbzhhQm9dVcMpCB3S5Yj2m6XaHaivHN1DFCPBo6nQRV9sBMYZrP3tbCtgKgiTLZWLNNPLFPWhmoR1DABBGnVe5GYNwTxJZY2Mc2u8KZQC4pLqkHJmdq2hHSfaxzK77QXtzyyk59z4EBjyMWeVCtrcDg2jZBepPhoT6i5xUAkzBzhGK3SFor2v44yahHZiHNPj5W3LEU9mFCdiPwNCVd9S2a5MNZJHBukWKVjVF4s5bhXkCzW2MbXjAH1cue4APHYvobkPpn2zd9vnwLow8abjAdLBmTz2idAWchsavdU";
    
    try {
        console.log('Processing block:', block?.block?.height || block?.height || 'unknown height');
        
        // Flexible block structure handling
        let transactions = [];
        if (block?.block?.blockTransactions) {
            transactions = block.block.blockTransactions;
        } else if (block?.blockTransactions) {
            transactions = block.blockTransactions;
        } else if (block?.transactions) {
            transactions = block.transactions;
        } else if (Array.isArray(block)) {
            transactions = block;
        } else {
            console.log('No transactions found in block structure');
            return;
        }

        console.log(`Found ${transactions.length} transactions to check`);

        // Filter transactions involving MewLock contract
        const lockTxs = transactions.filter(tx => {
            if (!tx) return false;
            
            // Check outputs for lock operations
            const hasLockOutput = tx.outputs?.some(o => o?.address === MEWLOCK_TOKEN_CONTRACT);
            // Check inputs for unlock operations  
            const hasLockInput = tx.inputs?.some(i => i?.address === MEWLOCK_TOKEN_CONTRACT);
            
            return hasLockOutput || hasLockInput;
        });

        console.log(`Found ${lockTxs.length} MewLock transactions`);

        for (let tx of lockTxs) {
            if (!tx?.outputs || !tx?.inputs) {
                console.log(`Skipping transaction ${tx?.id} - missing inputs/outputs`);
                continue;
            }

            console.log(`Processing transaction: ${tx.id}`);

            // Check if this is a lock operation (output to MewLock address)
            const lockOutput = tx.outputs.find(o => o?.address === MEWLOCK_TOKEN_CONTRACT);
            const isLockOperation = !!lockOutput;
            
            // Check if this is an unlock operation (input from MewLock address)
            const lockInput = tx.inputs.find(i => i?.address === MEWLOCK_TOKEN_CONTRACT);
            const isUnlockOperation = !!lockInput;
            
            if (isLockOperation) {
                console.log('Processing lock operation...');
                
                // For lock operations, we should have the transaction data already
                // But let's fetch full details to be sure
                let txDetails = tx;
                
                // If we don't have full details, fetch them
                if (!lockOutput?.additionalRegisters?.R4 || !lockOutput?.additionalRegisters?.R5) {
                    try {
                        const response = await a.get(`${c.EXPLORER_API_URL}api/v1/transactions/${tx.id}`);
                        txDetails = response.data;
                    } catch (fetchError) {
                        console.error(`Error fetching transaction details for ${tx.id}:`, fetchError);
                        continue;
                    }
                }

                const fullLockOutput = txDetails.outputs.find(o => o?.address === MEWLOCK_TOKEN_CONTRACT);
                
                if (fullLockOutput?.additionalRegisters?.R4 && fullLockOutput?.additionalRegisters?.R5) {
                    // Get user address from transaction inputs (first input is usually the user)
                    const userAddress = txDetails.inputs[0]?.address;
                    
                    // Get unlock height from R5 register - parse correctly
                    let unlockHeight;
                    try {
                        console.log('R5 register data:', fullLockOutput.additionalRegisters.R5);
                        
                        if (fullLockOutput.additionalRegisters.R5.renderedValue) {
                            unlockHeight = parseInt(fullLockOutput.additionalRegisters.R5.renderedValue);
                            console.log('Parsed from renderedValue:', unlockHeight);
                        } else if (fullLockOutput.additionalRegisters.R5.serializedValue) {
                            // Parse from serialized value - this is Ergo's variable-length integer encoding
                            const hexValue = fullLockOutput.additionalRegisters.R5.serializedValue;
                            console.log('Raw R5 hex:', hexValue);
                            
                            // Remove the type prefix (04 for SInt)
                            let cleanHex = hexValue.startsWith('04') ? hexValue.substring(2) : hexValue;
                            console.log('Clean R5 hex:', cleanHex);
                            
                            // Parse Ergo's VLQ (Variable Length Quantity) encoding
                            // Convert hex string to bytes
                            const bytes = [];
                            for (let i = 0; i < cleanHex.length; i += 2) {
                                bytes.push(parseInt(cleanHex.substr(i, 2), 16));
                            }
                            
                            // Decode VLQ - Ergo uses little-endian format
                            unlockHeight = 0;
                            let shift = 0;
                            for (let i = 0; i < bytes.length; i++) {
                                const byte = bytes[i];
                                unlockHeight += (byte & 0x7F) << shift;
                                if ((byte & 0x80) === 0) break; // No more bytes
                                shift += 7;
                            }
                            
                            console.log('Parsed from serializedValue:', unlockHeight);
                        }
                        
                        // Validate the parsed value
                        if (unlockHeight && unlockHeight > 0 && unlockHeight < 100000000) {
                            console.log('Successfully parsed unlock height:', unlockHeight);
                        } else {
                            console.log('Invalid unlock height:', unlockHeight);
                            unlockHeight = null;
                        }
                    } catch (e) {
                        console.error('Error parsing unlock height:', e);
                        console.error('R5 data:', fullLockOutput.additionalRegisters.R5);
                        unlockHeight = null;
                    }
                    
                    const currentHeight = fullLockOutput.creationHeight;
                    const lockDuration = unlockHeight ? unlockHeight - currentHeight : null;
                    
                    // Get locked amounts
                    const lockedErg = fullLockOutput.value / 1000000000; // Convert to ERG
                    const lockedTokens = fullLockOutput.assets || [];
                    
                    // Calculate estimated unlock time (assuming ~2 minutes per block)
                    let unlockTimeString = 'Unknown';
                    if (lockDuration && lockDuration > 0) {
                        const estimatedUnlockTime = new Date(Date.now() + (lockDuration * 2 * 60 * 1000));
                        unlockTimeString = estimatedUnlockTime.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                    }
                    
                    let message = `🔒 <b>MewLock - Assets Locked</b>\n\n`;
                    message += `👤 User: <i><a href="https://ergexplorer.com/addresses/${userAddress}">${userAddress?.substr(0, 6)}...${userAddress?.substr(-4)}</a></i>\n`;
                    
                    // Show locked ERG if significant amount
                    if (lockedErg > 0.001) {
                        message += `💰 ERG: <b>${lockedErg.toFixed(4)} ERG</b>\n`;
                    }
                    
                    // Show locked tokens
                    if (lockedTokens.length > 0) {
                        message += `🪙 Tokens:\n`;
                        for (const token of lockedTokens) {
                            const decimals = token.decimals || 0;
                            const amount = token.amount / Math.pow(10, decimals);
                            const tokenName = token.name || 'Unknown Token';
                            message += `   • <b>${amount.toLocaleString()} ${tokenName}</b>\n`;
                        }
                    }
                    
                    if (lockDuration && lockDuration > 0) {
                        message += `⏰ Lock Duration: <b>${lockDuration.toLocaleString()} blocks</b>\n`;
                        message += `🔓 Unlock Height: <b>${unlockHeight.toLocaleString()}</b>\n`;
                        message += `📅 Est. Unlock: <b>${unlockTimeString}</b>\n\n`;
                    } else {
                        message += `⏰ Lock Duration: <b>Unable to parse</b>\n\n`;
                    }
                    
                    message += `🔗 <a href="https://ergexplorer.com/transactions/${tx.id}">View Transaction</a>\n`;
                    message += `💎 Lock your assets at <a href="https://mewfinance.com/locks">mewfinance.com/locks</a>`;

                    // Send to Telegram
                    u.sendMessageToGroup(message, TELEGRAM_BOT_TOKEN, TELEGRAM_GROUP_ID);
                    u.sendMessageToGroup(message, TELEGRAM_BOT_TOKEN, SECOND_TELEGRAM_GROUP_ID);
                    
                    console.log(`MewLock: ${userAddress} locked ${lockedErg} ERG + ${lockedTokens.length} tokens for ${lockDuration || 'unknown'} blocks`);
                } else {
                    console.log('Lock output missing required registers R4 or R5');
                }
            } 
            
            if (isUnlockOperation && !isLockOperation) {
                console.log('Processing unlock operation...');
                
                // Process unlock operation - need to get full transaction details first
                let txDetails = tx;
                
                // If we don't have full details, fetch them
                if (!lockInput?.additionalRegisters) {
                    try {
                        const response = await a.get(`${c.EXPLORER_API_URL}api/v1/transactions/${tx.id}`);
                        txDetails = response.data;
                    } catch (fetchError) {
                        console.error(`Error fetching transaction details for unlock ${tx.id}:`, fetchError);
                        continue;
                    }
                }

                const fullLockInput = txDetails.inputs.find(i => i?.address === MEWLOCK_TOKEN_CONTRACT);
                if (fullLockInput) {
                    // Get the unlocked amounts
                    const unlockedErg = fullLockInput.value / 1000000000; // Convert to ERG
                    const unlockedTokens = fullLockInput.assets || [];
                    
                    // Get the recipient - find the output that received the unlocked assets
                    const recipientOutput = txDetails.outputs.find(o => 
                        o?.address !== MEWLOCK_TOKEN_CONTRACT && 
                        o?.address !== "2iHkR7CWvD1R4j1yZg5bkeDRQavjAaVPeTDFGGLZduHyfWMuYpmhHocX8GJoaieTx78FntzJbCBVL6rf96ocJoZdmWBL2fci7NqWgAirppPQmZ7fN9V6z13Ay6brPriBKYqLp1bT2Fk4FkFLCfdPpe" && // Exclude miner fee address
                        (Math.abs(o.value - fullLockInput.value) < 10000000 || (o.assets && o.assets.length > 0)) // Has similar ERG value or has tokens
                    );
                    
                    const recipientAddress = recipientOutput?.address || txDetails.outputs[0]?.address;
                    
                    // Get original lock info from the input's registers
                    let unlockHeight = 'N/A';
                    let lockDurationBlocks = 'N/A';
                    let wasUnlockedEarly = false;
                    
                    if (fullLockInput.additionalRegisters?.R5) {
                        try {
                            let targetUnlockHeight;
                            console.log('Unlock R5 register data:', fullLockInput.additionalRegisters.R5);
                            
                            if (fullLockInput.additionalRegisters.R5.renderedValue) {
                                targetUnlockHeight = parseInt(fullLockInput.additionalRegisters.R5.renderedValue);
                                console.log('Unlock parsed from renderedValue:', targetUnlockHeight);
                            } else if (fullLockInput.additionalRegisters.R5.serializedValue) {
                                const hexValue = fullLockInput.additionalRegisters.R5.serializedValue;
                                console.log('Unlock raw R5 hex:', hexValue);
                                
                                let cleanHex = hexValue.startsWith('04') ? hexValue.substring(2) : hexValue;
                                
                                // Parse Ergo's VLQ encoding
                                const bytes = [];
                                for (let i = 0; i < cleanHex.length; i += 2) {
                                    bytes.push(parseInt(cleanHex.substr(i, 2), 16));
                                }
                                
                                targetUnlockHeight = 0;
                                let shift = 0;
                                for (let i = 0; i < bytes.length; i++) {
                                    const byte = bytes[i];
                                    targetUnlockHeight += (byte & 0x7F) << shift;
                                    if ((byte & 0x80) === 0) break;
                                    shift += 7;
                                }
                                
                                console.log('Unlock parsed from serializedValue:', targetUnlockHeight);
                            }
                            
                            if (targetUnlockHeight) {
                                const currentHeight = txDetails.outputs[0]?.creationHeight || 0; // Current block height
                                const lockCreationHeight = fullLockInput.outputCreatedAt || 0;
                                
                                unlockHeight = targetUnlockHeight.toLocaleString();
                                lockDurationBlocks = (targetUnlockHeight - lockCreationHeight).toLocaleString();
                                wasUnlockedEarly = currentHeight < targetUnlockHeight;
                            }
                            
                        } catch (e) {
                            console.error('Error parsing unlock height in unlock operation:', e);
                        }
                    }
                    
                    // Calculate what the user actually received back
                    const receivedErg = recipientOutput?.value ? (recipientOutput.value / 1000000000) : 0;
                    const receivedTokens = recipientOutput?.assets || [];
                    
                    let message = `🔓 <b>MewLock - Assets Unlocked</b>\n\n`;
                    message += `👤 User: <i><a href="https://ergexplorer.com/addresses/${recipientAddress}">${recipientAddress?.substr(0, 6)}...${recipientAddress?.substr(-4)}</a></i>\n`;
                    
                    // Show original locked amounts
                    if (unlockedErg > 0.001) {
                        message += `💰 Original ERG: <b>${unlockedErg.toFixed(4)} ERG</b>\n`;
                        if (receivedErg > 0) {
                            const ergFee = unlockedErg - receivedErg;
                            message += `💵 Received ERG: <b>${receivedErg.toFixed(4)} ERG</b>`;
                            if (ergFee > 0.001) {
                                message += ` (${ergFee.toFixed(4)} ERG fee)`;
                            }
                            message += `\n`;
                        }
                    }
                    
                    // Show token unlocks
                    if (unlockedTokens.length > 0) {
                        message += `🪙 Tokens:\n`;
                        for (const token of unlockedTokens) {
                            const decimals = token.decimals || 0;
                            const originalAmount = token.amount / Math.pow(10, decimals);
                            const receivedToken = receivedTokens.find(t => t.tokenId === token.tokenId);
                            const receivedAmount = receivedToken ? (receivedToken.amount / Math.pow(10, decimals)) : 0;
                            const tokenFee = originalAmount - receivedAmount;
                            const tokenName = token.name || 'Unknown Token';
                            
                            message += `   • <b>${originalAmount.toLocaleString()} ${tokenName}</b> locked\n`;
                            if (receivedAmount > 0) {
                                message += `   • <b>${receivedAmount.toLocaleString()} ${tokenName}</b> received`;
                                if (tokenFee > 0) {
                                    message += ` (${tokenFee.toLocaleString()} fee)`;
                                }
                                message += `\n`;
                            }
                        }
                    }
                    
                    if (unlockHeight !== 'N/A') {
                        message += `🔓 Target Unlock Height: <b>${unlockHeight}</b>\n`;
                        message += `⏰ Original Lock Duration: <b>${lockDurationBlocks} blocks</b>\n`;
                        
                        if (wasUnlockedEarly) {
                            message += `⚠️ <b>Unlocked Early!</b> (before target height)\n`;
                        } else {
                            message += `✅ <b>Unlocked on Schedule</b>\n`;
                        }
                    }
                    
                    message += `\n🔗 <a href="https://ergexplorer.com/transactions/${tx.id}">View Transaction</a>\n`;
                    message += `💎 Lock your assets at <a href="https://mewfinance.com/locks">mewfinance.com/locks</a>`;

                    // Send to Telegram
                    u.sendMessageToGroup(message, TELEGRAM_BOT_TOKEN, TELEGRAM_GROUP_ID);
                    u.sendMessageToGroup(message, TELEGRAM_BOT_TOKEN, SECOND_TELEGRAM_GROUP_ID);
                    
                    const earlyText = wasUnlockedEarly ? ' (early)' : ' (on schedule)';
                    console.log(`MewLock: ${recipientAddress} unlocked ${unlockedErg} ERG + ${unlockedTokens.length} tokens${earlyText}`);
                }
            }
        }
    } catch (error) {
        console.error('Error in processMewLockTransactions:', error);
    }
}