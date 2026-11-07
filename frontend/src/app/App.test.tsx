// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { App } from './App';
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
afterEach(cleanup);
it('shows batch progress through completion in the conversation list', async () => {
  render(
    <MemoryRouter initialEntries={['/conversations']}>
      <App />
    </MemoryRouter>,
  );
  fireEvent.click(await screen.findByLabelText('Выбрать demo-006'));
  fireEvent.click(screen.getByRole('button', { name: 'Оценить выбранные (1)' }));
  await screen.findByText('Оценено 0 из 1 · ошибок 0');
  await screen.findByText('Оценено 1 из 1 · ошибок 0', {}, { timeout: 7000 });
  expect(screen.getByText('Пакет завершён')).toBeTruthy();
}, 10000);
it('saves a checklist as a new version and activates it for conversation selection', async () => {
  render(
    <MemoryRouter initialEntries={['/checklists']}>
      <App />
    </MemoryRouter>,
  );
  const title = await screen.findByLabelText('Название', { selector: '.checklist-toolbar input' });
  fireEvent.change(title, { target: { value: 'Демо версия для проверки' } });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить как новую версию' }));
  await screen.findByText('Версия 2');
  expect(screen.getByText(/Версия 2 сохранена/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Применить к диалогам →' }));
  await screen.findByRole('heading', { name: 'Каждый диалог — в фокусе' });
});
it('supports operator appeal → OKK decision in the same review page', async () => {
  render(
    <MemoryRouter initialEntries={['/conversations/demo-001']}>
      <App />
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Переоценить' });
  fireEvent.change(screen.getByLabelText('Роль'), { target: { value: 'OPERATOR' } });
  const buttons = await screen.findAllByRole('button', { name: 'Оспорить' });
  expect(screen.queryByRole('button', { name: 'Переоценить' })).toBeNull();
  fireEvent.click(buttons[1]);
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Комментарий'), {
    target: { value: 'Общий вопрос о тарифах.' },
  });
  fireEvent.change(within(dialog).getByLabelText('Предлагаемая оценка (необязательно)'), {
    target: { value: 'na' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Отправить апелляцию' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.change(screen.getByLabelText('Роль'), { target: { value: 'OKK' } });
  await screen.findByLabelText('Причина решения');
  fireEvent.change(screen.getByLabelText('Причина решения'), {
    target: { value: 'Для общей информации N/A разрешён.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить решение' }));
  await waitFor(() => expect(screen.getByText('87.50')).toBeTruthy());
  expect(screen.getByText('70.00')).toBeTruthy();
  expect(screen.queryByLabelText('Причина решения')).toBeNull();
});
