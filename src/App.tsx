/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Sidebar, NavPage } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { Dashboard } from './pages/Dashboard';
import { Missions } from './pages/Missions';
import { Logs } from './pages/Logs';
import { Alerts } from './pages/Alerts';
import { Performance } from './pages/Performance';
import { Import } from './pages/Import';
import { getDataSource, subscribeToStore } from './services/store';
import { getAlerts } from './services/alertsService';
import { DataSourceType } from './types';

export default function App() {
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataSource, setDataSourceState] = useState<DataSourceType>(getDataSource());
  const [activeAlertCount, setActiveAlertCount] = useState(0);

  // Subscribe to changes in data store
  useEffect(() => {
    const updateStats = async () => {
      setDataSourceState(getDataSource());
      try {
        const unacked = await getAlerts({ status: 'unacknowledged' });
        setActiveAlertCount(unacked.length);
      } catch {
        // Ignore
      }
    };

    updateStats();
    const unsubscribe = subscribeToStore(() => {
      updateStats();
      setRefreshTrigger((prev) => prev + 1);
    });

    return () => unsubscribe();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
    try {
      const unacked = await getAlerts({ status: 'unacknowledged' });
      setActiveAlertCount(unacked.length);
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const getPageTitle = (page: NavPage): { title: string; subtitle: string } => {
    switch (page) {
      case 'dashboard':
        return {
          title: 'Visão Geral',
          subtitle: 'Acompanhe as operações e o desempenho do carrinho autônomo',
        };
      case 'missions':
        return {
          title: 'Missões e Percursos',
          subtitle: 'Histórico detalhado de percursos entre pontos operacionais',
        };
      case 'logs':
        return {
          title: 'Logs e Eventos',
          subtitle: 'Auditoria técnica de telemetria, comandos e sensores',
        };
      case 'alerts':
        return {
          title: 'Alertas e Problemas',
          subtitle: 'Monitoramento de falhas, paradas não programadas e avisos',
        };
      case 'performance':
        return {
          title: 'Desempenho',
          subtitle: 'Indicadores estatísticos consolidados e tendências de tempo',
        };
      case 'import':
        return {
          title: 'Importar Dados',
          subtitle: 'Carregue arquivos de telemetria JSON ou CSV no navegador',
        };
    }
  };

  const pageMeta = getPageTitle(currentPage);

  return (
    <div className="flex min-h-screen bg-[#F7FAF8] text-[#25372D]">
      {/* Sidebar Navigation */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        dataSource={dataSource}
        isOpenMobile={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
        alertCount={activeAlertCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={pageMeta.title}
          subtitle={pageMeta.subtitle}
          onOpenMobile={() => setIsMobileOpen(true)}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          dataSource={dataSource}
          onNavigateToImport={() => setCurrentPage('import')}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {currentPage === 'dashboard' && (
            <Dashboard
              onNavigateToMissions={() => setCurrentPage('missions')}
              onNavigateToLogs={() => setCurrentPage('logs')}
              onNavigateToAlerts={() => setCurrentPage('alerts')}
              onNavigateToImport={() => setCurrentPage('import')}
              refreshTrigger={refreshTrigger}
            />
          )}

          {currentPage === 'missions' && (
            <Missions refreshTrigger={refreshTrigger} />
          )}

          {currentPage === 'logs' && (
            <Logs refreshTrigger={refreshTrigger} />
          )}

          {currentPage === 'alerts' && (
            <Alerts refreshTrigger={refreshTrigger} />
          )}

          {currentPage === 'performance' && (
            <Performance refreshTrigger={refreshTrigger} />
          )}

          {currentPage === 'import' && (
            <Import
              onImportSuccess={() => setRefreshTrigger((prev) => prev + 1)}
              dataSource={dataSource}
            />
          )}
        </main>
      </div>
    </div>
  );
}
