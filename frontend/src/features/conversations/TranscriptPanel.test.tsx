// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TranscriptPanel, safeMediaUrl } from './TranscriptPanel';
import { makeConversation } from '../../mocks/fixtures';
import { api } from '../../shared/api/client';
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('Transcript evidence and audio', () => {
  it('opens pre-operator context and highlights the exact system message', async () => {
    const c = makeConversation('demo-001', 0);
    const view = render(
      <TranscriptPanel conversation={c} scope={{ role: 'OKK' }} evidence={null} />,
    );
    expect(document.getElementById('msg-3')).toBeNull();
    view.rerender(
      <TranscriptPanel
        conversation={c}
        scope={{ role: 'OKK' }}
        evidence={{ messageSeq: 3, offsetSec: 15 }}
      />,
    );
    await waitFor(() =>
      expect(document.getElementById('msg-3')?.classList.contains('highlighted')).toBe(true),
    );
    expect(
      screen.getByRole('button', { name: /Бот до подключения/ }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(screen.getByTitle(c.messages[2].timestampRaw).textContent).toBe(c.messages[2].timeLabel);
    expect(screen.getByText('скрыто').getAttribute('title')).toBe('[Имя скрыто]');
  });
  it('refreshes an expired media source once, then offers the external player', async () => {
    const audioApi = vi
      .spyOn(api, 'audio')
      .mockResolvedValue({
        streamUrl: 'https://example.test/synthetic-audio',
        expiresAt: '2026-11-07T00:00:00Z',
        audioPageUrl: 'https://example.test/synthetic-player',
      });
    const view = render(
      <TranscriptPanel
        conversation={makeConversation('voice', 2)}
        scope={{ role: 'OKK' }}
        evidence={{ messageSeq: 5, offsetSec: 32 }}
      />,
    );
    await waitFor(() => expect(view.container.querySelector('audio')).not.toBeNull());
    const audio = view.container.querySelector('audio')!;
    fireEvent.loadedMetadata(audio);
    expect(audio.currentTime).toBe(32);
    fireEvent.error(audio);
    await waitFor(() => expect(audioApi).toHaveBeenCalledTimes(2));
    fireEvent.error(audio);
    expect(audioApi).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: /Открыть запись/ }).getAttribute('target')).toBe(
      '_blank',
    );
    expect(screen.getByRole('alert').textContent).toContain('не воспроизводится');
  });
  it('blocks executable media URLs', () => {
    expect(safeMediaUrl('javascript:alert(1)')).toBeUndefined();
    expect(safeMediaUrl('data:text/html,test')).toBeUndefined();
  });
});
