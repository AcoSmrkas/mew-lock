<div class="h-full flex flex-col grow main-page">
	<div class="container">
		<br />
		<h1 class="section-title text-4xl font-bold text-white text-center pt-2 mb-5">
			Vulnerability Notice
		</h1>

		<p>
			We have identified a vulnerability in one of our smart contracts on Mew Mart, which could
			potentially allow malicious actors to exploit the system in a manner that adversely affects
			sellers. The vulnerability specifically targets certain listings, potentially causing
			unintended consequences for those impacted.
		</p>
		<br />
		<h2>Immediate Action Required:</h2>
		<p>
			- Please review your active listings on Mew Mart. Any listing marked with a red border is
			flagged as potentially vulnerable.
		</p>
		<p>
			- Cancel all flagged listings and promptly relist them to ensure the integrity of your offers.
		</p>
		<p>
			- Any fees associated with canceling and relisting flagged listings will be waived
			automatically. If you are mistakenly charged, please reach out immediately for assistance
			using one of the following channels:
		</p>
		<p>[Telegram: <a target="_new" href="https://t.me/HQ3rr">@HQ3rr</a>]</p>
		<p>[Telegram: <a target="_new" href="https://t.me/AcoSmrkas">@AcoSmrkas</a>]</p>
		<br />
		<h2>Mew Finance Commitment:</h2>
		<p>
			We deeply regret the inconvenience caused by this issue. Our team is actively working to
			address the vulnerability and ensure the security of our platform. While we address this
			matter, we kindly request that you refrain from sharing details about this issue publicly. A
			formal announcement will be made once the situation has been resolved and the platform is
			secure.
		</p>
		<br />
		<p>Thank you for your understanding and cooperation.</p>
		<br />
		<p>Sincerely,</p>
		<p><b class="text-primary">The Mew Finance Team</b></p>

		<br />
		<br />
	</div>
</div>

<style lang="postcss">
	h2 {
		font-weight: bold;
		font-size: 20px;
		margin-bottom: 10px;
		color: var(--main-color);
	}

	:global(html) {
		background-color: #1b2845;
		background-image: linear-gradient(315deg, #1b2845 0%, #274060 74%);
		background-image: linear-gradient(315deg, #1b2845 0%, #274060 74%);
		background-image: radial-gradient(circle, #2a2a2a, #1b2845);
		/* background-image: linear-gradient(315deg, #4B0082 0%, #000000 74%); */

		min-height: 100vh;
	}
	:global(body) {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		color: #d1d1d1;
		/* color: #C0A080; */
	}
	:global(button.btn) {
		background-color: #d1d1d1;
		color: #263962;
		padding: 10px 20px;
		border: none;
		border-radius: 5px;
		cursor: pointer;
		transition: 0.3s;
		font-weight: 500;
	}
	:global(button.btn:hover) {
		background-color: #eeeeee; /* Slightly darker for hover effect */
	}

	:global(button.btn-secondary) {
		background-color: #6c84a2;
		color: #e0dfdf;
		padding: 10px 20px;
		border: none;
		border-radius: 5px;
		cursor: pointer;
		transition: 0.3s;
		font-weight: 500;
	}
	:global(button.btn-secondary:hover) {
		background-color: #a1c0d9; /* Slightly darker for hover effect */
		color: black;
	}
	.main-page {
		background-position: cover;
		background-repeat: no-repeat;
	}
</style>
