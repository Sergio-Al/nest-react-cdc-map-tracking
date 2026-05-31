import { Outlet } from 'react-router-dom';
import { IconRail } from '@/components/layout/IconRail';
import { CommandPalette } from '@/components/layout/CommandPalette';

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <IconRail />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
