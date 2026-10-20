/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { INITIAL_MOCK_EVENTS } from '../data/mockData';
import { DataSourceType, LogEvent } from '../types';
import { DATA_SOURCE_MODE } from './api';

// In-memory runtime state for data provider
let currentDataSource: DataSourceType = (DATA_SOURCE_MODE === 'api' ? 'api' : 'mock') as DataSourceType;
let localEvents: LogEvent[] = [...INITIAL_MOCK_EVENTS];
let importedEventsCache: LogEvent[] = [];
let acknowledgedAlertIds: Set<string> = new Set();
const listeners: Array<() => void> = [];

export function getDataSource(): DataSourceType {
  return currentDataSource;
}

export function setDataSource(source: DataSourceType): void {
  currentDataSource = source;
  notifySubscribers();
}

export function getStoredEvents(): LogEvent[] {
  if (currentDataSource === 'imported') {
    return importedEventsCache;
  }
  return localEvents;
}

export function setImportedEvents(events: LogEvent[]): void {
  importedEventsCache = events;
  currentDataSource = 'imported';
  notifySubscribers();
}

export function resetToMockEvents(): void {
  localEvents = [...INITIAL_MOCK_EVENTS];
  importedEventsCache = [];
  currentDataSource = 'mock';
  acknowledgedAlertIds.clear();
  notifySubscribers();
}

export function isAlertAcknowledged(alertId: string): boolean {
  return acknowledgedAlertIds.has(alertId);
}

export function markAlertAcknowledged(alertId: string): void {
  acknowledgedAlertIds.add(alertId);
  notifySubscribers();
}

export function subscribeToStore(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function notifySubscribers() {
  for (const listener of listeners) {
    listener();
  }
}
