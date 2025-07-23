<script>
	let openIndex = null;

	function toggle(index) {
		openIndex = openIndex === index ? null : index;
	}

	const questions = [
		{
			question: 'What is Mew Mart?',
			answer:
				'Mew Mart is an NFT marketplace, and our goal is to upgrade the Tradehouse and Marketplace space to match the full potential of Ergo.'
		},
		{
			question: 'How does Mew Mart work?',
			answer:
				'Your Tradehouse for tokens, assets, NFTs, stored on-chain in smart contracts, so they are safe from 3rd parties. Proper P2P trading.'
		},
		{
			question: 'How to use Mew Mart?',
			answer:
				'Have some ERG. Install Nautilus Wallet and fund it with ERG. Connect your wallet to Mew Mart and start trading assets, NFTs.'
		},
		{
			question: 'Does Mew Mart have any fees?',
			answer:
				'Mew Mart has 2 kinds of fees: Listing and cancelation fees, but it includes a Mew Tier protocol which can significantly lower your fees.'
		},
		{
			question: 'What are artist royalties?',
			answer:
				'On Ergo, artists have the option to add royalties to their NFTs. Those royalties are respected and paid out for each NFT sale on Mew Mart.'
		},
		{
			question: 'Wallet is taking too much time to load?',
			answer:
				'If you are holding a huge amount of assets/NFTs, we recommend moving your listing assets to a less populated assets wallet.'
		},
		{
			question: "Wallet states 'not enough balance' but I have the funds/NFT?",
			answer:
				'The wallet needs some time to sync with the blockchain. Wait several confirmations for the wallet to sync.'
		},
		{
			question: 'Disclaimer',
			answer:
				'Mew Mart is not responsible for any content posted or for any loss of assets. Interactions are done through smart contracts.'
		}
	];
</script>

<div class="container mb-2">
	<br />
	<h1 class="section-title text-4xl font-bold text-white text-center pt-2 mb-5">
		Frequently Asked Questions
	</h1>

	<ul class="faq-list">
		{#each questions as { question, answer }, index}
			<li class="faq-item">
				<button
					on:click={() => toggle(index)}
					class="faq-question"
					aria-expanded={openIndex === index}
					aria-controls={`panel-${index}`}
				>
					{question}
					<span class="faq-icon">{openIndex === index ? '−' : '+'}</span>
				</button>
				{#if openIndex === index}
					<div id={`panel-${index}`} class="faq-answer" aria-hidden={openIndex !== index}>
						<p>{answer}</p>
					</div>
				{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	:root {
		--primary-color: #f4d22c;
		--secondary-color: #f4d22c;
		--text-color: #333;
		--background-color: var(--forms-bg);
		--card-background: var(--forms-bg);
	}

	.faq-title {
		font-size: 2.5rem;
		font-weight: bold;
		text-align: center;
		color: var(--primary-color);
		margin-bottom: 2rem;
	}

	.faq-list {
		list-style-type: none;
		padding: 0;
	}

	.faq-item {
		margin-bottom: 1rem;
		background-color: var(--card-background);
		border-radius: 8px;
		overflow: hidden;
	}

	.faq-question {
		width: 100%;
		padding: 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: none;
		border: none;
		text-align: left;
		font-size: 1.1rem;
		font-weight: 500;
		color: var(--primary-color);
		cursor: pointer;
		transition: background-color 0.3s ease;
	}

	.faq-question:hover {
		background-color: rgba(56, 34, 97, 1);
	}

	.faq-icon {
		font-size: 1.5rem;
		font-weight: bold;
	}

	.faq-answer {
		padding: 1rem;
		background-color: var(--footer);
		transition: all 0.3s ease;
	}

	.faq-answer p {
		margin: 0;
		color: var(--text-white);
	}

	@media (max-width: 768px) {
		.faq-container {
			padding: 1rem;
		}

		.faq-title {
			font-size: 2rem;
		}

		.faq-question {
			font-size: 1rem;
		}
	}
</style>
