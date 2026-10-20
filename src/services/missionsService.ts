/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GlobalFilterState, Mission } from '../types';
import { buildMissionsFromEvents, filterByTimePeriod } from '../utils/metrics';
import { apiRequest } from './api';
import { getDataSource, getStoredEvents } from './store';

/**
 * Retrieves all missions, supporting either API mode or local/mock mode
 */
export async function getMissions(filters?: GlobalFilterState): Promise<Mission[]> {
  const mode = getDataSource();

  if (mode === 'api') {
    const params = new URLSearchParams();
    if (filters?.period) params.set('period', filters.period);
    if (filters?.origin) params.set('origin', filters.origin);
    if (filters?.destination) params.set('destination', filters.destination);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.search) params.set('search', filters.search);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest<Mission[]>(`missions${query}`);
    return res.data;
  }

  // Local / Mock / Imported mode
  const rawEvents = getStoredEvents();
  let missions = buildMissionsFromEvents(rawEvents);

  if (filters) {
    if (filters.period) {
      missions = filterByTimePeriod(missions, filters.period, filters.startDate, filters.endDate);
    }
    if (filters.origin) {
      missions = missions.filter((m) => m.origin.toLowerCase().includes(filters.origin!.toLowerCase()));
    }
    if (filters.destination) {
      missions = missions.filter((m) => m.destination.toLowerCase().includes(filters.destination!.toLowerCase()));
    }
    if (filters.status && filters.status !== 'all') {
      missions = missions.filter((m) => m.status === filters.status);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      missions = missions.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          m.origin.toLowerCase().includes(q) ||
          m.destination.toLowerCase().includes(q)
      );
    }
  }

  return missions;
}

/**
 * Retrieves a single mission by its ID
 */
export async function getMissionById(id: string): Promise<Mission | null> {
  const mode = getDataSource();

  if (mode === 'api') {
    const res = await apiRequest<Mission>(`missions/${encodeURIComponent(id)}`);
    return res.data;
  }

  const allMissions = await getMissions();
  return allMissions.find((m) => m.id === id) || null;
}
