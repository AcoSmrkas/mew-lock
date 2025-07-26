<script>
	import { LOGO_TEXT } from '$lib/common/const.ts';
</script>

<div style="max-width: 900px;">
	<div class="pl-1 uppercase text-primary font-bold text-xl">
		Know Your Assumptions And Terms of Use
	</div>
	<div class="w-full mt-6 mb-4">
		{@html LOGO_TEXT} is a UI for interacting with contracts on the Ergo Blockchain.<br /><br />

		<span class="text-primary font-bold">Notice that:</span>
		<ul>
			<li>- We don't log, profile, or sell your data.</li>
			<li>
				- In case of Phygital NFTs, your personal information is securely shared with our 3rd party
				shipping partners to ensure delivery.
			</li>
			<li>
				- {@html LOGO_TEXT} operates on a live blockchain, thus transactions are final, and irreversible
				once they have status «confirmed».
			</li>
			<li>
				- Every transaction can be viewed via <a
					class="text-primary"
					target="_new"
					href="https://ergexplorer.com/">Erg Explorer</a
				>.
			</li>
		</ul>
		<br />

		<span class="text-primary font-bold">By accepting these terms, you agree that:</span><br />
		You will use the product at your own peril and risk.<br />
		Only YOU are responsible for your assets.<br />
		Only YOU are responsible for securely storing your recovery phrase.<br />
		By using this service, you agree to our
		<a class="text-primary" href="privacy-policy">Privacy Policy</a>
	</div>
</div>
