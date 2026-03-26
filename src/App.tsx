import { useState } from 'react';
import { Sidebar } from './components/layout';
import { Workspace } from './components/workspace';
import { FrameworksView } from './components/frameworks';
import type { IpcLog, SessionDiagnostics } from './types';

function App() {
  const [currentView, setCurrentView] = useState<'workspace' | 'frameworks'>('workspace');
  const [ipcLogs, setIpcLogs] = useState<IpcLog[]>([]);
  const [diagnostics, setDiagnostics] = useState<SessionDiagnostics | undefined>(undefined);

  return (
    <div className="flex h-screen bg-notion-bg p-4 box-border relative z-0">
      <div className="flex flex-1 w-full h-full border-2 border-[#33ff00] relative bg-black/50 z-10 box-border">
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          ipcLogs={ipcLogs}
          diagnostics={diagnostics}
        />

        <main className="flex-1 overflow-hidden h-full flex flex-col">
          {currentView === 'workspace' && (
            <Workspace
              onIpcLogsChange={setIpcLogs}
              onDiagnosticsChange={setDiagnostics}
            />
          )}
          {currentView === 'frameworks' && <FrameworksView />}
        </main>
      </div>
    </div>
  );
}

export default App;
