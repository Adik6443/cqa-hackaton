import type { Checklist, Conversation, Evaluation, Operator, Rating } from '../shared/api/types';

export const operators: Operator[] = ['Айгерим', 'Данияр', 'Алина', 'Тимур', 'Мадина'].map(
  (name, i) => ({ id: `demo-op-${i + 1}`, name, fictional: true }),
);
export const checklist: Checklist = {
  id: 'checklist-1',
  version: 1,
  name: 'Стандарт качества · демо',
  active: true,
  createdAtLabel: '07 ноя 2026',
  criteria: [
    {
      id: 'c1',
      code: 'greeting',
      title: 'Приветствие',
      section: 'Начало диалога',
      instruction: 'Представиться и предложить помощь.',
      answerType: 'BOOLEAN',
      weight: 10,
      allowNa: false,
      naCondition: '',
      steps: [],
    },
    {
      id: 'c2',
      code: 'identification',
      title: 'Идентификация клиента',
      section: 'Начало диалога',
      instruction: 'Проверить личность перед обсуждением персональных данных.',
      answerType: 'BOOLEAN',
      weight: 20,
      allowNa: true,
      naCondition: 'Общие вопросы без доступа к счёту.',
      steps: [],
    },
    {
      id: 'c3',
      code: 'need',
      title: 'Выявление потребности',
      section: 'Решение вопроса',
      instruction: 'Уточнить цель обращения.',
      answerType: 'BOOLEAN',
      weight: 15,
      allowNa: false,
      naCondition: '',
      steps: [],
    },
    {
      id: 'c4',
      code: 'accuracy',
      title: 'Полнота ответа',
      section: 'Решение вопроса',
      instruction: 'Дать точный и понятный ответ по вопросу.',
      answerType: 'SCALE',
      weight: 20,
      allowNa: true,
      naCondition: 'Диалог прерван до ответа.',
      steps: [
        { value: 0, label: 'Ответа нет' },
        { value: 0.5, label: 'Частичный ответ' },
        { value: 1, label: 'Полный ответ' },
      ],
    },
    {
      id: 'c5',
      code: 'empathy',
      title: 'Эмпатия',
      section: 'Коммуникация',
      instruction: 'Учитывать контекст клиента и сохранять уважительный тон.',
      answerType: 'BOOLEAN',
      weight: 15,
      allowNa: false,
      naCondition: '',
      steps: [],
    },
    {
      id: 'c6',
      code: 'clarity',
      title: 'Понятный язык',
      section: 'Коммуникация',
      instruction: 'Объяснять термины простыми словами.',
      answerType: 'BOOLEAN',
      weight: 10,
      allowNa: false,
      naCondition: '',
      steps: [],
    },
    {
      id: 'c7',
      code: 'closing',
      title: 'Завершение',
      section: 'Завершение',
      instruction: 'Уточнить, остались ли вопросы, и попрощаться.',
      answerType: 'BOOLEAN',
      weight: 10,
      allowNa: true,
      naCondition: 'Клиент прервал соединение.',
      steps: [],
    },
    {
      id: 'c8',
      code: 'gross',
      title: 'Грубая ошибка',
      section: 'Риски',
      instruction: 'Отметить нарушение конфиденциальности или некорректное обещание.',
      answerType: 'FLAG',
      weight: 0,
      allowNa: false,
      naCondition: '',
      steps: [],
    },
  ],
};

/** Authored scenario values, never calculated from weights. */
export function simulatedEvaluation(id: string, template: Checklist, variant = 0): Evaluation {
  const isOriginalTemplate = template.id === 'checklist-1';
  const values = [1, 0, 1, 0.5, 1, 1, 1, variant === 1 ? 1 : 0];
  const points = [10, 0, 15, 10, 15, 10, 10, 0];
  const score = isOriginalTemplate ? (variant === 2 ? null : variant === 1 ? 45 : 70) : null;
  return {
    id: `eval-${id}-${template.id}`,
    checklistId: template.id,
    checklistVersion: template.version,
    originalScore: score,
    finalScore: score,
    scoreNote: !isOriginalTemplate
      ? 'Для новой версии мок не рассчитывает баллы. Нужен ответ backend.'
      : variant === 2
        ? 'Итог отсутствует в данном демонстрационном сценарии.'
        : 'Фиксированные числа демонстрационного сценария; это не расчёт AI.',
    grossError: variant === 1,
    simulated: true,
    correctionsUsed: 0,
    sections: [
      {
        title: 'Начало диалога',
        originalScore: isOriginalTemplate && variant !== 2 ? 10 : null,
        finalScore: isOriginalTemplate && variant !== 2 ? 10 : null,
      },
      {
        title: 'Решение вопроса',
        originalScore: isOriginalTemplate && variant !== 2 ? 25 : null,
        finalScore: isOriginalTemplate && variant !== 2 ? 25 : null,
      },
    ],
    results: template.criteria.map((criterion, i) => {
      const na = variant === 2 && criterion.allowNa;
      const rule = criterion;
      const value = {
        value: na
          ? null
          : isOriginalTemplate
            ? values[i]
            : criterion.answerType === 'SCALE'
              ? (criterion.steps[0]?.value ?? 0)
              : 0,
        isNa: na,
        points: isOriginalTemplate && !na ? points[i] : null,
        maxPoints: criterion.weight,
      };
      return {
        id: `result-${id}-${template.id}-${criterion.id}`,
        criterion: structuredClone(rule),
        original: { ...value },
        final: { ...value },
        confidence: i === 1 ? 0.62 : 0.94,
        explanation:
          i === 1
            ? 'В демонстрационном ответе AI проверка личности не найдена. Общий вопрос о тарифах может не требовать идентификации.'
            : 'Смоделированная оценка по вымышленному диалогу. Правило и доказательства доступны для проверки.',
        evidence: [
          { messageSeq: i === 1 ? 2 : i === 7 ? 4 : 5, offsetSec: i === 1 ? 8 : i === 7 ? 20 : 32 },
        ],
        decision: null,
      };
    }),
  };
}

export function makeConversation(id: string, index: number, groupId = 'DEMO'): Conversation {
  const operator = operators[index % operators.length];
  const voice = index === 2;
  const language = index === 3 ? 'KZ' : index === 4 ? 'EN' : 'RU';
  const texts =
    language === 'KZ'
      ? [
          'Сәлеметсіз бе! Көмек түрін таңдаңыз.',
          'Жалпы тарифтер туралы білгім келеді.',
          'Операторға қосылу',
          'Сәлеметсіз бе! Қалай көмектесе аламын?',
          'Тарифтер туралы жалпы ақпаратты түсіндіремін.',
          'Рақмет, бәрі түсінікті.',
          'Сұрақтарыңыз болса, хабарласыңыз.',
        ]
      : language === 'EN'
        ? [
            'Welcome. Please choose a topic.',
            'I have a general question about fees.',
            'Connected to an operator',
            'Hello! How can I help?',
            'I can explain where to find the current fee schedule.',
            'Thank you, that helps.',
            'You are welcome. Have a good day.',
          ]
        : [
            'Здравствуйте! Выберите тему обращения.',
            'Хочу узнать, где посмотреть общие тарифы.',
            'Эскалация на оператора',
            'Здравствуйте! Помогу разобраться. [Имя скрыто]',
            'Общие тарифы доступны в разделе документов. Персональные данные для этого вопроса не нужны.',
            'Спасибо, вопрос решён.',
            'Рада помочь! Если появятся вопросы, обращайтесь.',
          ];
  const roles = ['bot', 'client', 'system', 'operator', 'operator', 'client', 'operator'] as const;
  const offsets = [0, 8, 15, 20, 32, 56, 65];
  const labels = ['00:00', '00:08', '00:15', '00:20', '00:32', '00:56', '01:05'];
  const evaluation =
    index === 5 ? null : simulatedEvaluation(id, checklist, index === 1 ? 1 : index === 4 ? 2 : 0);
  return {
    id,
    groupId,
    operatorId: operator.id,
    operatorName: operator.name,
    fictionalAssignment: true,
    channel: voice ? 'VOICE' : 'CHAT',
    language,
    dateRaw: '2026-11-07T09:30:00+00:00',
    dateLabel: '07 ноя 2026 · 14:30',
    status: evaluation ? 'DONE' : 'NOT_EVALUATED',
    finalScore: evaluation?.finalScore ?? null,
    grossError: evaluation?.grossError ?? false,
    openAppeals: 0,
    reviewed: false,
    error: null,
    operatorStartSeq: 4,
    messages: texts.map((text, i) => ({
      seq: i + 1,
      role: roles[i],
      text,
      timestampRaw: voice
        ? `2026-11-07T09:${i === 6 ? '31:05' : `30:${String(offsets[i]).padStart(2, '0')}`}.000+00:00`
        : labels[i],
      offsetSec: offsets[i],
      timeLabel: labels[i],
    })),
    evaluation,
  };
}

export const ratingFixtures: Rating[] = operators.map((o, i) => ({
  operatorId: o.id,
  name: o.name,
  rank: i + 1,
  score: [91.6, 87.2, 82.4, 76.8, null][i],
  conversations: [12, 10, 8, 6, 2][i],
  grossErrors: i === 3 ? 1 : 0,
  level: ['Золото', 'Золото', 'Серебро', 'Бонус приостановлен', 'Недостаточно данных'][i],
  bonusLabel: ['+10%', '+10%', '+5%', 'Грубая ошибка за период', 'Минимум 5 диалогов'][i],
  pointsToNext: [3.4, 7.8, 2.6, null, null][i],
  eligible: i < 3,
  badges: i === 0 ? ['30 дней без грубых ошибок', 'Мастер эмпатии'] : [],
  trend: [
    { label: '03 ноя', score: 78 },
    { label: '04 ноя', score: 85 },
    { label: '05 ноя', score: 82 },
    { label: '06 ноя', score: 90 },
    { label: '07 ноя', score: 92 },
  ],
  weakCriteria: ['Выявление потребности', 'Полнота ответа'],
}));
