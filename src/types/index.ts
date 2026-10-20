/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type EventSeverity = 'info' | 'warning' | 'error' | 'critical';

export type EventType =
  | 'mission_start'
  | 'command'
  | 'state_change'
  | 'presence_detected'
  | 'stop_preventive'
  | 'resume'
  | 'destination_reached'
  | 'mission_end'
  | 'error'
  | 'warning'
  | 'unknown';

export type RoverState =
  | 'idle'
  | 'moving'
  | 'stopped'
  | 'obstacle_hold'
  | 'navigating'
  | 'completed'
  | 'error'
  | 'unknown';

export type MissionStatus =
  | 'completed'
  | 'in_progress'
  | 'aborted'
  | 'failed'
  | 'indeterminate';

export interface LogEvent {
  id: string;
  missionId: string;
  timestamp: string; // ISO 8601 string
  eventType: EventType;
  command?: string;
  roverState?: RoverState;
  severity: EventSeverity;
  message: string;
  payload?: Record<string, unknown>;
  raw?: string;
}

export interface StopReasonCount {
  reason: string;
  count: number;
}

export interface Mission {
  id: string;
  origin: string;
  destination: string;
  status: MissionStatus;
  startedAt: string;
  endedAt?: string;
  durationSeconds: number | null;
  stopCount: number;
  presenceStopCount: number;
  errorCount: number;
  eventCount: number;
  stopReasons: StopReasonCount[];
  events: LogEvent[];
}

export interface Alert {
  id: string;
  title: string;
  description: string;
  severity: EventSeverity;
  timestamp: string;
  missionId?: string;
  occurrenceCount: number;
  acknowledged: boolean;
  acknowledgedAt?: string;
  relatedEventIds: string[];
}

export interface DashboardMetrics {
  totalMissions: number;
  completedMissions: number;
  inProgressMissions: number;
  failedMissions: number;
  abortedMissions: number;
  indeterminateMissions: number;
  avgDurationSeconds: number | null;
  medianDurationSeconds: number | null;
  minDurationSeconds: number | null;
  maxDurationSeconds: number | null;
  totalStops: number;
  presenceStops: number;
  otherStops: number;
  unknownStops: number;
  completionRate: number; // 0 to 100
  activeAlertsCount: number;
  totalErrors: number;
  previousPeriodComparison?: {
    totalMissionsDiffPercent: number | null;
    completionRateDiff: number | null;
    avgDurationDiffPercent: number | null;
    stopsDiffPercent: number | null;
  };
}

export type TimePeriod = '24h' | '7d' | '30d' | 'all' | 'custom';

export interface GlobalFilterState {
  period: TimePeriod;
  startDate?: string;
  endDate?: string;
  origin?: string;
  destination?: string;
  status?: string;
  search?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  total: number;
}

export type DataSourceType = 'mock' | 'imported' | 'api';

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}
