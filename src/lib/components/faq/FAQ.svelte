<script>
	let openIndex = null;

	function toggle(index) {
		openIndex = openIndex === index ? null : index;
	}

	const questions = [
		{
			question: 'What is MewLock?',
			answer:
				'MewLock is a time-locked asset protocol on Ergo that allows users to lock ERG and tokens for specified durations. Assets are secured by smart contracts and can only be withdrawn after the unlock height is reached.'
		},
		{
			question: 'How does MewLock work?',
			answer:
				'Users send assets to the MewLock smart contract with a specified unlock height (block number). The contract stores the assets safely until the blockchain reaches that height, after which only the original depositor can withdraw them.'
		},
		{
			question: 'What are the fees?',
			answer:
				'MewLock has a 3% withdrawal fee on all locked assets. For locks longer than 4 years, additional Ergo storage rent fees may apply as per the Ergo protocol.'
		},
		{
			question: 'What data is needed for a MewLock transaction?',
			answer:
				'Lock Transaction Inputs: (1) User\'s UTXOs containing ERG/tokens to lock, (2) User\'s address for change. Outputs: (1) MewLock contract box with locked assets, (2) Change back to user. Registers: R4 contains user\'s public key, R5 contains unlock height (block number).'
		},
		{
			question: 'How are withdrawal transactions structured?',
			answer:
				'Withdrawal Transaction Inputs: (1) MewLock contract box containing locked assets, (2) User\'s UTXOs for fees. Outputs: (1) Assets returned to user (minus 3% fee), (2) Fee to protocol, (3) Miner fee. The transaction can only be created after the unlock height is reached.'
		},
		{
			question: 'Detailed Lock Transaction Example',
			answer:
				'Lock Transaction Building Example:\\n\\n**Inputs:**\\n- Input[0]: User UTXO (5 ERG + 1000 SigUSD tokens)\\n- Input[1]: User UTXO (0.5 ERG for fees)\\n\\n**Outputs:**\\n- Output[0]: MewLock Contract Box\\n  - Value: 5000000000 nanoERG\\n  - Assets: [{"tokenId": "03faf2cb329f2e90d6d23b58d91bbb6c046aa143261cc21f52fbe2824bfcbf04", "amount": 1000000000}]\\n  - ErgoTree: MewLock contract script\\n  - Registers:\\n    - R4: 0702c1a2b3c4d5e6f7... (user public key)\\n    - R5: 04a0860100 (unlock height 100000 in VLQ encoding)\\n- Output[1]: Change Box\\n  - Value: 499000000 nanoERG (0.499 ERG after 0.001 ERG miner fee)\\n  - ErgoTree: User address script\\n\\n**Transaction Fee:** 0.001 ERG (1000000 nanoERG)'
		},
		{
			question: 'Detailed Withdrawal Transaction Example',
			answer:
				'Withdrawal Transaction Building Example:\\n\\n**Inputs:**\\n- Input[0]: MewLock Contract Box (from lock example)\\n  - Value: 5000000000 nanoERG\\n  - Assets: [{"tokenId": "03faf2cb329f2e90d6d23b58d91bbb6c046aa143261cc21f52fbe2824bfcbf04", "amount": 1000000000}]\\n- Input[1]: User UTXO (0.2 ERG for fees)\\n\\n**Outputs:**\\n- Output[0]: User Receives (97% after 3% fee)\\n  - Value: 4850000000 nanoERG (4.85 ERG)\\n  - Assets: [{"tokenId": "03faf2cb329f2e90d6d23b58d91bbb6c046aa143261cc21f52fbe2824bfcbf04", "amount": 970000000}] (970 SigUSD)\\n  - ErgoTree: User address script\\n- Output[1]: Protocol Fee (3%)\\n  - Value: 150000000 nanoERG (0.15 ERG)\\n  - Assets: [{"tokenId": "03faf2cb329f2e90d6d23b58d91bbb6c046aa143261cc21f52fbe2824bfcbf04", "amount": 30000000}] (30 SigUSD)\\n  - ErgoTree: Protocol fee address\\n- Output[2]: Change\\n  - Value: 199000000 nanoERG (0.199 ERG after miner fee)\\n  - ErgoTree: User address script\\n\\n**Validation:** Current height >= R5 unlock height'
		},
		{
			question: 'Can I withdraw my assets early?',
			answer:
				'No, assets cannot be withdrawn before the specified unlock height. This is enforced by the smart contract - early withdrawal transactions will be rejected by the Ergo network.'
		},
		{
			question: 'What happens if I lose my wallet?',
			answer:
				'If you lose access to your wallet, you cannot withdraw your locked assets. The smart contract requires a signature from the original depositor\'s address. Always backup your wallet seed phrase securely.'
		},
		{
			question: 'How long can I lock assets?',
			answer:
				'You can lock assets for any duration, but locks over 4 years are subject to Ergo\'s storage rent fees. Popular durations include 1 month (~1,440 blocks), 6 months (~8,640 blocks), 1 year (~17,280 blocks), 5 years (~86,400 blocks), and 10 years (~172,800 blocks).'
		},
		{
			question: 'Register Encoding and Implementation Details',
			answer:
				'**Register Encoding Details:**\\n\\n**R4 (User Public Key):**\\n- Type: GroupElement (07)\\n- Format: 07 + 33-byte compressed public key\\n- Example: 0702c1a2b3c4d5e6f7... (34 bytes total)\\n\\n**R5 (Unlock Height):**\\n- Type: SInt (04)\\n- Format: VLQ (Variable Length Quantity) encoded\\n- Example: Block 100000 = 04a0860100\\n- Decoding: [0xa0, 0x86, 0x01, 0x00] -> 100000\\n\\n**VLQ Decoding Process:**\\n```\\nlet result = 0, shift = 0\\nfor each byte in hex:\\n  result += (byte & 0x7F) << shift\\n  if (byte & 0x80) == 0: break\\n  shift += 7\\n```\\n\\n**Smart Contract Validation:**\\n- HEIGHT >= SELF.R5[Int].get (unlock height check)\\n- OUTPUTS(0).propositionBytes == proveDlog(SELF.R4[GroupElement].get).propBytes (owner check)\\n- Fee calculation: locked_value * 0.97 (3% protocol fee)'
		},
		{
			question: 'What is the MewLock contract address?',
			answer:
				'The MewLock smart contract address is: 5adWKCNFaCzfHxRxzoFvAS7khVsqXqvKV6cejDimUXDUWJNJFhRaTmT65PRUPv2fGeXJQ2Yp9GqpiQayHqMRkySDMnWW7X3tBsjgwgT11pa1NuJ3cxf4Xvxo81Vt4HmY3KCxkg1aptVZdCSDA7ASiYE6hRgN5XnyPsaAY2Xc7FUoWN1ndQRA7Km7rjcxr3NHFPirZvTbZfB298EYwDfEvrZmSZhU2FGpMUbmVpdQSbooh8dGMjCf4mXrP2N4FSkDaNVZZPcEPyDr4WM1WHrVtNAEAoWJUTXQKeLEj6srAsPw7PpXgKa74n3Xc7qiXEr2Tut7jJkFLeNqLouQN13kRwyyADQ5aXTCBuhqsucQvyqEEEk7ekPRnqk4LzRyVqCVsRZ7Y5Kk1r1jZjPeXSUCTQGnL1pdFfuJ1SfaYkbgebjnJT2KJWVRamQjztvrhwarcVHDXbUKNawznfJtPVm7abUv81mro23AKhhkPXkAweZ4jXdKwQxjiAq'
		}
	];
</script>

<div class="faq-container">
	<div class="faq-content">
		<h1 class="faq-title">MewLock FAQ</h1>

		<div class="faq-list">
			{#each questions as { question, answer }, index}
				<div class="faq-item">
				<button
					on:click={() => toggle(index)}
					class="faq-question"
					aria-expanded={openIndex === index}
					aria-controls={`panel-${index}`}
				>
					{question}
					<div class="faq-icon">
						{#if openIndex === index}
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M19 13H5V11H19V13Z" fill="currentColor"/>
							</svg>
						{:else}
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z" fill="currentColor"/>
							</svg>
						{/if}
					</div>
				</button>
				{#if openIndex === index}
					<div id={`panel-${index}`} class="faq-answer" aria-hidden={openIndex !== index}>
						<div class="answer-content">
							{@html answer
								.replace(/\\n/g, '<br>')
								.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
								.replace(/```([^`]+)```/g, '<pre><code>$1</code></pre>')
							}
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
	</div>
</div>

<style>
	/* Container */
	.faq-container {
		background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%);
		color: white;
		font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
		padding: 2rem 0;
		min-height: calc(100vh - 140px); /* Account for nav and footer */
	}

	.faq-content {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
	}

	.faq-title {
		font-size: 2.5rem;
		font-weight: 800;
		text-align: center;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		margin-bottom: 3rem;
	}

	.faq-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.faq-item {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 16px;
		overflow: hidden;
		backdrop-filter: blur(10px);
		transition: all 0.3s ease;
	}

	.faq-item:hover {
		transform: translateY(-2px);
		border-color: rgba(102, 126, 234, 0.3);
		box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
	}

	.faq-question {
		width: 100%;
		padding: 1.5rem 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: none;
		border: none;
		text-align: left;
		font-size: 1.1rem;
		font-weight: 600;
		color: white;
		cursor: pointer;
		transition: all 0.3s ease;
	}

	.faq-question:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.faq-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.3s ease;
		color: #667eea;
		flex-shrink: 0;
		margin-left: 1rem;
	}

	.faq-question:hover .faq-icon {
		transform: scale(1.1);
		color: #764ba2;
	}

	.faq-answer {
		padding: 0 2rem 2rem 2rem;
		background: rgba(255, 255, 255, 0.02);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
		animation: slideDown 0.3s ease;
	}

	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.answer-content {
		margin: 0;
		color: rgba(255, 255, 255, 0.8);
		line-height: 1.6;
		font-size: 1rem;
		font-family: 'JetBrains Mono', 'Courier New', monospace;
	}

	.answer-content strong {
		color: #667eea;
		font-weight: 700;
	}

	.answer-content br {
		margin-bottom: 0.5rem;
	}

	.answer-content pre {
		background: rgba(0, 0, 0, 0.4);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		padding: 1rem;
		margin: 1rem 0;
		overflow-x: auto;
	}

	.answer-content code {
		color: #4fd1c5;
		font-family: 'JetBrains Mono', 'Courier New', monospace;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	/* Responsive */
	@media (max-width: 768px) {
		.faq-content {
			padding: 1rem;
		}

		.faq-title {
			font-size: 2rem;
			margin-bottom: 2rem;
		}

		.faq-question {
			padding: 1.25rem 1.5rem;
			font-size: 1rem;
		}

		.faq-answer {
			padding: 0 1.5rem 1.5rem 1.5rem;
		}

		.faq-icon {
			margin-left: 0.5rem;
		}
	}
</style>
