/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			width: {
				'fit-content': 'fit-content'
			},
			lineHeight: {
				11: '50px',
				12: '70px'
			}
		}
	},
	plugins: []
};
