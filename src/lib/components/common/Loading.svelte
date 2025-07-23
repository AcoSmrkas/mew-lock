<div id="txLoading">
	<div id="txLoadingInner">
		<img id="loadingImg" src="/logo.png" alt="Loading" class="loadingImg index-card-symbol" />
	</div>
</div>

<style type="text/css">
	.loadingImg {
		width: 125px;
		height: auto;
		animation: pulse 1s infinite ease-in-out;
	}

	#txLoading {
		position: relative;
		top: 0;
		left: 0;
		width: 100%;
	}

	#txLoadingInner {
		position: absolute;
		display: flex;
		justify-content: center;
		align-items: center;
		top: 0;
		left: 0;
		width: 100%;
	}

	@keyframes pulse {
		0%,
		100% {
			scale: 1; /* Starting and ending position */
		}
		50% {
			scale: 1.1; /* Jump up and rotate at the peak */
		}
	}
</style>
