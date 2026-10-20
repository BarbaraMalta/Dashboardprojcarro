/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Alert,
  DashboardMetrics,
  LogEvent,
  Mission,
  MissionStatus,
  StopReasonCount,
  TimePeriod,
} from '../types';

/**
 * Deduplicates events based on unique ID or conservative composite signature
 */
export function deduplicateEvents(events: LogEvent[]): LogEvent[] {
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();
  const result: LogEvent[] = [];

  for (const event of events) {
    if (event.id && !event.id.startsWith('evt-')) {
      if (seenIds.has(event.id)) continue;
      seenIds.add(event.id);
      result.push(event);
      continue;
    }

    // Composite signature fallback
    const signature = `${event.timestamp}_${event.missionId}_${event.eventType}_${event.command || ''}_${event.message}`;
    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);
    result.push(event);
  }

  // Ensure chronological order
  return result.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * Groups events that represent a continuous stop into discrete stop episodes.
 * Avoids inflating stop count when multiple sensor messages are emitted during the same pause.
 */
export function calculateStopEpisodes(events: LogEvent[]): {
  totalEpisodes: number;
  presenceEpisodes: number;
  otherEpisodes: number;
  unknownEpisodes: number;
  reasons: StopReasonCount[];
} {
  const sorted = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  let isCurrentlyStopped = false;
  let currentReason = 'Desconhecido';
  let totalEpisodes = 0;
  let presenceEpisodes = 0;
  let otherEpisodes = 0;
  let unknownEpisodes = 0;
  const reasonMap = new Map<string, number>();

  for (const event of sorted) {
    const isStopEvent =
      event.eventType === 'stop_preventive' ||
      event.eventType === 'presence_detected' ||
      event.roverState === 'stopped' ||
      event.roverState === 'obstacle_hold' ||
      event.command === 'STOP' ||
      event.message.toLowerCase().includes('parada') ||
      event.message.toLowerCase().includes('presença detectada');

    const isResumeEvent =
      event.eventType === 'resume' ||
      event.eventType === 'mission_start' ||
      event.eventType === 'destination_reached' ||
      event.roverState === 'moving' ||
      event.roverState === 'navigating' ||
      (event.command && event.command.startsWith('FWD'));

    if (isStopEvent) {
      if (!isCurrentlyStopped) {
        // New stop episode begins
        isCurrentlyStopped = true;
        totalEpisodes++;

        if (
          event.eventType === 'presence_detected' ||
          event.message.toLowerCase().includes('presença') ||
          event.message.toLowerCase().includes('obstáculo')
        ) {
          currentReason = 'Presença detectada';
          presenceEpisodes++;
        } else if (
          event.message.toLowerCase().includes('cruzamento') ||
          event.command === 'WAIT' ||
          event.message.toLowerCase().includes('espera')
        ) {
          currentReason = 'Aguardando cruzamento/sinalização';
          otherEpisodes++;
        } else if (
          event.message.toLowerCase().includes('calibração') ||
          event.message.toLowerCase().includes('verificação')
        ) {
          currentReason = 'Verificação de sistema';
          otherEpisodes++;
        } else {
          currentReason = 'Motivo desconhecido';
          unknownEpisodes++;
        }

        reasonMap.set(currentReason, (reasonMap.get(currentReason) || 0) + 1);
      }
    } else if (isResumeEvent && isCurrentlyStopped) {
      // Rover has resumed motion, stop episode concludes
      isCurrentlyStopped = false;
    }
  }

  const reasons: StopReasonCount[] = Array.from(reasonMap.entries()).map(
    ([reason, count]) => ({ reason, count })
  );

  return {
    totalEpisodes,
    presenceEpisodes,
    otherEpisodes,
    unknownEpisodes,
    reasons,
  };
}

/**
 * Extracts origin and destination from mission events or default labels
 */
function inferOriginDestination(events: LogEvent[]): { origin: string; destination: string } {
  let origin = 'Ponto A';
  let destination = 'Ponto B';

  for (const e of events) {
    const payload = e.payload || {};
    if (payload.origin && typeof payload.origin === 'string') origin = payload.origin;
    if (payload.destination && typeof payload.destination === 'string') destination = payload.destination;

    // Check message for clues
    const msg = e.message.toLowerCase();
    if (msg.includes('de ponto b para ponto a') || msg.includes('retorno b -> a') || msg.includes('de b para a')) {
      origin = 'Ponto B';
      destination = 'Ponto A';
    } else if (msg.includes('de ponto a para ponto b') || msg.includes('a -> b') || msg.includes('de a para b')) {
      origin = 'Ponto A';
      destination = 'Ponto B';
    }
  }

  return { origin, destination };
}

/**
 * Evaluates the mission status strictly based on log events
 */
function determineMissionStatus(events: LogEvent[]): MissionStatus {
  if (events.length === 0) return 'indeterminate';

  const hasDestinationReached = events.some(
    (e) =>
      e.eventType === 'destination_reached' ||
      e.eventType === 'mission_end' ||
      e.roverState === 'completed' ||
      e.message.toLowerCase().includes('destino alcançado') ||
      e.message.toLowerCase().includes('missão concluída com sucesso')
  );

  const hasFatalError = events.some(
    (e) =>
      e.severity === 'critical' ||
      (e.eventType === 'error' && e.message.toLowerCase().includes('abortada')) ||
      e.message.toLowerCase().includes('colisão iminente') ||
      e.message.toLowerCase().includes('falha catastrófica') ||
      e.message.toLowerCase().includes('travamento de motor')
  );

  const hasInterruption = events.some(
    (e) =>
      e.message.toLowerCase().includes('interrompida pelo operador') ||
      e.message.toLowerCase().includes('missão abortada')
  );

  if (hasFatalError) return 'failed';
  if (hasInterruption) return 'aborted';
  if (hasDestinationReached) return 'completed';

  // Check if mission is actively ongoing
  const lastEvent = events[events.length - 1];
  const lastTime = new Date(lastEvent.timestamp).getTime();
  const now = Date.now();
  // If the last event happened within 2 hours or states moving/stopped without conclusion
  if (
    lastEvent.roverState === 'moving' ||
    lastEvent.roverState === 'navigating' ||
    lastEvent.roverState === 'obstacle_hold' ||
    (now - lastTime < 1000 * 60 * 60 * 24 && !hasFatalError)
  ) {
    return 'in_progress';
  }

  return 'indeterminate';
}

/**
 * Builds Mission objects by grouping events by missionId
 */
export function buildMissionsFromEvents(events: LogEvent[]): Mission[] {
  const missionMap = new Map<string, LogEvent[]>();

  for (const event of events) {
    const list = missionMap.get(event.missionId) || [];
    list.push(event);
    missionMap.set(event.missionId, list);
  }

  const missions: Mission[] = [];

  for (const [missionId, rawList] of missionMap.entries()) {
    const list = [...rawList].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const startedAt = list[0]?.timestamp || new Date().toISOString();
    const status = determineMissionStatus(list);

    let endedAt: string | undefined = undefined;
    let durationSeconds: number | null = null;

    if (status === 'completed' || status === 'failed' || status === 'aborted') {
      const endEvent = [...list].reverse().find(
        (e) =>
          e.eventType === 'destination_reached' ||
          e.eventType === 'mission_end' ||
          e.eventType === 'error' ||
          e.roverState === 'completed'
      ) || list[list.length - 1];

      if (endEvent && endEvent.timestamp) {
        endedAt = endEvent.timestamp;
        const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
        if (diffMs >= 0) {
          durationSeconds = Math.round(diffMs / 1000);
        }
      }
    }

    const { totalEpisodes, presenceEpisodes, reasons } = calculateStopEpisodes(list);
    const errorCount = list.filter((e) => e.severity === 'error' || e.severity === 'critical').length;
    const { origin, destination } = inferOriginDestination(list);

    missions.push({
      id: missionId,
      origin,
      destination,
      status,
      startedAt,
      endedAt,
      durationSeconds,
      stopCount: totalEpisodes,
      presenceStopCount: presenceEpisodes,
      errorCount,
      eventCount: list.length,
      stopReasons: reasons,
      events: list,
    });
  }

  // Sort missions newest first
  return missions.sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
}

/**
 * Aggregates alerts from log events, grouping repeated issues
 */
export function extractAlertsFromEvents(events: LogEvent[]): Alert[] {
  const alertEvents = events.filter(
    (e) => e.severity === 'warning' || e.severity === 'error' || e.severity === 'critical'
  );

  const groupMap = new Map<string, { event: LogEvent; count: number; ids: string[] }>();

  for (const e of alertEvents) {
    // Group key based on mission and sanitized message
    const cleanMsg = e.message
      .replace(/\d+ms/g, '')
      .replace(/\d+cm/g, '')
      .trim();
    const groupKey = `${e.missionId}_${e.severity}_${cleanMsg}`;

    const existing = groupMap.get(groupKey);
    if (existing) {
      existing.count++;
      existing.ids.push(e.id);
    } else {
      groupMap.set(groupKey, {
        event: e,
        count: 1,
        ids: [e.id],
      });
    }
  }

  const alerts: Alert[] = [];
  let alertIdx = 1;

  for (const [, { event, count, ids }] of groupMap.entries()) {
    let title = 'Alerta do Carrinho';
    if (event.eventType === 'presence_detected') {
      title = 'Presença detectada no trajeto';
    } else if (event.severity === 'critical') {
      title = 'Falha crítica de segurança';
    } else if (event.message.toLowerCase().includes('motor')) {
      title = 'Anomalia no acionamento do motor';
    } else if (event.message.toLowerCase().includes('bateria')) {
      title = 'Nível de bateria sob observação';
    } else if (event.message.toLowerCase().includes('sensor')) {
      title = 'Alerta de telemetria de sensores';
    } else if (event.message.toLowerCase().includes('obstaculo') || event.message.toLowerCase().includes('obstáculo')) {
      title = 'Obstáculo na via do carrinho';
    }

    alerts.push({
      id: `alt-${alertIdx++}`,
      title,
      description: event.message,
      severity: event.severity,
      timestamp: event.timestamp,
      missionId: event.missionId !== 'unassigned' ? event.missionId : undefined,
      occurrenceCount: count,
      acknowledged: false,
      relatedEventIds: ids,
    });
  }

  return alerts.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

/**
 * Computes high-level KPI metrics from missions
 */
export function calculateDashboardMetrics(missions: Mission[], events: LogEvent[]): DashboardMetrics {
  const totalMissions = missions.length;
  const completedMissions = missions.filter((m) => m.status === 'completed').length;
  const inProgressMissions = missions.filter((m) => m.status === 'in_progress').length;
  const failedMissions = missions.filter((m) => m.status === 'failed').length;
  const abortedMissions = missions.filter((m) => m.status === 'aborted').length;
  const indeterminateMissions = missions.filter((m) => m.status === 'indeterminate').length;

  const validDurations = missions
    .filter((m) => m.status === 'completed' && m.durationSeconds !== null && m.durationSeconds > 0)
    .map((m) => m.durationSeconds as number)
    .sort((a, b) => a - b);

  let avgDurationSeconds: number | null = null;
  let medianDurationSeconds: number | null = null;
  let minDurationSeconds: number | null = null;
  let maxDurationSeconds: number | null = null;

  if (validDurations.length > 0) {
    const sum = validDurations.reduce((acc, val) => acc + val, 0);
    avgDurationSeconds = Math.round(sum / validDurations.length);
    minDurationSeconds = validDurations[0];
    maxDurationSeconds = validDurations[validDurations.length - 1];

    const mid = Math.floor(validDurations.length / 2);
    medianDurationSeconds =
      validDurations.length % 2 !== 0
        ? validDurations[mid]
        : Math.round((validDurations[mid - 1] + validDurations[mid]) / 2);
  }

  const stopStats = calculateStopEpisodes(events);
  const completionRate = totalMissions > 0 ? (completedMissions / totalMissions) * 100 : 0;
  const totalErrors = events.filter((e) => e.severity === 'error' || e.severity === 'critical').length;
  const activeAlertsCount = events.filter((e) => e.severity === 'warning' || e.severity === 'error' || e.severity === 'critical').length;

  return {
    totalMissions,
    completedMissions,
    inProgressMissions,
    failedMissions,
    abortedMissions,
    indeterminateMissions,
    avgDurationSeconds,
    medianDurationSeconds,
    minDurationSeconds,
    maxDurationSeconds,
    totalStops: stopStats.totalEpisodes,
    presenceStops: stopStats.presenceEpisodes,
    otherStops: stopStats.otherEpisodes,
    unknownStops: stopStats.unknownEpisodes,
    completionRate,
    activeAlertsCount,
    totalErrors,
  };
}

/**
 * Filters missions and events according to selected time period
 */
export function filterByTimePeriod<T extends { timestamp?: string; startedAt?: string }>(
  items: T[],
  period: TimePeriod,
  startDate?: string,
  endDate?: string
): T[] {
  if (period === 'all') return items;

  const now = Date.now();
  let minTime = 0;

  if (period === '24h') {
    minTime = now - 24 * 60 * 60 * 1000;
  } else if (period === '7d') {
    minTime = now - 7 * 24 * 60 * 60 * 1000;
  } else if (period === '30d') {
    minTime = now - 30 * 24 * 60 * 60 * 1000;
  } else if (period === 'custom') {
    const start = startDate ? new Date(startDate).getTime() : 0;
    const end = endDate ? new Date(endDate).getTime() : Infinity;
    return items.filter((item) => {
      const timeStr = item.timestamp || item.startedAt;
      if (!timeStr) return true;
      const t = new Date(timeStr).getTime();
      return t >= start && t <= end;
    });
  }

  return items.filter((item) => {
    const timeStr = item.timestamp || item.startedAt;
    if (!timeStr) return true;
    const t = new Date(timeStr).getTime();
    return t >= minTime;
  });
}
