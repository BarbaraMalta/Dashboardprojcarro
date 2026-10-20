/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  normalizeTimestamp,
  parseJsonLogs,
  parseCsvLogs,
} from './logParser';
import {
  deduplicateEvents,
  calculateStopEpisodes,
  buildMissionsFromEvents,
  calculateDashboardMetrics,
} from './metrics';
import { LogEvent } from '../types';

/**
 * Executes automated validation tests for Rover Monitor core business logic
 */
export function runSelfValidationTests(): {
  total: number;
  passed: number;
  failed: number;
  results: Array<{ name: string; pass: boolean; details?: string }>;
} {
  const tests: Array<{ name: string; fn: () => boolean }> = [
    {
      name: 'Timestamp Normalization: ISO and DD/MM/YYYY',
      fn: () => {
        const iso = normalizeTimestamp('2026-10-19T10:00:00Z');
        const br = normalizeTimestamp('19/10/2026 10:00:00');
        const invalid = normalizeTimestamp('invalid_date');
        return iso !== null && br !== null && invalid === null;
      },
    },
    {
      name: 'JSON Parser: handles arrays and missing fields',
      fn: () => {
        const json = JSON.stringify([
          { timestamp: '2026-10-19T10:00:00Z', mission_id: 'MS-1', message: 'Test 1' },
          { timestamp: 'invalid_time', mission_id: 'MS-1', message: 'Invalid' },
        ]);
        const res = parseJsonLogs(json);
        return res.validEvents.length === 1 && res.errors.length === 1;
      },
    },
    {
      name: 'CSV Parser: auto-detects delimiter and header aliases',
      fn: () => {
        const csv = `data_hora;id_missao;comando;msg\n2026-10-19T10:00:00Z;MS-CSV;FWD 10;Avanco inicial\n2026-10-19T10:01:00Z;MS-CSV;STOP;Parada preventiva`;
        const res = parseCsvLogs(csv);
        return res.validEvents.length === 2 && res.validEvents[0].missionId === 'MS-CSV';
      },
    },
    {
      name: 'Deduplication: filters duplicate event IDs and duplicate signatures',
      fn: () => {
        const evts: LogEvent[] = [
          {
            id: 'e1',
            missionId: 'M1',
            timestamp: '2026-10-19T10:00:00Z',
            eventType: 'command',
            severity: 'info',
            message: 'Move',
          },
          {
            id: 'e1',
            missionId: 'M1',
            timestamp: '2026-10-19T10:00:00Z',
            eventType: 'command',
            severity: 'info',
            message: 'Move',
          },
        ];
        const deduped = deduplicateEvents(evts);
        return deduped.length === 1;
      },
    },
    {
      name: 'Stop Episodes: groups consecutive sensor presence into a single stop episode',
      fn: () => {
        const evts: LogEvent[] = [
          {
            id: '1',
            missionId: 'M1',
            timestamp: '2026-10-19T10:00:00Z',
            eventType: 'presence_detected',
            roverState: 'stopped',
            severity: 'warning',
            message: 'Presença detectada 80cm',
          },
          {
            id: '2',
            missionId: 'M1',
            timestamp: '2026-10-19T10:00:05Z',
            eventType: 'presence_detected',
            roverState: 'stopped',
            severity: 'warning',
            message: 'Presença detectada 75cm',
          },
          {
            id: '3',
            missionId: 'M1',
            timestamp: '2026-10-19T10:00:15Z',
            eventType: 'resume',
            roverState: 'moving',
            severity: 'info',
            message: 'Retomando',
          },
        ];
        const { totalEpisodes, presenceEpisodes } = calculateStopEpisodes(evts);
        return totalEpisodes === 1 && presenceEpisodes === 1;
      },
    },
    {
      name: 'Mission Grouping & Duration calculation',
      fn: () => {
        const evts: LogEvent[] = [
          {
            id: '1',
            missionId: 'M-DUR',
            timestamp: '2026-10-19T10:00:00Z',
            eventType: 'mission_start',
            severity: 'info',
            message: 'Início',
          },
          {
            id: '2',
            missionId: 'M-DUR',
            timestamp: '2026-10-19T10:01:30Z',
            eventType: 'destination_reached',
            severity: 'info',
            message: 'Destino alcançado',
          },
        ];
        const missions = buildMissionsFromEvents(evts);
        return (
          missions.length === 1 &&
          missions[0].status === 'completed' &&
          missions[0].durationSeconds === 90
        );
      },
    },
    {
      name: 'KPI Metrics: calculates valid completion rate and durations',
      fn: () => {
        const evts: LogEvent[] = [
          {
            id: '1',
            missionId: 'M1',
            timestamp: '2026-10-19T10:00:00Z',
            eventType: 'mission_start',
            severity: 'info',
            message: 'Início',
          },
          {
            id: '2',
            missionId: 'M1',
            timestamp: '2026-10-19T10:01:00Z',
            eventType: 'destination_reached',
            severity: 'info',
            message: 'Destino alcançado',
          },
        ];
        const missions = buildMissionsFromEvents(evts);
        const metrics = calculateDashboardMetrics(missions, evts);
        return metrics.totalMissions === 1 && metrics.completionRate === 100;
      },
    },
  ];

  const results = tests.map((t) => {
    try {
      const pass = t.fn();
      return { name: t.name, pass };
    } catch (err) {
      return {
        name: t.name,
        pass: false,
        details: err instanceof Error ? err.message : String(err),
      };
    }
  });

  const passed = results.filter((r) => r.pass).length;
  return {
    total: tests.length,
    passed,
    failed: tests.length - passed,
    results,
  };
}
