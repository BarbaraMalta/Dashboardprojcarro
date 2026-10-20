/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DashboardMetrics, GlobalFilterState } from '../types';
import { calculateDashboardMetrics, filterByTimePeriod } from '../utils/metrics';
import { apiRequest } from './api';
import { getMissions } from './missionsService';
import { getDataSource, getStoredEvents } from './store';

/**
 * Retrieves dashboard KPI metrics
 */
export async function getDashboardMetrics(
  filters?: GlobalFilterState
): Promise<DashboardMetrics> {
  const mode = getDataSource();

  if (mode === 'api') {
    const params = new URLSearchParams();
    if (filters?.period) params.set('period', filters.period);
    if (filters?.origin) params.set('origin', filters.origin);
    if (filters?.destination) params.set('destination', filters.destination);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest<DashboardMetrics>(`dashboard/metrics${query}`);
    return res.data;
  }

  // Local / Mock computation
  const missions = await getMissions(filters);
  let events = getStoredEvents();

  if (filters?.period) {
    events = filterByTimePeriod(events, filters.period, filters.startDate, filters.endDate);
  }

  return calculateDashboardMetrics(missions, events);
}
