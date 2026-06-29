import client from './client';

/**
 * Trigger a campus-wide panic alert.
 * Backend: POST /api/panic
 * Auth: STUDENT and FACULTY only.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {string} message
 */
export async function triggerPanic(lat, lng, message) {
    const response = await client.post('/panic', { lat, lng, message });
    return response.data.data ?? response.data;
}
