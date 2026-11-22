import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppWorkspace } from '@/App';

function renderWorkspace(initialEntry = '/', initialSkipBoot = true) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppWorkspace initialSkipBoot={initialSkipBoot} />
    </MemoryRouter>,
  );
}

describe('Global Keyboard Shortcut Manager', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it('navigates across sections with G chords including jumping back to Overview (G then O and G then 0)', async () => {
    const user = userEvent.setup();
    renderWorkspace('/explorer');

    // Starts on Dataset Explorer
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Dataset Explorer',
    );

    // Press G -> chord HUD appears
    await user.keyboard('g');
    expect(screen.getByTestId('shortcut-chord-hud')).toBeInTheDocument();

    // Press O -> jumps to Overview
    await user.keyboard('o');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Overview',
      );
    });
    expect(screen.queryByTestId('shortcut-chord-hud')).not.toBeInTheDocument();

    // Press G then A -> Statistical Analysis
    await user.keyboard('ga');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Statistical Analysis',
      );
    });

    // Press G then , -> Settings
    await user.keyboard('g,');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Settings',
      );
    });

    // Press G then 0 -> numeric section code jump back to Overview
    await user.keyboard('g0');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Overview',
      );
    });
  });

  it('focuses the desktop sidebar with S (and G then S), supports arrow-key navigation, and focuses main workspace with M', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    const sidebar = screen.getByTestId('desktop-sidebar');

    // Press S -> focuses active link inside desktop sidebar (Overview)
    await user.keyboard('s');
    expect(sidebar.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toHaveTextContent('Overview');

    // ArrowDown moves roving focus to Dataset Explorer inside the sidebar
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toHaveTextContent('Dataset Explorer');

    // ArrowUp moves back to Overview
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toHaveTextContent('Overview');

    // Press M -> moves focus to main workspace region
    await user.keyboard('m');
    expect(document.activeElement).toBe(
      document.getElementById('workspace-main'),
    );

    // Press G then S -> also focuses sidebar
    await user.keyboard('gs');
    expect(sidebar.contains(document.activeElement)).toBe(true);
  });

  it('toggles desktop sidebar collapse with [ and Ctrl+B', async () => {
    const user = userEvent.setup();
    renderWorkspace('/');

    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeInTheDocument();

    await user.keyboard('[[');
    expect(
      screen.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(
      screen.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeInTheDocument();
  });

  it('opens, filters, executes actions from, and dismisses the Keyboard Shortcuts Reference modal (?)', async () => {
    const user = userEvent.setup();
    renderWorkspace('/analysis');

    // Press ? -> opens reference modal
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', {
      name: /Keyboard Command Reference/i,
    });
    expect(dialog).toBeInTheDocument();

    // Filter inside modal without triggering global shortcuts
    const searchInput = within(dialog).getByLabelText(
      'Filter keyboard shortcuts',
    );
    await user.type(searchInput, 'overview');

    const overviewRow = within(dialog).getByRole('button', {
      name: /Overview/i,
    });
    expect(overviewRow).toBeInTheDocument();

    // Clicking the shortcut row runs the command and closes the modal
    await user.click(overviewRow);
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Keyboard Command Reference/i }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Overview',
      );
    });

    // Re-open via Sidebar button and dismiss with Escape
    await user.click(screen.getByRole('button', { name: 'Keyboard Shortcuts' }));
    expect(
      await screen.findByRole('dialog', {
        name: /Keyboard Command Reference/i,
      }),
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: /Keyboard Command Reference/i }),
      ).not.toBeInTheDocument();
    });
  });

  it('ignores shortcuts while typing in inputs, when paused in Settings, or while BootSequence is active', async () => {
    const user = userEvent.setup();

    // 1. BootSequence active (aria-modal="true") blocks navigation shortcuts
    const { unmount } = renderWorkspace('/explorer', false);
    expect(
      screen.getByRole('dialog', {
        name: /Data Detective system initialization/i,
      }),
    ).toBeInTheDocument();
    await user.keyboard('go');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Dataset Explorer',
    );
    unmount();

    // 2. Typing inside an input field never triggers navigation
    renderWorkspace('/settings', true);
    const tempInput = document.createElement('input');
    document.body.appendChild(tempInput);
    tempInput.focus();
    await user.type(tempInput, 'gos');
    expect(tempInput.value).toBe('gos');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Settings',
    );
    tempInput.remove();

    // 3. Disabling global keyboard shortcuts in Settings pauses navigation chords
    const toggle = screen.getByRole('switch', {
      name: 'Enable global keyboard shortcuts',
    });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.keyboard('go');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Settings',
    );

    // Re-enabling restores navigation shortcuts immediately
    await user.click(toggle);
    await user.keyboard('go');
    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Overview',
      );
    });
  });

  it('cancels an active chord prefix cleanly on Escape', async () => {
    const user = userEvent.setup();
    renderWorkspace('/explorer');

    await user.keyboard('g');
    expect(screen.getByTestId('shortcut-chord-hud')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('shortcut-chord-hud')).not.toBeInTheDocument();

    // Subsequent O without G does not navigate
    await user.keyboard('o');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Dataset Explorer',
    );
  });
});
