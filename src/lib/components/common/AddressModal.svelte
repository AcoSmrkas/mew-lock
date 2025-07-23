<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	const allCountries = [
		{ code: 'AF', name: 'Afghanistan' },
		{ code: 'AL', name: 'Albania' },
		{ code: 'DZ', name: 'Algeria' },
		{ code: 'AD', name: 'Andorra' },
		{ code: 'AO', name: 'Angola' },
		{ code: 'AG', name: 'Antigua and Barbuda' },
		{ code: 'AR', name: 'Argentina' },
		{ code: 'AM', name: 'Armenia' },
		{ code: 'AU', name: 'Australia' },
		{ code: 'AT', name: 'Austria' },
		{ code: 'AZ', name: 'Azerbaijan' },
		{ code: 'BS', name: 'Bahamas' },
		{ code: 'BH', name: 'Bahrain' },
		{ code: 'BD', name: 'Bangladesh' },
		{ code: 'BB', name: 'Barbados' },
		{ code: 'BY', name: 'Belarus' },
		{ code: 'BE', name: 'Belgium' },
		{ code: 'BZ', name: 'Belize' },
		{ code: 'BJ', name: 'Benin' },
		{ code: 'BT', name: 'Bhutan' },
		{ code: 'BO', name: 'Bolivia' },
		{ code: 'BA', name: 'Bosnia and Herzegovina' },
		{ code: 'BW', name: 'Botswana' },
		{ code: 'BR', name: 'Brazil' },
		{ code: 'BN', name: 'Brunei' },
		{ code: 'BG', name: 'Bulgaria' },
		{ code: 'BF', name: 'Burkina Faso' },
		{ code: 'BI', name: 'Burundi' },
		{ code: 'CV', name: 'Cabo Verde' },
		{ code: 'KH', name: 'Cambodia' },
		{ code: 'CM', name: 'Cameroon' },
		{ code: 'CA', name: 'Canada' },
		{ code: 'CF', name: 'Central African Republic' },
		{ code: 'TD', name: 'Chad' },
		{ code: 'CL', name: 'Chile' },
		{ code: 'CN', name: 'China' },
		{ code: 'CO', name: 'Colombia' },
		{ code: 'KM', name: 'Comoros' },
		{ code: 'CG', name: 'Congo' },
		{ code: 'CD', name: 'Congo (Democratic Republic)' },
		{ code: 'CR', name: 'Costa Rica' },
		{ code: 'CI', name: "Côte d'Ivoire" },
		{ code: 'HR', name: 'Croatia' },
		{ code: 'CU', name: 'Cuba' },
		{ code: 'CY', name: 'Cyprus' },
		{ code: 'CZ', name: 'Czech Republic' },
		{ code: 'DK', name: 'Denmark' },
		{ code: 'DJ', name: 'Djibouti' },
		{ code: 'DM', name: 'Dominica' },
		{ code: 'DO', name: 'Dominican Republic' },
		{ code: 'EC', name: 'Ecuador' },
		{ code: 'EG', name: 'Egypt' },
		{ code: 'SV', name: 'El Salvador' },
		{ code: 'GQ', name: 'Equatorial Guinea' },
		{ code: 'ER', name: 'Eritrea' },
		{ code: 'EE', name: 'Estonia' },
		{ code: 'SZ', name: 'Eswatini' },
		{ code: 'ET', name: 'Ethiopia' },
		{ code: 'FJ', name: 'Fiji' },
		{ code: 'FI', name: 'Finland' },
		{ code: 'FR', name: 'France' },
		{ code: 'GA', name: 'Gabon' },
		{ code: 'GM', name: 'Gambia' },
		{ code: 'GE', name: 'Georgia' },
		{ code: 'DE', name: 'Germany' },
		{ code: 'GH', name: 'Ghana' },
		{ code: 'GR', name: 'Greece' },
		{ code: 'GD', name: 'Grenada' },
		{ code: 'GT', name: 'Guatemala' },
		{ code: 'GN', name: 'Guinea' },
		{ code: 'GW', name: 'Guinea-Bissau' },
		{ code: 'GY', name: 'Guyana' },
		{ code: 'HT', name: 'Haiti' },
		{ code: 'HN', name: 'Honduras' },
		{ code: 'HU', name: 'Hungary' },
		{ code: 'IS', name: 'Iceland' },
		{ code: 'IN', name: 'India' },
		{ code: 'ID', name: 'Indonesia' },
		{ code: 'IR', name: 'Iran' },
		{ code: 'IQ', name: 'Iraq' },
		{ code: 'IE', name: 'Ireland' },
		{ code: 'IL', name: 'Israel' },
		{ code: 'IT', name: 'Italy' },
		{ code: 'JM', name: 'Jamaica' },
		{ code: 'JP', name: 'Japan' },
		{ code: 'JO', name: 'Jordan' },
		{ code: 'KZ', name: 'Kazakhstan' },
		{ code: 'KE', name: 'Kenya' },
		{ code: 'KI', name: 'Kiribati' },
		{ code: 'KP', name: 'Korea (North)' },
		{ code: 'KR', name: 'Korea (South)' },
		{ code: 'KW', name: 'Kuwait' },
		{ code: 'KG', name: 'Kyrgyzstan' },
		{ code: 'LA', name: 'Laos' },
		{ code: 'LV', name: 'Latvia' },
		{ code: 'LB', name: 'Lebanon' },
		{ code: 'LS', name: 'Lesotho' },
		{ code: 'LR', name: 'Liberia' },
		{ code: 'LY', name: 'Libya' },
		{ code: 'LI', name: 'Liechtenstein' },
		{ code: 'LT', name: 'Lithuania' },
		{ code: 'LU', name: 'Luxembourg' },
		{ code: 'MG', name: 'Madagascar' },
		{ code: 'MW', name: 'Malawi' },
		{ code: 'MY', name: 'Malaysia' },
		{ code: 'MV', name: 'Maldives' },
		{ code: 'ML', name: 'Mali' },
		{ code: 'MT', name: 'Malta' },
		{ code: 'MH', name: 'Marshall Islands' },
		{ code: 'MR', name: 'Mauritania' },
		{ code: 'MU', name: 'Mauritius' },
		{ code: 'MX', name: 'Mexico' },
		{ code: 'FM', name: 'Micronesia' },
		{ code: 'MD', name: 'Moldova' },
		{ code: 'MC', name: 'Monaco' },
		{ code: 'MN', name: 'Mongolia' },
		{ code: 'ME', name: 'Montenegro' },
		{ code: 'MA', name: 'Morocco' },
		{ code: 'MZ', name: 'Mozambique' },
		{ code: 'MM', name: 'Myanmar' },
		{ code: 'NA', name: 'Namibia' },
		{ code: 'NR', name: 'Nauru' },
		{ code: 'NP', name: 'Nepal' },
		{ code: 'NL', name: 'Netherlands' },
		{ code: 'NZ', name: 'New Zealand' },
		{ code: 'NI', name: 'Nicaragua' },
		{ code: 'NE', name: 'Niger' },
		{ code: 'NG', name: 'Nigeria' },
		{ code: 'MK', name: 'North Macedonia' },
		{ code: 'NO', name: 'Norway' },
		{ code: 'OM', name: 'Oman' },
		{ code: 'PK', name: 'Pakistan' },
		{ code: 'PW', name: 'Palau' },
		{ code: 'PA', name: 'Panama' },
		{ code: 'PG', name: 'Papua New Guinea' },
		{ code: 'PY', name: 'Paraguay' },
		{ code: 'PE', name: 'Peru' },
		{ code: 'PH', name: 'Philippines' },
		{ code: 'PL', name: 'Poland' },
		{ code: 'PT', name: 'Portugal' },
		{ code: 'QA', name: 'Qatar' },
		{ code: 'RO', name: 'Romania' },
		{ code: 'RU', name: 'Russia' },
		{ code: 'RW', name: 'Rwanda' },
		{ code: 'KN', name: 'Saint Kitts and Nevis' },
		{ code: 'LC', name: 'Saint Lucia' },
		{ code: 'VC', name: 'Saint Vincent and the Grenadines' },
		{ code: 'WS', name: 'Samoa' },
		{ code: 'SM', name: 'San Marino' },
		{ code: 'ST', name: 'Sao Tome and Principe' },
		{ code: 'SA', name: 'Saudi Arabia' },
		{ code: 'SN', name: 'Senegal' },
		{ code: 'RS', name: 'Serbia' },
		{ code: 'SC', name: 'Seychelles' },
		{ code: 'SL', name: 'Sierra Leone' },
		{ code: 'SG', name: 'Singapore' },
		{ code: 'SK', name: 'Slovakia' },
		{ code: 'SI', name: 'Slovenia' },
		{ code: 'SB', name: 'Solomon Islands' },
		{ code: 'SO', name: 'Somalia' },
		{ code: 'ZA', name: 'South Africa' },
		{ code: 'SS', name: 'South Sudan' },
		{ code: 'ES', name: 'Spain' },
		{ code: 'LK', name: 'Sri Lanka' },
		{ code: 'SD', name: 'Sudan' },
		{ code: 'SR', name: 'Suriname' },
		{ code: 'SE', name: 'Sweden' },
		{ code: 'CH', name: 'Switzerland' },
		{ code: 'SY', name: 'Syria' },
		{ code: 'TJ', name: 'Tajikistan' },
		{ code: 'TZ', name: 'Tanzania' },
		{ code: 'TH', name: 'Thailand' },
		{ code: 'TL', name: 'Timor-Leste' },
		{ code: 'TG', name: 'Togo' },
		{ code: 'TO', name: 'Tonga' },
		{ code: 'TT', name: 'Trinidad and Tobago' },
		{ code: 'TN', name: 'Tunisia' },
		{ code: 'TR', name: 'Turkey' },
		{ code: 'TM', name: 'Turkmenistan' },
		{ code: 'TV', name: 'Tuvalu' },
		{ code: 'UG', name: 'Uganda' },
		{ code: 'UA', name: 'Ukraine' },
		{ code: 'AE', name: 'United Arab Emirates' },
		{ code: 'GB', name: 'United Kingdom' },
		{ code: 'US', name: 'United States' },
		{ code: 'UY', name: 'Uruguay' },
		{ code: 'UZ', name: 'Uzbekistan' },
		{ code: 'VU', name: 'Vanuatu' },
		{ code: 'VA', name: 'Vatican City' },
		{ code: 'VE', name: 'Venezuela' },
		{ code: 'VN', name: 'Vietnam' },
		{ code: 'YE', name: 'Yemen' },
		{ code: 'ZM', name: 'Zambia' },
		{ code: 'ZW', name: 'Zimbabwe' }
	];

	let searchTerm = '';
	let isOpen = false;
	let inputElement;

	$: filteredCountries = searchTerm
		? allCountries.filter((country) =>
				country.name.toLowerCase().includes(searchTerm.toLowerCase())
		  )
		: allCountries;

	function handleSelect(country) {
		shippingInfo.country = country.name;
		searchTerm = country.name;
		isOpen = false;
		dispatch('countrySelected', country.code);
	}

	function handleInput() {
		isOpen = true;
		shippingInfo.country = null;
	}

	function handleFocus() {
		isOpen = true;
	}

	function handleBlur() {
		setTimeout(() => {
			isOpen = false;
			if (!shippingInfo.country) {
				searchTerm = '';
			}
		}, 100);
	}

	function handleKeydown(event) {
		if (event.key === 'Escape') {
			isOpen = false;
			inputElement.blur();
		}
	}

	export let shippingInfo: any;
	export let showAddressModal: boolean;

	export let onBtnClick: Function | undefined;
	let update = true;

	let dialog: HTMLDialogElement;

	$: if (dialog && showAddressModal) {
		dialog.showModal();

		if (update) {
			update = false;

			if (shippingInfo.country != '') {
				handleSelect({ name: shippingInfo.country });
			}
		}
	}

	function onClose() {
		showAddressModal = false;
		update = true;
	}
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-noninteractive-element-interactions -->
<dialog
	class="modal-box bg-transparent border-2 border-info rounded-lg"
	bind:this={dialog}
	on:close={onClose}
>
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="w-100 h-100 rounded-lg p-2 py-4 p-sm-4"
		style="background: var(--forms-bg)"
		on:click|stopPropagation
	>
		<div
			class="leading-6 pb-2 mb-3 text-white text-center font-bold w-100"
			style="font-family:'Manrope';font-size:1.5em;"
		>
			Shipping Address
		</div>

		<form class="flex flex-col gap-4">
			<div>
				<label for="fullName" class="block text-sm font-medium text-white-700">Full Name</label>
				<input
					type="text"
					id="fullName"
					bind:value={shippingInfo.fullname}
					required
					class="form-control"
				/>
			</div>
			<div>
				<label for="contactNumber" class="block text-sm font-medium text-white-700"
					>Contact Number</label
				>
				<input
					type="tel"
					id="contactNumber"
					bind:value={shippingInfo.phone}
					required
					class="form-control"
				/>
			</div>
			<div>
				<label for="streetAddress" class="block text-sm font-medium text-white-700"
					>Street Address</label
				>
				<input
					type="text"
					id="streetAddress"
					bind:value={shippingInfo.address}
					required
					class="form-control"
				/>
			</div>
			<div>
				<label for="city" class="block text-sm font-medium text-white-700">City</label>
				<input type="text" id="city" bind:value={shippingInfo.city} required class="form-control" />
			</div>
			<div>
				<label for="stateProvince" class="block text-sm font-medium text-white-700"
					>State/Province/Region</label
				>
				<input
					type="text"
					id="stateProvince"
					bind:value={shippingInfo.state}
					required
					class="form-control"
				/>
			</div>
			<div>
				<label for="postalCode" class="block text-sm font-medium text-white-700"
					>Postal Code/ZIP Code</label
				>
				<input
					type="text"
					id="postalCode"
					bind:value={shippingInfo.zip}
					required
					class="form-control"
				/>
			</div>
			<div>
				<label for="country" class="block text-sm font-medium text-white-700">Country</label>

				<div class="rounded-lg" style="background: var(--footer)" on:keydown={handleKeydown}>
					<input
						class="form-control"
						bind:this={inputElement}
						bind:value={searchTerm}
						on:input={handleInput}
						on:focus={handleFocus}
						on:blur={handleBlur}
						placeholder="Select a country"
					/>
					{#if isOpen}
						<ul class="options p-2 max-h-[200px] overflow-y-scroll">
							{#each filteredCountries as country}
								<li on:mousedown={() => handleSelect(country)}>
									{country.name}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</form>

		<!-- svelte-ignore a11y-autofocus -->
		<div class="flex justify-center mt-8 space-x-3">
			<button
				class="btn btn-primary w-[100px]"
				on:click={() => {
					dialog.close();
					onBtnClick ? onBtnClick() : '';
				}}
			>
				Confirm
			</button>
		</div>
	</div>
</dialog>

<style type="text/css">
	.modal-box {
		max-height: 90%;
		background: var(--forms-bg);
		border: 2px solid var(--info-color);
		border-radius: 10px;
		max-width: auto;
		width: 50%;
		min-width: 400px;
		display: flex;
	}

	.options li:hover {
		background: var(--forms-bg);
		color: var(--main-color);
		cursor: pointer;
	}

	@media (max-width: 568px) {
		.modal-box {
			flex-direction: column;
			width: 95%;
			min-width: auto;
		}
	}
</style>
