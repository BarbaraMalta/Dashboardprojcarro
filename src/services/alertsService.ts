/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Alert } from '../types';
import { extractAlertsFromEvents } from '../utils/metrics';
import { apiRequest } from './api';
import {
  getDataSource,
  getStoredEvents,
  isAlertAcknowledged,
  markAlertAcknowledged,
} from './store';

export interface AlertFilterParams {
  severity?: string;
  status?: 'all' | 'unacknowledged' | 'acknowledged';
  missionId?: string;
  search?: string;
}

/**
 * Retrieves alerts from active data source
 */
export async function getAlerts(filters?: AlertFilterParams): Promise<Alert[]> {
  const mode = getDataSource();

  if (mode === 'api') {
    const params = new URLSearchParams();
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.missionId) params.set('missionId', filters.missionId);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest<Alert[]>(`alerts${query}`);
    return res.data;
  }

  // Local / Mock mode
  const events = getStoredEvents();
  let alerts = extractAlertsFromEvents(events);

  // Apply acknowledgement state from store
  alerts = alerts.map((alt) => ({
    ...alt,
    acknowledged: isAlertAcknowledged(alt.id),
  }));

  if (filters) {
    if (filters.severity && filters.severity !== 'all') {
      alerts = alerts.filter((a) => a.severity === filters.severity);
    }
    if (filters.status === 'unacknowledged') {
      alerts = alerts.filter((a) => !a.acknowledged);
    } else if (filters.status === 'acknowledged') {
      alerts = alerts.filter((a) => a.acknowledged);
    }
    if (filters.missionId && filters.missionId !== 'all') {
      alerts = alerts.filter((a) => a.missionId === filters.missionId);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      alerts = alerts.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          (a.missionId && a.missionId.toLowerCase().includes(q))
      );
    }
  }

  return alerts;
}

/**
 * Acknowledges an alert
 */
export async function acknowledgeAlert(alertId: string): Promise<boolean> {
  const mode = getDataSource();

  if (mode === 'api') {
    const res = await apiRequest<{ acknowledged: boolean }>(
      `alerts/${encodeURIComponent(alertId)}/acknowledge`,
      {
        method: 'PATCH',
      }
    );
    return res.data.acknowledged;
  }

  markAlertAcknowledged(alertId);
  return true;
}
