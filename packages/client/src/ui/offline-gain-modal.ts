import { S2C, type ServerToClientEventPayload } from '@mud/shared';
import { detailModalHost } from './detail-modal-host';
import {
  storePlayerStatisticTotalsInBrowser,
  storeOfflineGainReportsInBrowser,
  type OfflineGainStoreResult,
} from '../offline-gain-storage';
import { formatOfflineGainDuration, renderOfflineGainReports } from './offline-gain-render';

type OfflineGainToastKind = 'success' | 'warn' | 'system';

interface OfflineGainReportHandlerOptions {
  getPlayerId: () => string | null | undefined;
  ackOfflineGainReports: (reportIds: string[]) => void;
  showToast: (message: string, kind?: OfflineGainToastKind) => void;
  windowRef?: Window;
}

export function handleOfflineGainReports(
  payload: ServerToClientEventPayload<typeof S2C.OfflineGainReports>,
  options: OfflineGainReportHandlerOptions,
): void {
  const reports = Array.isArray(payload?.reports) ? payload.reports : [];
  const playerId = options.getPlayerId() ?? reports[0]?.playerId ?? 'anonymous';
  if (payload?.totals) {
    storePlayerStatisticTotalsInBrowser(playerId, payload.totals, options.windowRef ?? window);
  }
  if (reports.length === 0) {
    return;
  }

  const storeResult = storeOfflineGainReportsInBrowser(playerId, reports, options.windowRef ?? window);
  if (storeResult.storedReportIds.length > 0) {
    options.ackOfflineGainReports(storeResult.storedReportIds);
  }

  if (storeResult.reports.length > 0) {
    openOfflineGainReportsModal(storeResult);
    if (storeResult.storageOk) {
      options.showToast(`离线挂机收益已保存：${storeResult.reports.length} 条`, 'success');
    } else {
      options.showToast('离线挂机收益已接收，本地保存失败，云端会保留并下次重发', 'warn');
    }
  }
}

function openOfflineGainReportsModal(storeResult: OfflineGainStoreResult): void {
  const reports = storeResult.reports;
  if (reports.length === 0) {
    return;
  }
  const totalDurationMs = reports.reduce((total, report) => total + Math.max(0, report.durationMs), 0);
  detailModalHost.open({
    ownerId: 'offline-gain-reports',
    variantClass: 'detail-modal--offline-gain',
    size: 'lg',
    title: '离线挂机收益',
    subtitle: `${reports.length} 次离线记录 · ${formatOfflineGainDuration(totalDurationMs)}`,
    hint: storeResult.storageOk ? '已存入本地浏览器' : '本地保存失败，云端仍会保留',
    bodyHtml: renderOfflineGainReports(reports),
  });
}
