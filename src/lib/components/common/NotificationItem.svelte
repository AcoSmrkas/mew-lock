<script lang="ts">
	import { nFormatter } from '$lib/utils/utils.js';

	// Props
	export let notification;
	export let onMarkAsRead = () => {};
	export let onNavigate = () => {};

	// Helper function to get asset image
	function getFirstAssetImage(assets) {
		if (!assets || assets.length === 0) return '';

		const asset = assets[0];
		if (asset.r9) {
			return `https://api.mewfinance.com/ipfs/gateway?hash=${asset.r9}`;
		}
		return '';
	}

	// Helper function to summarize assets
	function summarizeAssets(assets) {
		if (!assets || assets.length === 0) return 'Unknown asset';

		if (assets.length === 1) {
			return assets[0].name || 'Unnamed asset';
		} else {
			return `${assets[0].name} + ${assets.length - 1} more`;
		}
	}

	// Handle click event
	function handleClick() {
		onMarkAsRead(notification.txidin);
		onNavigate(notification.txidin);
	}
</script>

<div
	class="notification-item {notification.read ? '' : 'unread'}"
	on:click|stopPropagation={handleClick}
>
	{#if notification.assets && notification.assets.length > 0 && getFirstAssetImage(notification.assets)}
		<div class="notification-asset-image">
			<img src={getFirstAssetImage(notification.assets)} alt="Asset" />
		</div>
	{:else}
		<div class="notification-icon {notification.notificationType}">
			{#if notification.notificationType === 'buy'}
				<i class="fa-solid fa-arrow-down" />
			{:else if notification.notificationType === 'sell'}
				<i class="fa-solid fa-arrow-up" />
			{:else if notification.notificationType === 'list'}
				<i class="fa-solid fa-tag" />
			{:else if notification.notificationType === 'cancel'}
				<i class="fa-solid fa-ban" />
			{:else}
				<i class="fa-solid fa-circle-question" />
			{/if}
		</div>
	{/if}

	<div class="notification-content">
		<div class="notification-title">
			{#if notification.notificationType === 'buy'}
				<span class="transaction-type buy">Bought</span>
			{:else if notification.notificationType === 'sell'}
				<span class="transaction-type sell">Sold</span>
			{:else if notification.notificationType === 'list'}
				<span class="transaction-type list">Listed</span>
			{:else if notification.notificationType === 'cancel'}
				<span class="transaction-type cancel">Canceled</span>
			{:else}
				<span class="transaction-type">Unknown</span>
			{/if}

			{#if notification.assets && notification.assets.length > 0}
				<span class="asset-name">{notification.assets[0].name || 'Unknown asset'}</span>
				{#if notification.assets.length > 1}
					<span class="asset-count">+{notification.assets.length - 1} more</span>
				{/if}
			{:else}
				<span>Unknown asset</span>
			{/if}
		</div>

		<div class="transaction-details">
			{#if notification.assets && notification.assets.length > 0}
				<div class="asset-amount">
					<span>Amount: </span>
					<span
						>{nFormatter(notification.assets[0].amount, notification.assets[0].decimals || 0)}</span
					>
				</div>
			{/if}

			<div class="notification-price">
				<span>Price: </span>
				<span
					>{nFormatter(notification.payamount, notification.payassetDecimals || 0)}
					{notification.payassetName || 'ERG'}</span
				>
			</div>
		</div>
	</div>

	{#if !notification.read}
		<div class="new-indicator" />
	{/if}
</div>

<style>
	.notification-item {
		display: flex;
		align-items: flex-start;
		padding: 10px;
		border-radius: 8px;
		margin-bottom: 8px;
		background: rgba(0, 0, 0, 0.2);
		cursor: pointer;
		transition: background 0.2s ease;
		position: relative;
	}

	.notification-item:hover {
		background: rgba(0, 0, 0, 0.3);
	}

	.notification-item.unread {
		background: rgba(155, 102, 255, 0.1);
	}

	.notification-item.unread:hover {
		background: rgba(155, 102, 255, 0.15);
	}

	.notification-asset-image {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		overflow: hidden;
		margin-right: 10px;
		background: rgba(0, 0, 0, 0.3);
		flex-shrink: 0;
	}

	.notification-asset-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.notification-icon {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-right: 10px;
		font-size: 14px;
		flex-shrink: 0;
	}

	.notification-icon.buy {
		background: rgba(0, 184, 148, 0.2);
		color: #00b894;
	}

	.notification-icon.sell {
		background: rgba(255, 107, 107, 0.2);
		color: #ff6b6b;
	}

	.notification-icon.list {
		background: rgba(74, 138, 255, 0.2);
		color: #4a8aff;
	}

	.notification-icon.cancel {
		background: rgba(149, 165, 166, 0.2);
		color: #95a5a6;
	}

	.notification-content {
		flex: 1;
		min-width: 0; /* Ensures text truncation works */
	}

	.notification-title {
		font-size: 13px;
		color: white;
		font-weight: 500;
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
		margin-bottom: 4px;
	}

	.transaction-type {
		padding: 2px 5px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 600;
	}

	.transaction-type.buy {
		background: rgba(0, 184, 148, 0.2);
		color: #00b894;
	}

	.transaction-type.sell {
		background: rgba(255, 107, 107, 0.2);
		color: #ff6b6b;
	}

	.transaction-type.list {
		background: rgba(74, 138, 255, 0.2);
		color: #4a8aff;
	}

	.transaction-type.cancel {
		background: rgba(149, 165, 166, 0.2);
		color: #95a5a6;
	}

	.asset-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 120px;
	}

	.asset-count {
		font-size: 11px;
		color: rgba(255, 255, 255, 0.6);
	}

	.transaction-details {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.8);
		margin-bottom: 2px;
	}

	.asset-amount,
	.notification-price {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
	}

	.notification-price {
		color: rgba(155, 102, 255, 0.9);
		font-weight: 500;
	}

	.new-indicator {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 6px;
		height: 6px;
		background-color: #ff6b6b;
		border-radius: 50%;
	}
</style>
