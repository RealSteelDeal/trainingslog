import PocketBase from 'pocketbase';

// Gleiche Origin wie das Frontend; im Dev-Modus leitet Vite /api weiter.
export const pb = new PocketBase('/');
pb.autoCancellation(false);
