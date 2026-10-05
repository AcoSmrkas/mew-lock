import { writable } from 'svelte/store';

/** Whether the create-lock form is open. The navigation renders it; any page can open it. */
export const lockModalOpen = writable(false);

/** Bumped when a lock is sent, so pages listing locks can refresh. */
export const locksChanged = writable(0);
