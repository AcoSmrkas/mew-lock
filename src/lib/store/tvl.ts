import { writable } from 'svelte/store';

/** ERG held by the Mew Lock contracts; set by the navigation's TVL refresh, shown in the footer. */
export const ergLocked = writable<number | null>(null);
