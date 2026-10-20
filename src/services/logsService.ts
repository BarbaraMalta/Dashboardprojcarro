/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GlobalFilterState, LogEvent } from '../types';
import { deduplicateEvents, filterByTimePeriod } from '../utils/metrics';
import { apiRequest } from './api';
import { getDataSource, getStoredEvents, setImportedEvents } from './store';

export interface LogFilterParams extends GlobalFilterState {
  missionId?: string;
  eventType?: string;
  severity?: string;
}

/**
 * Retrieves logs with filtering, supporting API mode or local/mock mode
 */
export async function getLogs(filters?: LogFilterParams): Promise<LogEvent[]> {
  const mode = getDataSource();

  if (mode === 'api') {
    const params = new URLSearchParams();
    if (filters?.period) params.set('period', filters.period);
    if (filters?.missionId) params.set('missionId', filters.missionId);
    if (filters?.eventType) params.set('eventType', filters.eventType);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.search) params.set('search', filters.search);

    const query = params.toString() ? `?${params.toString()}` : '';
    const res = await apiRequest<LogEvent[]>(`logs${query}`);
    return res.data;
  }

  // Local / Mock / Imported mode
  let events = deduplicateEvents(getStoredEvents());

  if (filters) {
    if (filters.period) {
      events = filterByTimePeriod(events, filters.period, filters.startDate, filters.endDate);
    }
    if (filters.missionId && filters.missionId !== 'all') {
      events = events.filter((e) => e.missionId === filters.missionId);
    }
    if (filters.eventType && filters.eventType !== 'all') {
      events = events.filter((e) => e.eventType === filters.eventType);
    }
    if (filters.severity && filters.severity !== 'all') {
      events = events.filter((e) => e.severity === filters.severity);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      events = events.filter(
        (e) =>
          e.message.toLowerCase().includes(q) ||
          (e.command && e.command.toLowerCase().includes(q)) ||
          e.missionId.toLowerCase().includes(q) ||
          e.id.toLowerCase().includes(q)
      );
    }
  }

  // Newest events first
  return events.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Imports new events into the system
 */
export async function importLogs(events: LogEvent[]): Promise<{ importedCount: number }> {
  const mode = getDataSource();

  if (mode === 'api') {
    const res = await apiRequest<{ importedCount: number }>('logs/import', {
      method: 'POST',
      body: JSON.stringify({ events }),
    });
    return res.data;
  }

  setImportedEvents(events);
  return { importedCount: events.length };
}
