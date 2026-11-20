/**
 * EXPO_PUBLIC_API_URL is set at build time, e.g. http://192.168.1.10:3000.
 * Without it the app runs in local mode: no SMS login and no sync; every record stays
 * in the encrypted database on the phone, protected by the PIN. The TZ allows this
 * phone-only version until the server is hosted (TZ §9, first risk).
 */
export const API_URL: string | null = process.env.EXPO_PUBLIC_API_URL || null;

export const LOCAL_MODE = API_URL === null;
