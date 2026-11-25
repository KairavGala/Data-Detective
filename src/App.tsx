import { useCallback, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BootSequence } from '@/components/cinematic/BootSequence';
import { AppShell } from '@/components/layout/AppShell';
import { DatasetProvider } from '@/context/DatasetContext';
import { InvestigationProvider } from '@/context/InvestigationContext';
import { ReportProvider } from '@/context/ReportContext';
import { AiAssistantPage } from '@/features/assistant';
import { DatasetExplorerPage } from '@/features/explorer';
import { InvestigationCenterPage } from '@/features/investigation';
import { OverviewPage } from '@/features/overview/OverviewPage';
import { ReportsPage } from '@/features/reports';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { StatisticalAnalysisPage } from '@/features/statistics';
import { VisualizationStudioPage } from '@/features/visualizations';

const BOOT_SESSION_KEY = 'dd_boot_completed';
const BOOT_SKIP_PREF_KEY = 'dd_skip_boot_startup';

function readSkipPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(BOOT_SKIP_PREF_KEY) === 'true';
  } catch {
    return false;
  }
}

function shouldShowBootInitially(): boolean {
  if (typeof window === 'undefined') return false;
  if (readSkipPreference()) return false;
  try {
    return window.sessionStorage.getItem(BOOT_SESSION_KEY) !== 'true';
  } catch {
    return true;
  }
}

interface AppWorkspaceProps {
  readonly initialSkipBoot?: boolean;
}

export function AppWorkspace({ initialSkipBoot }: AppWorkspaceProps = {}) {
  const [skipBootOnStartup, setSkipBootOnStartupState] = useState<boolean>(
    () => initialSkipBoot ?? readSkipPreference(),
  );
  const [showBootSequence, setShowBootSequence] = useState<boolean>(() =>
    initialSkipBoot ? false : shouldShowBootInitially(),
  );

  const handleBootComplete = useCallback(() => {
    setShowBootSequence(false);
    try {
      window.sessionStorage.setItem(BOOT_SESSION_KEY, 'true');
    } catch {
      // Ignore storage restrictions
    }
  }, []);

  const handleReplayBoot = useCallback(() => {
    setShowBootSequence(true);
  }, []);

  const handleSetSkipBootOnStartup = useCallback((skip: boolean) => {
    setSkipBootOnStartupState(skip);
    try {
      window.localStorage.setItem(BOOT_SKIP_PREF_KEY, String(skip));
    } catch {
      // Ignore storage restrictions
    }
  }, []);

  return (
    <DatasetProvider>
      <InvestigationProvider>
        <ReportProvider>
          {showBootSequence && <BootSequence onComplete={handleBootComplete} />}

          <Routes>
            <Route
              element={
                <AppShell
                  onReplayBoot={handleReplayBoot}
                  skipBootOnStartup={skipBootOnStartup}
                  onSetSkipBootOnStartup={handleSetSkipBootOnStartup}
                />
              }
            >
              <Route index element={<OverviewPage />} />
              <Route path="explorer" element={<DatasetExplorerPage />} />
              <Route path="analysis" element={<StatisticalAnalysisPage />} />
              <Route
                path="visualizations"
                element={<VisualizationStudioPage />}
              />
              <Route
                path="investigation"
                element={<InvestigationCenterPage />}
              />
              <Route path="assistant" element={<AiAssistantPage />} />
              <Route path="reports" element={<ReportsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ReportProvider>
      </InvestigationProvider>
    </DatasetProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppWorkspace />
    </BrowserRouter>
  );
}
