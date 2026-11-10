// ========== GLOBAL ERROR BOUNDARY ==========
window.onerror = function(msg, src, line, col, err) {
  console.error('[QC Dashboard Error]', msg, 'at', src, line + ':' + col, err);
  return true;
};

window.addEventListener('unhandledrejection', function(e) {
  console.error('[QC Dashboard Promise Error]', e.reason);
});

// ========== SECURITY: HTML escaping for untrusted text ==========
// `tendencies` / `rec` (recommendations) and employee names ultimately come
// from parsed XLSX/PDF report files (see auto_updater.py) and now flow live
// through /api/metrics. They are free text, not markup, and must never be
// inserted into innerHTML unescaped — otherwise a report containing "<" or
// a stray HTML-looking fragment could execute as script for every viewer.
// Line breaks in tendencies/rec use a literal, hardcoded '<br><br>' — that
// stays safe because it is never derived from report content itself.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
window.escapeHtml = escapeHtml;

// Escapes text AND turns literal newlines into <br> — for multi-paragraph
// report text (tendencies/rec) where we want visual line breaks but the
// content itself must never be interpreted as markup.
function escapeHtmlWithBreaks(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}
window.escapeHtmlWithBreaks = escapeHtmlWithBreaks;

// ========== "Calls to target" projection ==========
// Given the current average (0..1) over `totalCalls` calls, estimates how
// many MORE calls scored 100% would be needed to pull the average up to
// `target` (0..1). Pure math, not a guarantee — assumes every future call
// in the projection is scored perfectly on this criterion.
// Returns null if already at/above target, or if there isn't enough
// data (0 calls) to make a meaningful projection.
function callsToReachTarget(avgFraction, totalCalls, target) {
  if (avgFraction === undefined || avgFraction === null || !totalCalls || totalCalls <= 0) return null;
  if (avgFraction >= target) return 0;
  const sum = avgFraction * totalCalls;
  // x = (target*n - sum) / (1 - target)
  const x = (target * totalCalls - sum) / (1 - target);
  return Math.max(0, Math.ceil(x - 1e-9)); // tiny epsilon guards float rounding
}

const NORM_THRESHOLD = 0.75; // matches the existing "Цель достигнута" badge (badge-tqs) convention
const CEILING_TARGET = 0.99; // practical "почти идеал" ceiling — literal 100% needs infinite calls once any imperfect score exists

function buildCallsProjectionText(avgFraction, totalCalls) {
  if (!totalCalls) return 'Нет данных о количестве звонков за период';
  const toNorm = callsToReachTarget(avgFraction, totalCalls, NORM_THRESHOLD);
  const toCeiling = callsToReachTarget(avgFraction, totalCalls, CEILING_TARGET);
  const lines = [];
  if (toNorm === 0) {
    lines.push(`Норма (${Math.round(NORM_THRESHOLD * 100)}%) выполнена ✅`);
  } else if (toNorm !== null) {
    lines.push(`До нормы (${Math.round(NORM_THRESHOLD * 100)}%): ${toNorm} зв. на 100%`);
  }
  if (toCeiling === 0) {
    lines.push(`Максимум (${Math.round(CEILING_TARGET * 100)}%) выполнен ✅`);
  } else if (toCeiling !== null) {
    lines.push(`До максимума (${Math.round(CEILING_TARGET * 100)}%): ${toCeiling} зв. на 100%`);
  }
  return lines.join('\n');
}
window.buildCallsProjectionText = buildCallsProjectionText;

    // ========== 1. DASHBOARD DATA ==========
    
    // ========== 2. STATIC DATA ==========
    const CRITERIA = [
      { n: 1, name: 'Приветствие, идентификация и прощание', weight: 5, color: '#6366f1', desc: 'Соблюдение официального протокола входа в контакт.' },
      { n: 2, name: 'Этика общения', weight: 5, color: '#8b5cf6', desc: 'Отсутствие конфликтогенов, соблюдение норм делового этикета.' },
      { n: 3, name: 'Работа в системе (CRM)', weight: 10, color: '#3FA7C9', desc: 'Соответствие статуса в CRM фактическому итогу.' },
      { n: 4, name: 'Легендирование', weight: 15, color: '#7c3aed', desc: 'Тактическое использование сценариев: «компетенция» + «эскалация».' },
      { n: 5, name: 'Информирование о задолженности', weight: 10, color: '#4f46e5', desc: 'Точность и полнота данных о суммах, сроках DPD.' },
      { n: 6, name: 'Аргументация', weight: 20, color: '#ec4899', desc: 'Глубина и логика работы с отказами. НПА РУз.' },
      { n: 7, name: 'Манипуляция', weight: 10, color: '#f59e0b', desc: 'Применение психологических триггеров давления.' },
      { n: 8, name: 'Выставление требований', weight: 15, color: '#10b981', desc: 'Чёткость: конкретный срок, сумма, способ оплаты.' },
      { n: 9, name: 'Подведение итогов (Якунлаш)', weight: 10, color: '#06b6d4', desc: 'Резюмирование + фиксация разговора.' },
    ];

    const SVP_STAGES_REG = [
      { num: 'Этап 1', title: 'Фаза входа в контакт', desc: 'Приветствие · Идентификация · Легендирование', detail: 'Установление стандартов приветствия. Тактическое легендирование: «компетенция» + «эскалация».' },
      { num: 'Этап 2', title: 'Информационный блок', desc: 'Информирование о долге · DPD · Открытые вопросы', detail: 'Озвучивание суммы и срока. Диагностика ситуации через открытые вопросы.' },
      { num: 'Этап 3', title: 'Блок активного взыскания', desc: 'Аргументация · Манипуляция · РсВ', detail: 'Переход от стандартных доводов к нормативной аргументации (НПА и условия Оферты).' },
      { num: 'Этап 4', title: 'Фиксация обязательств', desc: 'Требования · Итоги (Якунлаш) · Прощание', detail: 'Стандартизация требований: конкретный срок PTP, полная сумма, способы оплаты.' },
      { num: 'Этап 5', title: 'Интеграция в систему QC', desc: 'Весовые коэффициенты · TQS', detail: 'Увязка каждого этапа СВП с весовыми коэффициентами (5–20%) в оценочном листе QC.' },
    ];

    const LAWS = [
      { art: 'Ст. 236', name: 'Надлежащее исполнение', text: 'Обязательства должны исполняться надлежащим образом в соответствии с условиями договора.', use: '«Согласно ст. 236 ГК РУз, Вы обязаны исполнить обязательства в точном соответствии с условиями оферты...»' },
      { art: 'Ст. 237', name: 'Запрет одностороннего отказа', text: 'Односторонний отказ от исполнения обязательства и одностороннее изменение его условий не допускаются.', use: '«Согласно ст. 237 ГК РУз, Вы не вправе в одностороннем порядке отказаться от исполнения договорных обязательств...»' },
      { art: 'Ст. 333', name: 'Ответственность за неисполнение', text: 'Отсутствие у должника денежных средств само по себе не освобождает его от ответственности.', use: '«Ст. 333 ГК РУз прямо указывает: отсутствие денег не снимает с Вас обязательств...»' },
      { art: 'Ст. 421', name: 'Залог до полной оплаты', text: 'Товар, проданный в кредит, находится в залоге у продавца до момента его полной оплаты.', use: '«В соответствии со ст. 421 ГК РУз приобретённый Вами товар является залоговым имуществом VRF...»' },
    ];

    const OBJECTIONS = [
      { id: 1, cat: 'Финансы', q: '«Нет денег / не могу заплатить»', script: `Понимаю вашу ситуацию. Однако согласно ст. 333 ГК РУз, отсутствие денежных средств само по себе не освобождает должника от ответственности. Подскажите: когда именно вы сможете внести платёж?`, laws: ['Ст. 333'] },
      { id: 2, cat: 'Финансы', q: '«Сейчас нет возможности / зарплата придёт позже»', script: `Согласно ст. 236 ГК РУз, обязательства по договору должны исполняться в установленный срок. Назовите конкретную дату — я внесу PTP.`, laws: ['Ст. 236'] },
      { id: 3, cat: 'Финансы', q: '«Я уже оплатил / это ошибка»', script: `Предоставьте подтверждение оплаты. Платёж по системе не поступал. По регламенту п. 5.4 Оферты платёж считается принятым после отражения в системе.`, laws: [] },
      { id: 4, cat: 'Финансы', q: '«Почему так много пени?»', script: `Сумма формируется из: основного долга, пени (п. 5.10 Оферты) и затрат на взыскание (ст. 324 ГК РУз). Погасив сегодня, вы зафиксируете текущий размер долга.`, laws: ['Ст. 324'] },
      { id: 5, cat: 'Финансы', q: '«Я не знал о штрафах»', script: `Согласно п. 4.1.6 Оферты, при просрочке более 60 дней сумма увеличивается. Ст. 324 ГК РУз подтверждает право на возмещение убытков.`, laws: ['Ст. 324'] },
      { id: 6, cat: 'Личные обстоятельства', q: '«Почему вы звоните мне на работу / в махаллю?»', script: `Подписывая договор, вы предоставили Компании право уведомлять (п. 4.1.7 Договора). Самый быстрый способ прекратить — погасить задолженность.`, laws: [] },
      { id: 7, cat: 'Личные обстоятельства', q: '«Я не давал согласия на запись»', script: `Обработка данных производится в целях исполнения Договора (ст. 18 ЗРУ «О персональных данных»). Запись — внутренний регламент QC.`, laws: [] },
      { id: 8, cat: 'Товар', q: '«Я продал/подарил товар»', script: `По ст. 421 ГК РУз товар в залоге до полной оплаты. Отчуждение — ст. 168 УК РУз (мошенничество) и ст. 233 УК РУз.`, laws: ['Ст. 421'] },
      { id: 9, cat: 'Товар', q: '«Товар бракованный»', script: `Факт приёмки подтверждает исправность. По ст. 417 ГК РУз все риски перешли к вам. Претензии — отдельный процесс.`, laws: [] },
      { id: 10, cat: 'Товар', q: '«Товар сломался — не плачу»', script: `По п. 5.6 Договора выплаты независимы от состояния товара (ст. 236 ГК РУз). Гарантия — через Магазин.`, laws: ['Ст. 236'] },
      { id: 11, cat: 'Юридические вопросы', q: '«Пусть подают в суд»', script: `По п. 9.4 Договора и ПКМ № 26 — бесспорный порядок через нотариуса. БПИ арестует счета немедленно.`, laws: [] },
      { id: 12, cat: 'Юридические вопросы', q: '«Оферта — не договор»', script: `Договор — публичная оферта (ст. 369 ГК РУз). SMS-код = акцепт (ст. 360, 107 ГК РУз).`, laws: ['Ст. 237'] },
      { id: 13, cat: 'Юридические вопросы', q: '«Почему сразу всю сумму?»', script: `При просрочке 30+ дней — досрочное погашение (п. 9.3 Договора, ст. 422 ГК РУз).`, laws: ['Ст. 236'] },
      { id: 14, cat: 'Юридические вопросы', q: '«Мне угрожают уголовной ответственностью»', script: `Сотрудники информируют о законных последствиях. Добровольное погашение устранит правовые риски.`, laws: [] },
      { id: 15, cat: 'Юридические вопросы', q: '«БПИ придёт не скоро»', script: `Ст. 23 ЗРУ — постановление в течение 1 рабочего дня. Расходы растут ежедневно.`, laws: [] },
      { id: 16, cat: 'Личные обстоятельства', q: '«Я болен / в больнице»', script: `По ст. 237 ГК РУз обязательства не прекращаются. Кто из близких может оплатить через Payme/Click?`, laws: ['Ст. 237'] },
      { id: 17, cat: 'Личные обстоятельства', q: '«Я в другом городе/стране»', script: `Payme, Click, Paynet — дистанционно. Местонахождение не влияет на обязательства (ст. 236).`, laws: ['Ст. 236'] },
      { id: 18, cat: 'Личные обстоятельства', q: '«Я не тот человек»', script: `ФИО, дата рождения совпадают. SMS-акцепт = электронная подпись (ст. 107, 369 ГК РУз).`, laws: [] },
      { id: 19, cat: 'Финансы', q: '«Готов платить частями»', script: `Частичная оплата не останавливает пени (п. 5.10). Но снизит базу. Готовы к оплате сегодня?`, laws: ['Ст. 333'] },
      { id: 20, cat: 'Юридические вопросы', q: '«Подам жалобу / в суд / к прокурору»', script: `Ваше право. Компания действует в рамках закона (ст. 360, 369 ГК РУз, ПКМ № 26). Обязательства продолжают действовать.`, laws: ['Ст. 236', 'Ст. 237'] },
    ];

    const SVP_STAGES_B2B = [{"stage": "DPD 1-10", "title": "Зеленый уровень", "desc": "Лояльность и Репутация", "detail": "Цель: Профилактика просрочки, акцент на добросовестности (ст. 9 ГК РУз) и сохранении доступа к кредитным инструментам."}, {"stage": "DPD 10-20", "title": "Желтый уровень", "desc": "Финансовое давление и Убытки – потеря контроля", "detail": "Цель: Обозначение существенного характера нарушения и подготовка к принудительным мерам."}, {"stage": "DPD 20-30", "title": "Красный уровень", "desc": "Принудительное взыскание", "detail": "Цель: Ультимативное требование, трансляция неизбежности расторжения сотрудничества, возможного изъятия имущества и краха репутации."}];
    const LAWS_B2B = [{"art": "Ст. 236", "name": "Надлежащее исполнение", "text": "Обязательства должны исполняться надлежащим образом в соответствии с условиями обязательства и требованиями законодательства.", "use": "Используется для аргументации соблюдения графика платежей."}, {"art": "Ст. 237", "name": "Недопустимость отказа", "text": "Односторонний отказ от исполнения обязательств и одностороннее изменение его условий не допускаются.", "use": "Сотрудник не имеет права нарушать договоренности."}, {"art": "Ст. 14, 324", "name": "Взыскание убытков", "text": "Лицо, право которого нарушено, может требовать полного возмещения причиненных ему убытков.", "use": "Для предупреждения о дополнительных финансовых потерях при суде."}, {"art": "Ст. 736", "name": "Досрочное взыскание", "text": "Кредитор вправе потребовать досрочного возврата всей оставшейся суммы долга вместе с причитающимися процентами.", "use": "При нарушении сроков возврата кредита."}, {"art": "Ст. 259", "name": "Взыскание на имущество", "text": "Обязательства могут погашаться за счет реализации имущества должника.", "use": "Информирование о крайней мере взыскания."}, {"art": "Ст. 293", "name": "Солидарная ответственность", "text": "Поручитель и должник отвечают перед кредитором солидарно.", "use": "Используется при работе с поручителем."}, {"art": "Ст. 48", "name": "Ответственность юрлиц", "text": "Юридические лица несут ответственность по обязательствам всем своим имуществом.", "use": "Давление на активы предприятия."}, {"art": "Ст. 100", "name": "Защита чести", "text": "Защита чести, достоинства и деловой репутации.", "use": "Аргументация риска для деловой репутации должника."}];
    const OBJECTIONS_B2B = [
  {
    "id": 1,
    "cat": "Бизнес-риски",
    "q": "Сначала взыскивайте с основного должника (от поручителя)",
    "script": "Договор устанавливает солидарный характер ответственности. Кредитор наделен правом требовать исполнения от любого из ответчиков по своему усмотрению, не соблюдая очередность. Вы отвечаете в полном объеме наравне с заемщиком.",
    "laws": [
      "Ст. 293"
    ]
  },
  {
    "id": 2,
    "cat": "Финансы",
    "q": "У меня нет денежных средств и ликвидного имущества",
    "script": "Ваше финансовое положение не является основанием для невыплаты (Ст. 333 ГК РУз). Вы несете ответственность по своим обязательствам всем принадлежащим имуществом, включая то, которое будет приобретено в будущем (Ст. 48 ГК РУз).",
    "laws": [
      "Ст. 48",
      "Ст. 333"
    ]
  },
  {
    "id": 3,
    "cat": "Условия",
    "q": "Я думал иначе/не понимал условия договора",
    "script": "Подписывая договор, вы подтвердили факт волеизъявления и понимание условий. Субъективное непонимание при наличии вашей подписи не освобождает от обязательств.",
    "laws": [
      "Ст. 101",
      "Ст. 108",
      "Ст. 365"
    ]
  },
  {
    "id": 4,
    "cat": "Отговорки",
    "q": "Я выступал лишь в качестве свидетеля",
    "script": "Понятие «свидетель» отсутствует в кредитных правоотношениях. Подписав договор поручительства, вы взяли на себя обязанность исполнить обязательство за должника в полном объеме.",
    "laws": [
      "Ст. 292"
    ]
  },
  {
    "id": 5,
    "cat": "Условия",
    "q": "Я требую сначала закрывать основной долг",
    "script": "Законом установлена строгая очередность погашения, при которой штрафы гасятся после основного долга и процентов, и этот порядок обязателен для всех.",
    "laws": [
      "Ст. 248"
    ]
  },
  {
    "id": 6,
    "cat": "Финансы",
    "q": "В связи с кризисом я не имею возможности платить",
    "script": "Односторонний отказ недопустим. Изменение финансового положения или рыночной конъюнктуры не является законным основанием для прекращения выплат.",
    "laws": [
      "Ст. 237"
    ]
  },
  {
    "id": 7,
    "cat": "Условия",
    "q": "Я буду платить частями по своим возможностям",
    "script": "Обязательство должно исполняться надлежащим образом — в полном объеме и в сроки по графику. Иное частичное исполнение не является надлежащим.",
    "laws": [
      "Ст. 234",
      "Ст. 236"
    ]
  },
  {
    "id": 8,
    "cat": "Отговорки",
    "q": "Банк должен войти в положение и подождать",
    "script": "Вы обязаны полностью соблюдать график платежей. Отсутствие денег не является непреодолимой силой, и банк вправе требовать возврата долга со штрафами.",
    "laws": [
      "Ст. 333",
      "Ст. 327"
    ]
  }
];
    let currentObjMode = 'B2C';

    function setObjMode(mode) {
      currentObjMode = mode;
      const b2c = document.getElementById('btn-b2c');
      const b2b = document.getElementById('btn-b2b');
      if(b2c) b2c.className = 'cat-tab' + (mode === 'B2C' ? ' active' : '');
      if(b2b) {
          b2b.className = 'cat-tab' + (mode === 'B2B' ? ' active' : '');
          b2b.style.background = mode === 'B2B' ? '#eab308' : 'rgba(234,179,8,0.1)';
          b2b.style.color = mode === 'B2B' ? '#0B0F14' : '#facc15';
      }
      
      currentCat = 'Все';
      renderSVP();
      renderLaws();
      renderCatTabs();
      renderObjList();
    }

    const CATEGORIES = ['Все', 'Финансы', 'Товар', 'Юридические вопросы', 'Личные обстоятельства'];
    const CAT_COLORS = { 'Финансы': { bg: 'rgba(74,222,128,0.15)', color: '#4ade80' }, 'Товар': { bg: 'rgba(255, 157, 52,0.15)', color: '#FF9D34' }, 'Юридические вопросы': { bg: 'rgba(63, 167, 201,0.15)', color: '#3FA7C9' }, 'Личные обстоятельства': { bg: 'rgba(96,165,250,0.15)', color: '#60a5fa' } };

    // ========== 3. GRADING ALGORITHM ==========
    const SVP_KEYS = ["Приветствие", "Этика", "CRM", "Легенда", "Задолж.", "Аргумент.", "Манипул.", "Требования", "Итоги"];

    // ========== Rank context: gap to leader + who's chasing from below ==========
    // Ranks every operator by their TQS for the currently selected month/period
    // and returns where `name` stands relative to the leader (#1) and to the
    // operator immediately behind them (the closest "chaser" who could
    // overtake them next). QC-score only for now — взыскание (collection
    // amount) isn't in the data model yet, see CURRENT_STATE.md.
    function getRankContext(name) {
      const standings = [];
      Object.keys(DASHBOARD_DATA).forEach(empName => {
        if (empName.includes('Промежуточный')) return;
        const m = DASHBOARD_DATA[empName]?.months?.[currentMonth];
        if (!m) return;
        const d = _getEffectiveData(m);
        if (!d || d.tqs === undefined || d.tqs === null) return;
        standings.push({ name: empName, tqs: d.tqs });
      });
      if (!standings.length) return null;
      standings.sort((a, b) => b.tqs - a.tqs);

      const myIndex = standings.findIndex(s => s.name === name);
      if (myIndex === -1) return null;

      const leader = standings[0];
      const me = standings[myIndex];
      const chaser = myIndex < standings.length - 1 ? standings[myIndex + 1] : null;

      return {
        rank: myIndex + 1,
        total: standings.length,
        isLeader: myIndex === 0,
        isLast: myIndex === standings.length - 1,
        leaderName: leader.name,
        leaderTqs: leader.tqs,
        gapToLeaderPct: myIndex === 0 ? 0 : Math.round((leader.tqs - me.tqs) * 1000) / 10,
        chaserName: chaser ? chaser.name : null,
        gapFromChaserPct: chaser ? Math.round((me.tqs - chaser.tqs) * 1000) / 10 : null,
      };
    }

    function getDiagnosticForCriterion(allPeriods, criterion) {
      if (!allPeriods || !allPeriods.length) return { text: 'Нет данных', bg: '#64748b', rank: -1 };

      // Собираем процентные значения по критерию из всех периодов
      const percents = [];
      allPeriods.forEach(p => {
        if (p?.svp && p.svp[criterion] !== undefined) {
          percents.push(p.svp[criterion] * 100);
        } else if (p?.raw_scores && p.raw_scores[criterion]) {
          // Если есть raw_scores, конвертируем в процент
          const rawVals = p.raw_scores[criterion];
          if (rawVals.length > 0) {
            const avg = rawVals.reduce((a, b) => a + b, 0) / rawVals.length;
            percents.push(avg * 100);
          }
        }
      });

      const n = percents.length;
      if (n === 0) return { text: 'Нет данных', bg: '#64748b', rank: -1 };

      // Используем средний процент для диагностики (алгоритм Pro)
      const avgPercent = percents.reduce((a, b) => a + b, 0) / n;
      
      if (avgPercent <= 24) return { text: 'Несоответствие СВП', bg: '#ef4444', rank: 6 };
      if (avgPercent <= 49) return { text: 'Критическая просадка', bg: '#ef4444', rank: 5 };
      if (avgPercent <= 64) return { text: 'Систематическая недоработка', bg: '#eab308', rank: 4 };
      if (avgPercent <= 74) return { text: 'Недоработка критерия', bg: '#eab308', rank: 3 };
      if (avgPercent <= 84) return { text: 'Нестабильная отработка', bg: '#eab308', rank: 2 };
      if (avgPercent <= 99) return { text: 'Критерий требует внимания', bg: '#eab308', rank: 1 };
      return { text: 'Полное соответствие', bg: '#22c55e', rank: 0 };
    }

    // ========== 4. UI ENGINE ==========
    
    function isLight() { return document.body.classList.contains('light-mode'); }
    function thmC(dark, light) { return isLight() ? light : dark; }

    let currentMonth = null; // будет установлен динамически из данных
    let currentPeriod = "Все";
    // Для страницы Rating
    let currentRatingPeriod = "Все"; // внутримесячный период для рейтинга
    let selectedEmployee = null;
    let CRM_ACTIONS_DATA = {}; // { "Имя": { "Месяц 2026": { actions: {тип: count}, total: N } } }, loaded once on page load

    async function loadCrmActionsData() {
      try {
        const res = await fetch('/api/crm-actions');
        if (!res.ok) return;
        CRM_ACTIONS_DATA = await res.json();
        // If an employee card was already open before this finished loading, refresh it
        if (selectedEmployee && typeof showEmployee === 'function') showEmployee(selectedEmployee);
      } catch (e) {
        console.warn('[app] /api/crm-actions unavailable:', e);
      }
    }
    let trendChart = null;
    let currentHeatmapMode = localStorage.getItem('heatmap-mode') || 'heatmap';

    function showSection(id) {
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      document.getElementById('section-' + id).classList.add('active');
      const navs = document.querySelectorAll('.nav-item');
      navs.forEach(n => { if (n.getAttribute('onclick') && n.getAttribute('onclick').includes(id)) n.classList.add('active'); });
      if (id === 'objections') { if (!document.getElementById('catTabs').children.length) { renderCatTabs(); renderObjList(); } if (!document.getElementById('svpContainer').children.length) { renderSVP(); renderLaws(); } }
      if (id === 'reglament' && !document.getElementById('criteriaGrid').children.length) { renderCriteria(); }
      if (id === 'operations' && !trendChart) buildCharts();
    }

function getThemeIcon(isLight) {
  if (isLight) {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"></circle><path d="M12 2.5v2.2"></path><path d="M12 19.3v2.2"></path><path d="M4.9 4.9l1.6 1.6"></path><path d="M17.5 17.5l1.6 1.6"></path><path d="M2.5 12h2.2"></path><path d="M19.3 12h2.2"></path><path d="M4.9 19.1l1.6-1.6"></path><path d="M17.5 6.5l1.6-1.6"></path></svg>';
  }
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 14.2A8.8 8.8 0 1 1 9.8 3.2a7.2 7.2 0 0 0 11 11z"></path><circle cx="17.2" cy="6.3" r="0.8" fill="currentColor" stroke="none"></circle><circle cx="14.9" cy="4.5" r="0.55" fill="currentColor" stroke="none"></circle></svg>';
}

    function initTheme() {
  const urlParams = new URLSearchParams(window.location.search);
  let theme = urlParams.get('theme');
  if (!theme) theme = localStorage.getItem('sc-theme');
  if (!theme) theme = 'light';

  localStorage.setItem('sc-theme', theme);

  if (theme === 'light') {
    document.body.classList.add('light-mode');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = getThemeIcon(true);
  } else {
    document.body.classList.remove('light-mode');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = getThemeIcon(false);
  }

  // Handle Sidebar State
  let sidebarState = urlParams.get('sidebar');
  if (!sidebarState) sidebarState = localStorage.getItem('sc-sidebar');
  if (!sidebarState) sidebarState = 'expanded';

  localStorage.setItem('sc-sidebar', sidebarState);

  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('main');

  if (sidebar && main) {
    // Freeze transitions so the initial class application is instant (no jitter)
    sidebar.style.transition = 'none';
    main.style.transition = 'none';

    if (sidebarState === 'collapsed') {
      sidebar.classList.add('collapsed');
      main.classList.add('collapsed');
    } else {
      sidebar.classList.remove('collapsed');
      main.classList.remove('collapsed');
    }

    // Restore transitions after the browser has painted the new state
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        sidebar.style.transition = '';
        main.style.transition = '';
      });
    });
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  const theme = isLight ? 'light' : 'dark';
  localStorage.setItem('sc-theme', theme);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.innerHTML = getThemeIcon(isLight);
  
  const url = new URL(window.location.href);
  url.searchParams.set('theme', theme);
  window.history.replaceState({}, '', url);

  if(typeof updateDashboard === 'function') updateDashboard();
}

    function initFilters() {
      const mSelect = document.getElementById('monthSelect');
      const months = new Set();
      Object.entries(DASHBOARD_DATA).forEach(([name, emp]) => {
        if (name.includes('Промежуточный')) return;
        if (emp?.months) {
          Object.keys(emp.months).forEach(m => {
            months.add(m);
          });
        }
      });
      // Календарная сортировка месяцев (Январь → Декабрь)
      const MONTH_ORDER = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
      const sorted = Array.from(months).sort((a, b) => {
        // Извлекаем название месяца из строки "Май 2026"
        const aMonth = a.split(' ')[0];
        const bMonth = b.split(' ')[0];
        const aIdx = MONTH_ORDER.indexOf(aMonth);
        const bIdx = MONTH_ORDER.indexOf(bMonth);
        // Сортируем по порядку месяцев, затем по году (обратный порядок для года)
        if (aIdx !== bIdx) return aIdx - bIdx;
        const aYear = parseInt(a.split(' ')[1]) || 0;
        const bYear = parseInt(b.split(' ')[1]) || 0;
        return bYear - aYear;
      }).reverse();
      if (!currentMonth && sorted.length) currentMonth = sorted[0];
      if(mSelect) {
          mSelect.innerHTML = '';
          sorted.forEach(m => { const o = document.createElement('option'); o.value = m; o.textContent = m; if (m === currentMonth) o.selected = true; mSelect.appendChild(o); });
          mSelect.onchange = (e) => { 
            currentMonth = e.target.value; 
            currentPeriod = "Все"; 
            currentRatingPeriod = "Все периоды";
            selectedEmployee = null; 
            updatePeriodTabs(); 
            initRatingPeriodSelect();
            updateDashboard(); 
          };
      }
      updatePeriodTabs();
      initRatingPeriodSelect();
    }

    function initHeatmapModeTabs() {
      const tabs = document.getElementById('heatmapModeTabs');
      if (!tabs) return;

      const modes = [
        { id: 'heatmap', label: 'Heatmap' },
        { id: 'pro', label: 'Pro' }
      ];

      tabs.innerHTML = '';
      modes.forEach(mode => {
        const btn = document.createElement('div');
        btn.className = 'cat-tab' + (currentHeatmapMode === mode.id ? ' active' : '');
        btn.textContent = mode.label;
        btn.onclick = () => {
          currentHeatmapMode = mode.id;
          localStorage.setItem('heatmap-mode', mode.id);
          initHeatmapModeTabs();
          renderHeatmapByMode();
        };
        tabs.appendChild(btn);
      });
    }

    function getProDiagnosticByPercent(percent) {
      if (percent <= 24) return { text: 'Несоответствие СВП', color: '#ef4444', rank: 6 };
      if (percent <= 49) return { text: 'Критическая просадка', color: '#FF5D16', rank: 5 };
      if (percent <= 64) return { text: 'Систематическая недоработка', color: '#eab308', rank: 4 };
      if (percent <= 74) return { text: 'Недоработка критерия', color: '#facc15', rank: 3 };
      if (percent <= 84) return { text: 'Нестабильная отработка', color: '#60a5fa', rank: 2 };
      if (percent <= 99) return { text: 'Критерий требует внимания', color: '#22c55e', rank: 1 };
      return { text: 'Полное соответствие', color: '#16a34a', rank: 0 };
    }

    function renderHeatmapByMode() {
      if (currentHeatmapMode === 'pro') {
        renderHeatmapPro();
      } else {
        renderHeatmap();
      }
    }

    function updatePeriodTabs() {
      const el = document.getElementById('periodTabs');
      if (!el) return;
      const periods = new Set();
      Object.entries(DASHBOARD_DATA).forEach(([name, emp]) => {
          if(name.includes('Промежуточный')) return;
          const m = emp.months[currentMonth];
          if (m && m.periods) m.periods.forEach(p => periods.add(p.period));
      });
      el.innerHTML = '';
      const allBtn = document.createElement('div'); allBtn.className = 'cat-tab' + (currentPeriod === "Все" ? ' active' : ''); allBtn.textContent = 'Сводка';
      allBtn.onclick = () => { currentPeriod = "Все"; updatePeriodTabs(); updateDashboard(); };
      el.appendChild(allBtn);
      Array.from(periods).sort().forEach(p => { const b = document.createElement('div'); b.className = 'cat-tab' + (currentPeriod === p ? ' active' : ''); b.textContent = p; b.onclick = () => { currentPeriod = p; updatePeriodTabs(); updateDashboard(); }; el.appendChild(b); });
    }

    // Инициализация periodSelect для страницы Rating
    function initRatingPeriodSelect() {
      const pSelect = document.getElementById('periodSelect');
      if (!pSelect) return;
      
      const periods = new Set();
      periods.add('Все периоды');
      
      Object.entries(DASHBOARD_DATA).forEach(([name, emp]) => {
        if (name.includes('Промежуточный')) return;
        const m = emp.months?.[currentMonth];
        if (m && m.periods) {
          m.periods.forEach(p => periods.add(p.period));
        }
      });
      
      const sortedPeriods = Array.from(periods).sort((a, b) => {
        if (a === 'Все периоды') return -1;
        if (b === 'Все периоды') return 1;
        return a.localeCompare(b);
      });
      
      if (!currentRatingPeriod || currentRatingPeriod === 'Все') {
        currentRatingPeriod = 'Все периоды';
      }
      
      pSelect.innerHTML = '';
      sortedPeriods.forEach(p => {
        const o = document.createElement('option');
        o.value = p;
        o.textContent = p;
        if (p === currentRatingPeriod) o.selected = true;
        pSelect.appendChild(o);
      });
      
      pSelect.onchange = (e) => {
        currentRatingPeriod = e.target.value;
        buildLeaderboard();
        renderTopBottomCharts();
      };
    }

    // ── Вспомогательные функции агрегации ────────────────────────────────────
    function _ahtToSecs(t) {
      if (!t || t === 'N/A') return 0;
      const p = t.split(':');
      if (p.length === 3) {
        return parseInt(p[0] || 0, 10) * 3600 + parseInt(p[1] || 0, 10) * 60 + parseInt(p[2] || 0, 10);
      }
      return parseInt(p[0] || 0, 10) * 60 + parseInt(p[1] || 0, 10);
    }
    function _secsToAht(s) {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
    }
    function _getEffectiveData(empMonthObj) {
      if (!empMonthObj) return null;
      if (currentPeriod === "Все") {
        const allPs = empMonthObj.periods || [];
        if (!allPs.length) return empMonthObj.summary || null;
        
        // Взвешенный расчет TQS по количеству звонков (activity_count)
        const tqsPs = allPs.filter(p => p?.tqs > 0);
        const weightedTqsData = tqsPs.reduce((acc, p) => {
          const cnt = Number(p.activity_count || 1);
          acc.totalTqs += (p.tqs || 0) * cnt;
          acc.totalCalls += cnt;
          return acc;
        }, { totalTqs: 0, totalCalls: 0 });
        const avgTqs = weightedTqsData.totalCalls ? Math.round(weightedTqsData.totalTqs / weightedTqsData.totalCalls * 100) / 100 : 0;
        
        // Взвешенный расчет AHT по количеству звонков
        const ahtPs = allPs.filter(p => p?.aht && p.aht !== 'N/A');
        const weightedAht = ahtPs.reduce((acc, p) => {
          const cnt = Number(p.activity_count || 1);
          acc.totalSecs += _ahtToSecs(p.aht) * cnt;
          acc.totalCalls += cnt;
          return acc;
        }, { totalSecs: 0, totalCalls: 0 });
        const avgSecs = weightedAht.totalCalls ? Math.floor(weightedAht.totalSecs / weightedAht.totalCalls) : 0;

        // Взвешенный расчет SVP по количеству звонков
        const avgSvp = {};
        SVP_KEYS.forEach(k => {
          let validSvpPeriods = allPs.filter(p => p?.svp && p.svp[k] !== undefined);
          if (validSvpPeriods.length > 0) {
            // Взвешенное среднее для каждого критерия SVP
            const weightedSvp = validSvpPeriods.reduce((acc, p) => {
              const cnt = Number(p.activity_count || 1);
              acc.total += p.svp[k] * cnt;
              acc.calls += cnt;
              return acc;
            }, { total: 0, calls: 0 });
            avgSvp[k] = weightedSvp.calls ? Math.round(weightedSvp.total / weightedSvp.calls * 100) / 100 : 1.0;
          } else {
            avgSvp[k] = 1.0;
          }
        });

        const allTend = allPs.map(p => p?.tendencies).filter(t => t && String(t).trim() !== '').join('\n\n');
        const allRec = allPs.map(p => p?.rec).filter(r => r && String(r).trim() !== '').join('\n\n');
        return {
          period: "Все",
          tqs: avgTqs,
          aht: _secsToAht(avgSecs),
          activity_count: weightedAht.totalCalls,
          svp: avgSvp,
          tendencies: allTend || 'Нет данных',
          rec: allRec || 'Нет системных рекомендаций'
        };
      }
      return empMonthObj.periods?.find(p => p?.period === currentPeriod) || null;
    }

    function updateDashboard() {
      try {
      let tqs = 0, tCount = 0, secs = 0, aCount = 0, riskEmps = new Set();
      // Для взвешенного расчета TQS команды
      let weightedTqsSum = 0, weightedTqsCalls = 0;
      
      Object.entries(DASHBOARD_DATA).forEach(([name, emp]) => {
        if (name.includes('Промежуточный')) return;
        const m = emp.months[currentMonth]; if (!m) return;
        const d = _getEffectiveData(m);
        if (!d) return;
        if (d.tqs > 0) {
          tqs += d.tqs;
          tCount++;
          // Взвешенный TQS для команды
          const calls = Number(d.activity_count || 0);
          if (calls > 0) {
            weightedTqsSum += d.tqs * calls;
            weightedTqsCalls += calls;
          }
        }
        if (d.aht && d.aht !== 'N/A' && d.aht !== '00:00') {
          const callCount = Number(d.activity_count || 1);
          secs += _ahtToSecs(d.aht) * callCount;
          aCount += callCount;
        }
        if (d.svp) {
          // «Приоритет 0»: оператор, у которого в выбранном периоде был хотя бы один звонок с оценкой 0 по любому критерию
          // (раньше считалось только когда СРЕДНЯЯ по критерию равна 0, поэтому почти всегда показывало 0)
          let hasZeroSvp = Object.values(d.svp).some(v => v === 0);
          const _riskPeriods = currentPeriod === "Все" ? (m.periods || []) : (m.periods || []).filter(p => p?.period === currentPeriod);
          const hasZeroCall = _riskPeriods.some(p => p?.raw_scores && Object.values(p.raw_scores).some(arr => Array.isArray(arr) && arr.some(v => v === 0)));
          if ((hasZeroSvp || hasZeroCall) && name) riskEmps.add(name);
        }
      });
      // Командный TQS рассчитывается как взвешенное среднее по звонкам
      const teamTqs = weightedTqsCalls ? weightedTqsSum / weightedTqsCalls : (tCount ? tqs / tCount : 0);
      if(document.getElementById('kpi-tqs')) document.getElementById('kpi-tqs').textContent = tCount ? (teamTqs * 100).toFixed(1) + '%' : '-';
      const avgTqs = tCount ? tqs / tCount : 0;
      if(document.getElementById('badge-tqs')) document.getElementById('badge-tqs').innerHTML = avgTqs >= 0.75 ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg> Цель достигнута' : '⚠ Ниже цели';
      if(document.getElementById('kpi-aht')) document.getElementById('kpi-aht').textContent = aCount ? _secsToAht(Math.round(secs / aCount)) : '-';
      if(document.getElementById('kpi-risk')) document.getElementById('kpi-risk').textContent = riskEmps.size;
      renderHeatmapByMode();
      buildLineChart();
      buildCharts();
      buildGrowthTable();
      buildLeaderboard();
      buildTopBottomCharts();
      
      if (selectedEmployee) showEmployee(selectedEmployee);
      
      if (document.getElementById('forecast-tqs') || document.getElementById('lineChart')) {
          runForecastUpdate();
      }
      } catch (e) {
        console.error('[updateDashboard failed]', e);
      }
    }

    // ========== 2b. FORECAST MATH ORCHESTRATOR ==========

    function runForecastUpdate() {
      const timeline = [];
      const MONTH_SORT = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
      const monthSet = new Set();
      Object.values(DASHBOARD_DATA).forEach(emp => {
        if (emp.months) Object.keys(emp.months).forEach(m => monthSet.add(m));
      });
      const monthOrder = [...monthSet].sort((a, b) => {
        const ai = MONTH_SORT.findIndex(x => a.includes(x));
        const bi = MONTH_SORT.findIndex(x => b.includes(x));
        return ai - bi;
      });
      
      monthOrder.forEach(mName => {
        const pNamesSet = new Set();
        Object.values(DASHBOARD_DATA).forEach(emp => {
          if (emp.months?.[mName]?.periods) {
            emp.months[mName].periods.forEach(p => pNamesSet.add(p.period));
          }
        });
        
        const sortedPeriods = [...pNamesSet].sort();
        sortedPeriods.forEach(pName => {
          let sum = 0, count = 0;
          Object.values(DASHBOARD_DATA).forEach(emp => {
            const m = emp.months?.[mName];
            if (m?.periods) {
              const p = m.periods.find(x => x.period === pName);
              if (p && p.tqs > 0) {
                sum += p.tqs;
                count++;
              }
            }
          });
          if (count > 0) {
            timeline.push({ label: `${mName.split(' ')[0]} ${pName}`, value: sum / count });
          }
        });
      });

      if (timeline.length < 2) return;

      const dataValues = timeline.map(t => t.value);
      const forecastCount = 3;
      const forecastResult = calculateHolt(dataValues, 0.4, 0.3, forecastCount);
      
      if (document.getElementById('forecast-tqs')) {
          const nextVal = forecastResult.forecast[0];
          document.getElementById('forecast-tqs').textContent = (nextVal * 100).toFixed(1) + '%';
          
          const aiEl = document.getElementById('forecast-ai');
          const lastValid = dataValues[dataValues.length - 1];
          const diff = nextVal - lastValid;
          
          if (diff > 0.01) {
            aiEl.textContent = 'Умеренный рост (TQS ↑)'; aiEl.style.color = '#22c55e';
          } else if (diff < -0.01) {
            aiEl.textContent = 'Риск просадки (TQS ↓)'; aiEl.style.color = '#ef4444';
          } else {
            aiEl.textContent = 'Стабильный тренд'; aiEl.style.color = '#facc15';
          }
      }

      const canvas = document.getElementById('lineChart');
      if (canvas && (window.location.pathname.includes('forecast') || document.title.includes('Прогнозирование'))) {
         buildAreaForecastChart(timeline, forecastResult);
      }
    }

    function calculateHolt(data, alpha, beta, n) {
      let level = data[0];
      let trend = data[1] - data[0];
      const fits = [level];
      
      for (let i = 1; i < data.length; i++) {
        let lastLevel = level;
        level = alpha * data[i] + (1 - alpha) * (level + trend);
        trend = beta * (level - lastLevel) + (1 - beta) * trend;
        fits.push(level + trend);
      }
      
      const forecast = [];
      for (let i = 1; i <= n; i++) {
        forecast.push(level + i * trend);
      }

      let ssRes = 0, ssTot = 0;
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      for (let i = 0; i < data.length; i++) {
        ssRes += Math.pow(data[i] - fits[i], 2);
        ssTot += Math.pow(data[i] - mean, 2);
      }
      const r2 = 1 - (ssRes / (ssTot || 1));
      
      return { fits, forecast, r2: Math.max(0, r2) };
    }

    let forecastChartInstance = null;

    function buildAreaForecastChart(history, results) {
      const canvas = document.getElementById('lineChart');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (forecastChartInstance) forecastChartInstance.destroy();

      const labels = [...history.map(h => h.label)];
      for (let i = 1; i <= results.forecast.length; i++) labels.push(`Прогноз +${i}`);

      const historyData = history.map(h => h.value * 100);
      const forecastData = Array(history.length - 1).fill(null);
      forecastData.push(historyData[historyData.length - 1]);
      results.forecast.forEach(f => forecastData.push(f * 100));

      const grad = ctx.createLinearGradient(0, 0, 0, 400);
      grad.addColorStop(0, 'rgba(129, 140, 248, 0.4)');
      grad.addColorStop(1, 'rgba(129, 140, 248, 0)');

      forecastChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Исторические данные (Факт)',
              data: historyData,
              borderColor: '#818cf8',
              backgroundColor: grad,
              fill: true,
              borderWidth: 4,
              pointBackgroundColor: '#818cf8',
              pointBorderColor: '#fff',
              pointBorderWidth: 2,
              pointRadius: 6,
              pointHoverRadius: 8,
              tension: 0.4
            },
            {
              label: 'Прогноз (Double Exp Smoothing)',
              data: forecastData,
              borderColor: '#FF5D16',
              borderDash: [6, 4],
              borderWidth: 3,
              pointBackgroundColor: '#fff',
              pointBorderColor: '#FF5D16',
              pointBorderWidth: 3,
              pointRadius: 6,
              fill: false,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', labels: { color: thmC('#94a3b8', '#71717a'), font: { weight: '600', size: 12 }, padding: 20 } },
            tooltip: {
              backgroundColor: thmC('rgba(15, 23, 42, 0.95)', '#ffffff'),
              titleColor: thmC('#f1f5f9', '#27272a'),
              bodyColor: thmC('#cbd5e1', '#52525b'),
              padding: 12,
              cornerRadius: 8,
              callbacks: {
                label: (ctx) => {
                  const type = ctx.datasetIndex === 0 ? ' Факт: ' : ' Прогноз: ';
                  return type + ctx.parsed.y.toFixed(1) + '%';
                },
                afterFooter: () => `Accuracy (R²): ${(results.r2 * 100).toFixed(1)}%`
              }
            }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: thmC('#64748b', '#71717a'), font: { size: 11 } } },
            y: { min: 40, max: 100, grid: { color: thmC('rgba(255,255,255,0.05)', 'rgba(0,0,0,0.03)'), lineWidth: thmC(1, 0.5) }, ticks: { color: thmC('#64748b', '#71717a'), font: { size: 11 } } }
          }
        },
        plugins: [{
          afterDraw: chart => {
            const ctx = chart.ctx;
            ctx.save();
            ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
            ctx.font = 'bold 11px Inter';
            ctx.textAlign = 'right';
            ctx.fillText(`R² = ${results.r2.toFixed(3)}`, chart.width - 25, 45);
            ctx.restore();
          }
        }]
      });
    }

    function getSmartTooltip(periods) {
      if (!periods || !periods.length) return { text: "Нет данных", rank: -1, bg: '#64748b' };
      let worstRank = -1;
      let worstText = "В норме ✅";
      let worstBg = '#22c55e';
      SVP_KEYS.forEach(k => {
        let diag = getDiagnosticForCriterion(periods, k);
        if (diag.rank > worstRank) {
          worstRank = diag.rank;
          worstText = diag.text;
          worstBg = diag.bg;
        }
      });
      return { text: worstText, rank: worstRank, bg: worstBg };
    }

    // ========== Heatmap detail panel (replaces the old cramped tooltip) ==========
    function wireHeatmapDetailHover(container) {
      const panel = document.getElementById('heatmapDetailPanel');
      if (!panel) return;
      container.querySelectorAll('.hm-cell-hover').forEach(cell => {
        cell.addEventListener('mouseenter', () => updateHeatmapDetailPanel(cell.dataset));
      });
    }

    function updateHeatmapDetailPanel(data) {
      const panel = document.getElementById('heatmapDetailPanel');
      if (!panel) return;
      const percent = data.percent;
      const color = data.color || '#3FA7C9';
      const projLines = (data.proj || '').split('\n').filter(Boolean);
      const projHtml = projLines.map(l => `<div class="heatmap-detail-row"><span>${escapeHtml(l)}</span></div>`).join('');

      panel.innerHTML = `
        <div class="heatmap-detail-title">${escapeHtml(data.operator || '')}</div>
        <div class="heatmap-detail-sub">${escapeHtml(data.crit || '')}</div>
        <div class="gauge-3d" style="background:conic-gradient(${color} ${percent}%, rgba(255,255,255,0.08) 0)">
          <div class="gauge-3d-face"><div class="gauge-3d-value">${percent}%</div></div>
        </div>
        ${projHtml}
        <div class="heatmap-detail-diag">${escapeHtml(data.diag || '')}</div>
      `;
    }

    function renderHeatmap() {
      try {
      const el = document.getElementById('heatmapContainer');
      if (!el) return;
      const wrapper = document.getElementById('heatmapWrapper');
      if (wrapper) wrapper.style.flexDirection = 'row';
      el.innerHTML = '';

      let html = '<div style="display:flex;gap:2px;margin-bottom:8px;font-size:9px;color:#64748b;"><div style="width:160px">ОПЕРАТОР</div>';
      SVP_KEYS.forEach(s => html += `<div style="flex:1;text-align:center">${s.substring(0, 3)}</div>`);
      html += '</div>';
      let rowIdx = 0;
      Object.keys(DASHBOARD_DATA).sort().forEach(name => {
        if (name.includes('Промежуточный')) return;
        const m = DASHBOARD_DATA[name]?.months?.[currentMonth]; if (!m) return;
        const d = _getEffectiveData(m);
        if (!d || !d.svp) return;

        const periodsToAnalyze = currentPeriod === "Все" ? (m.periods || []) : [d];

        let border = name === selectedEmployee ? 'border:1px solid #3FA7C9;background:rgba(63, 167, 201,0.1);' : '';
        html += `<div class="hm-row-3d" style="display:flex;gap:2px;margin-bottom:2px;cursor:pointer;padding:2px;border-radius:4px;${border}animation-delay:${Math.min(rowIdx * 18, 300)}ms;" data-emp-name="${escapeHtml(name)}" onclick="showEmployee(this.dataset.empName)">`;
        html += `<div style="width:160px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(name)}</div>`;
        SVP_KEYS.forEach(st => {
          const v = (d.svp[st] !== undefined) ? d.svp[st] : 1;
          let bg = v >= 1 ? '#22c55e' : (v >= 0.5 ? '#eab308' : '#ef4444');

          const diag = getDiagnosticForCriterion(periodsToAnalyze, st);
          const projection = buildCallsProjectionText(v, d.activity_count);
          const percent = Math.round(v * 100);

          html += `<div style="flex:1;" class="hm-cell-hover" data-operator="${escapeHtml(name)}" data-crit="${escapeHtml(st)}" data-percent="${percent}" data-color="${bg}" data-diag="${escapeHtml(diag.text)}" data-proj="${escapeHtml(projection)}"><div class="hm-cell-3d" style="background:${bg};height:14px;"></div></div>`;
        });
        html += '</div>';
        rowIdx++;
      });
      el.innerHTML = html || '<div style="color:#64748b;padding:12px">Нет данных за этот период</div>';
      wireHeatmapDetailHover(el);
      } catch (e) {
        console.error('[renderHeatmap failed]', e);
      }
    }

    function renderHeatmapPro() {
      try {
      const el = document.getElementById('heatmapContainer');
      if (!el) return;
      const wrapper = document.getElementById('heatmapWrapper');
      if (wrapper) wrapper.style.flexDirection = 'column';
      el.innerHTML = '';

      const viewport = window.innerWidth || 1280;
      const isNarrow = viewport < 1100;
      const isVeryNarrow = viewport < 900;
      const operatorWidth = isVeryNarrow ? 170 : (isNarrow ? 180 : 190);
      const scoreWidth = isVeryNarrow ? 124 : (isNarrow ? 136 : 150);
      const cellMinWidth = isVeryNarrow ? 52 : (isNarrow ? 56 : 58);
      const cellHeight = isVeryNarrow ? 24 : 28;
      const headerFont = isVeryNarrow ? 9 : 10;
      const nameFont = isVeryNarrow ? 11 : 12;
      const percentFont = isVeryNarrow ? 10 : 11;
      const scoreFont = isVeryNarrow ? 11 : 12;
      const rowPadding = isVeryNarrow ? 5 : 6;
      const colGap = isVeryNarrow ? 3 : 4;
      const minTableWidth = operatorWidth + scoreWidth + (SVP_KEYS.length * cellMinWidth) + (SVP_KEYS.length + 2) * colGap + 60;

      const legendItems = [
        { range: '0-24%', color: '#b91c1c', bg: 'rgba(185,28,28,0.22)', label: 'Несоответствие' },
        { range: '25-49%', color: '#A83A0A', bg: 'rgba(168, 58, 10,0.20)', label: 'Критическая просадка' },
        { range: '50-64%', color: '#a16207', bg: 'rgba(161,98,7,0.20)', label: 'Систематическая недоработка' },
        { range: '65-74%', color: '#a16207', bg: 'rgba(161,98,7,0.14)', label: 'Недоработка' },
        { range: '75-84%', color: '#1d4ed8', bg: 'rgba(29,78,216,0.18)', label: 'Нестабильная отработка' },
        { range: '85-99%', color: '#166534', bg: 'rgba(22,101,52,0.18)', label: 'Требует внимания' },
        { range: '100%', color: '#14532d', bg: 'rgba(20,83,45,0.22)', label: 'Полное соответствие' }
      ];

      let html = '<div class="pro-heatmap-legend">';
      html += '<div class="pro-heatmap-legend-title">Pro-диагноз по процентной шкале (7 уровней)</div>';
      html += '<div style="display:flex;flex-wrap:wrap;gap:7px;">';
      legendItems.forEach(item => {
        html += `<span style="font-size:10px;border-radius:7px;padding:5px 8px;background:${item.bg};color:${item.color};border:1px solid ${item.color}55;">${item.range}: ${item.label}</span>`;
      });
      html += '</div></div>';

      html += `<div style="overflow-x:auto;padding-bottom:2px;"><div style="min-width:${minTableWidth}px;">`;
      html += `<div style="display:flex;gap:${colGap}px;margin-bottom:10px;font-size:${headerFont}px;font-weight:700;color:#94a3b8;letter-spacing:0.3px;"><div style="width:${operatorWidth}px">ОПЕРАТОР</div>`;
      SVP_KEYS.forEach(s => html += `<div style="flex:1;min-width:${cellMinWidth}px;text-align:center">${s.substring(0, 3)}</div>`);
      html += `<div style="width:${scoreWidth}px;text-align:center">Pro-score</div></div>`;

      Object.keys(DASHBOARD_DATA).sort().forEach(name => {
        if (name.includes('Промежуточный')) return;
        const m = DASHBOARD_DATA[name]?.months?.[currentMonth];
        if (!m) return;
        const d = _getEffectiveData(m);
        if (!d || !d.svp) return;

        let rankSum = 0;
        let criteriaCount = 0;
        const rowClass = 'pro-heatmap-row' + (name === selectedEmployee ? ' selected' : '');

        html += `<div class="${rowClass} hm-row-3d" style="gap:${colGap}px;padding:${rowPadding}px;border-radius:8px;transition:all .15s ease;animation-delay:0ms;" data-emp-name="${escapeHtml(name)}" onclick="showEmployee(this.dataset.empName)">`;
        html += `<div class="pro-heatmap-name" style="width:${operatorWidth}px;font-size:${nameFont}px;line-height:${cellHeight}px;">${escapeHtml(name)}</div>`;

        SVP_KEYS.forEach(st => {
          const v = d.svp[st] !== undefined ? d.svp[st] : 1;
          const percent = Math.round(v * 100);
          const diag = getProDiagnosticByPercent(percent);
          rankSum += diag.rank;
          criteriaCount++;
          const projection = buildCallsProjectionText(v, d.activity_count);
          html += `<div style="flex:1;min-width:${cellMinWidth}px;" class="hm-cell-hover" data-operator="${escapeHtml(name)}" data-crit="${escapeHtml(st)}" data-percent="${percent}" data-color="${diag.color}" data-diag="${escapeHtml(diag.text)}" data-proj="${escapeHtml(projection)}"><div class="hm-cell-3d" style="background:${diag.color};height:${cellHeight}px;display:flex;align-items:center;justify-content:center;color:#ffffff;font-size:${percentFont}px;font-weight:700;line-height:1;">${percent}%</div></div>`;
        });

        const proScore = criteriaCount ? ((rankSum / (criteriaCount * 6)) * 100) : 0;
        const scoreColor = proScore >= 65 ? '#dc2626' : (proScore >= 40 ? '#A83A0A' : (proScore >= 20 ? '#a16207' : '#166534'));
        const scoreBg = proScore >= 65 ? 'rgba(220,38,38,0.16)' : (proScore >= 40 ? 'rgba(168, 58, 10,0.16)' : (proScore >= 20 ? 'rgba(161,98,7,0.16)' : 'rgba(22,101,52,0.16)'));
        html += `<div style="width:${scoreWidth}px;display:flex;align-items:center;justify-content:center;"><span style="font-size:${scoreFont}px;font-weight:700;color:${scoreColor};background:${scoreBg};border:1px solid ${scoreColor}55;border-radius:8px;padding:${isVeryNarrow ? 5 : 6}px ${isVeryNarrow ? 8 : 10}px;min-width:${isVeryNarrow ? 74 : 82}px;text-align:center;">${proScore.toFixed(1)}%</span></div>`;
        html += '</div>';
      });

      html += '</div></div>';
      el.innerHTML = html || '<div style="color:#64748b;padding:12px">Нет данных за этот период</div>';
      wireHeatmapDetailHover(el);
      } catch (e) {
        console.error('[renderHeatmapPro failed]', e);
      }
    }

    let drillPieChart = null;
    let drillTrendChart = null;
    let crmActionsChartInstance = null;

    const CRM_ACTION_COLORS = {
      'Обещание платежа': '#22c55e',
      'Заявленный платеж': '#3FA7C9',
      'Отказ от оплаты': '#ef4444',
      'Бросил трубку': '#f97316',
      'Отказ от разговора': '#ec4899',
      'Думает': '#eab308',
      'Тишина': '#94a3b8',
    };
    const CRM_FALLBACK_COLORS = ['#a78bfa', '#34d399', '#fb7185', '#60a5fa', '#facc15'];
    function crmActionColor(label, idx) {
      return CRM_ACTION_COLORS[label] || CRM_FALLBACK_COLORS[idx % CRM_FALLBACK_COLORS.length];
    }

    function showEmployee(name) {
      try {
      selectedEmployee = name;
      const empData = DASHBOARD_DATA[name];
      if (!empData) return;
      const m = empData.months[currentMonth];
      const el = document.getElementById('drilldownContent');
      if (!el) return;
      if (!m) {
        el.innerHTML = `<h4 style="color:#3FA7C9;margin-bottom:12px">${escapeHtml(name)}</h4><p style="color:#64748b">Нет данных за ${escapeHtml(currentMonth)}</p>`;
        return;
      }
      const d = _getEffectiveData(m);
      if (!d) {
        el.innerHTML = `<h4 style="color:#3FA7C9;margin-bottom:12px">${escapeHtml(name)}</h4><p style="color:#64748b">Нет данных за период ${escapeHtml(currentPeriod)}</p>`;
        return;
      }
      // Зоны роста из SVP данных текущего периода
      let growthHtml = '';
      if (d.svp) {
        const problems = Object.entries(d.svp).filter(([k, v]) => v < 1);
        if (problems.length) {
          growthHtml = '<p style="margin-top:8px"><strong>Зоны роста:</strong><br>';
          growthHtml += problems.map(([k, v]) => {
            const cls = v === 0 ? 'badge-red' : 'badge-yellow';
            return `<span class="kpi-badge ${cls}" style="margin:2px 2px 0 0">${k}: ${Math.round(v * 100)}%</span>`;
          }).join('');
          growthHtml += '</p>';
        }
      }
      const rankCtx = getRankContext(name);
      let rankHtml = '';
      if (rankCtx) {
        const leaderLine = rankCtx.isLeader
          ? `<span style="color:#fbbf24;font-weight:700;">🏆 Первое место (${rankCtx.total} чел.)</span>`
          : `<span style="color:#94a3b8;">До 1-го места (<strong style="color:#f1f5f9">${escapeHtml(rankCtx.leaderName)}</strong>, ${(rankCtx.leaderTqs * 100).toFixed(1)}%):</span> <strong style="color:#FF5D16;">${rankCtx.gapToLeaderPct.toFixed(1)} п.п.</strong>`;
        const chaserLine = rankCtx.isLast
          ? `<span style="color:#64748b;">Замыкающий рейтинга — преследователей нет</span>`
          : rankCtx.chaserName
            ? `<span style="color:#94a3b8;">Догоняет (<strong style="color:#f1f5f9">${escapeHtml(rankCtx.chaserName)}</strong>):</span> <strong style="color:${rankCtx.gapFromChaserPct <= 2 ? '#ef4444' : '#22c55e'}">${rankCtx.gapFromChaserPct.toFixed(1)} п.п. отрыв</strong>`
            : '';
        rankHtml = `<div class="card" style="padding:10px 12px;margin-bottom:12px;text-align:left;font-size:12px;line-height:1.7;">
    <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Место в рейтинге: ${rankCtx.rank} из ${rankCtx.total}</div>
    <div>${leaderLine}</div>
    <div>${chaserLine}</div>
  </div>`;
      }

      const crmMonthData = CRM_ACTIONS_DATA[name] && CRM_ACTIONS_DATA[name][currentMonth];
      let crmActionsHtml = '';
      if (crmMonthData && crmMonthData.actions && Object.keys(crmMonthData.actions).length) {
        const entries = Object.entries(crmMonthData.actions).sort((a, b) => b[1] - a[1]);
        const total = crmMonthData.total || entries.reduce((s, [, v]) => s + v, 0);
        const legendRows = entries.map(([label, count], idx) => {
          const pct = total ? (count / total * 100).toFixed(1) : '0.0';
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0;font-size:11.5px;">
            <span style="display:flex;align-items:center;gap:7px;color:#e2e8f0;"><span style="width:9px;height:9px;border-radius:50%;background:${crmActionColor(label, idx)};flex-shrink:0;"></span>${escapeHtml(label)}</span>
            <span style="color:#94a3b8;white-space:nowrap;">${count} <span style="color:#5B6478">(${pct}%)</span></span>
          </div>`;
        }).join('');
        crmActionsHtml = `<div class="card" style="margin-top:16px;padding:16px;">
    <div style="font-size:11px;color:#94a3b8;margin-bottom:12px;font-weight:600;text-align:left;">CRM-действия: ${escapeHtml(name)} — ${escapeHtml(currentMonth)}</div>
    <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;">
      <div style="width:130px;height:130px;position:relative;flex-shrink:0;"><canvas id="crmActionsChart"></canvas></div>
      <div style="flex:1;min-width:180px;">${legendRows}</div>
    </div>
  </div>`;
      }

      el.innerHTML = `<h4 style="color:#FF5D16;margin-bottom:12px;font-weight:800;">${escapeHtml(name)}</h4>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
    <div class="card" style="padding:10px"><small>TQS</small><br><strong>${d.tqs !== undefined ? (d.tqs * 100).toFixed(1) + '%' : 'N/A'}</strong></div>
    <div class="card" style="padding:10px"><small>AHT</small><br><strong>${escapeHtml(d.aht) || 'N/A'}</strong></div>
  </div>
  ${rankHtml}
  <div style="text-align:left;font-size:11px">
    <p style="margin-bottom:8px"><strong>Тенденции:</strong><br>${d.tendencies ? escapeHtmlWithBreaks(d.tendencies) : 'Нет данных'}</p>
    <p><strong>Рекомендации:</strong><br>${d.rec ? escapeHtmlWithBreaks(d.rec) : 'Нет данных'}</p>
    ${growthHtml}
  </div>
  ${crmActionsHtml}
  <div style="display:grid;grid-template-columns:1fr;gap:16px;margin-top:20px;">
    <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;font-weight:600;text-align:left;">Распределение ошибок СВП:</div>
        <div style="height:150px;position:relative;width:100%"><canvas id="drillPie"></canvas></div>
    </div>
    <div>
        <div style="font-size:11px;color:#94a3b8;margin-bottom:8px;font-weight:600;text-align:left;">Динамика TQS (периоды месяца):</div>
        <div style="height:120px;position:relative;width:100%"><canvas id="drillTrend"></canvas></div>
    </div>
  </div>
  `;
      
      if (crmActionsChartInstance) crmActionsChartInstance.destroy();
      if (crmMonthData && crmMonthData.actions && Object.keys(crmMonthData.actions).length) {
        const entries = Object.entries(crmMonthData.actions).sort((a, b) => b[1] - a[1]);
        const ctxCrm = document.getElementById('crmActionsChart').getContext('2d');
        crmActionsChartInstance = new Chart(ctxCrm, {
          type: 'doughnut',
          data: {
            labels: entries.map(([label]) => label),
            datasets: [{
              data: entries.map(([, count]) => count),
              backgroundColor: entries.map(([label], idx) => crmActionColor(label, idx)),
              borderWidth: 2,
              borderColor: thmC('#131920', '#ffffff'),
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            cutout: '62%',
          },
        });
      }
      
      // Render Charts for Drilldown
      if (drillPieChart) drillPieChart.destroy();
      if (drillTrendChart) drillTrendChart.destroy();

      if (d.svp) {
         let pieLabels = [];
         let pieData = [];
         let pieColors = [];
         SVP_KEYS.forEach(k => {
            if(d.svp[k] !== undefined && d.svp[k] < 1) {
                pieLabels.push(k.substring(0,25));
                pieData.push(1 - d.svp[k]); // amount of error
                pieColors.push(d.svp[k] <= 0.25 ? '#ef4444' : '#eab308');
            }
         });
         
         if(pieData.length > 0) {
             const ctxPie = document.getElementById('drillPie').getContext('2d');
             drillPieChart = new Chart(ctxPie, {
                 type: 'doughnut',
                 data: { labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 1, borderColor: '#131920' }] },
                 options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: thmC('#131920', '#ffffff'), titleColor: thmC('#f1f5f9', '#27272a'), bodyColor: thmC('#94a3b8', '#52525b') } }, cutout: '70%'}
             });
         } else {
             document.getElementById('drillPie').parentElement.innerHTML = '<div style="color:#22c55e;font-size:12px;padding:20px;text-align:center;">Ошибок СВП нет ✅</div>';
         }
      }

      const mAll = DASHBOARD_DATA[name].months[currentMonth];
      if (mAll && mAll.periods) {
          const trendLabels = mAll.periods.map(p => p.period);
          const trendData = mAll.periods.map(p => p.tqs * 100);
          const ctxTrend = document.getElementById('drillTrend').getContext('2d');
          drillTrendChart = new Chart(ctxTrend, {
              type: 'line',
              data: { labels: trendLabels, datasets: [{ label: 'TQS %', data: trendData, borderColor: '#FF5D16', backgroundColor: '#FF5D1622', fill: true, tension: 0.4, pointRadius: 3 }] },
              options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: false }, y: { min: 30, max: 100, ticks: { color: thmC('#64748b', '#71717a'), font: {size: 9} } } } }
          });
      }

      renderHeatmapByMode();
      } catch (e) {
        console.error('[showEmployee failed]', e);
        const el = document.getElementById('drilldownContent');
        if (el) el.innerHTML = '<p style="color:#ef4444;padding:20px;">Ошибка загрузки данных сотрудника</p>';
      }
    }


    let lineChartInstance = null;
    const LINE_COLORS = ['#3FA7C9', '#4ade80', '#f87171', '#facc15', '#60a5fa', '#FF9D34', '#34d399', '#e879f9', '#94a3b8', '#ffba08', '#818cf8', '#f472b6', '#2dd4bf', '#fbbf24', '#c084fc', '#22d3ee', '#fb7185', '#a3e635', '#e2e8f0', '#FF5D16'];

    function shortN(name) {
      const p = name.split(' ');
      return p.length > 1 ? `${p[0]} ${p[1][0]}.` : name;
    }

    function buildLineChart() {
      const canvas = document.getElementById('lineChart');
      if (!canvas) return;
      // Skip if this is the forecast page (it has its own area chart)
      if (window.location.pathname.includes('forecast') || document.title.includes('Прогнозирование')) return;
      
      const ctx = canvas.getContext('2d');
      if (lineChartInstance) lineChartInstance.destroy();

      const monthData = {};
      Object.entries(DASHBOARD_DATA).forEach(([name, emp]) => {
        if (name.includes('Промежуточный')) return;
        const m = emp.months[currentMonth];
        if (!m || !m.periods || !m.periods.length) return;
        monthData[name] = m.periods.map(p => ({ period: p.period, tqs: p.tqs * 100 })); // Convert to 0-100
      });

      if (!Object.keys(monthData).length) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }

      const periodLabels = [...new Set(Object.values(monthData).flatMap(ps => ps.map(p => p.period)))].sort();
      const datasets = Object.entries(monthData).map(([name, ps], i) => {
        // Map TQS strictly by matching periods. Push null if completely missing or tqs essentially 0 unrecorded
        const dataArr = periodLabels.map(lbl => {
          const e = ps.find(p => p.period === lbl);
          return (e && e.tqs > 0) ? e.tqs : null;
        });

        return {
          label: shortN(name),
          data: dataArr,
          borderColor: LINE_COLORS[i % LINE_COLORS.length],
          backgroundColor: LINE_COLORS[i % LINE_COLORS.length] + '22',
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 7,
          tension: 0.4,
          spanGaps: true // Ensure lines connect!
        };
      });

      lineChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: periodLabels, datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: thmC('#94a3b8', '#71717a'), font: { size: 10 } } },
            tooltip: {
              backgroundColor: thmC('#131920', '#ffffff'), borderColor: thmC('#262F38', '#e4e4e7'), borderWidth: 1, titleColor: thmC('#f1f5f9', '#27272a'), bodyColor: thmC('#94a3b8', '#52525b'),
              callbacks: { label: c => c.dataset.label + ': ' + (c.parsed.y !== null ? c.parsed.y.toFixed(1) + '%' : '—') }
            }
          },
          scales: {
            x: { grid: { color: thmC('#131920', 'rgba(0,0,0,0.03)'), lineWidth: thmC(1, 0.5) }, ticks: { color: thmC('#64748b', '#71717a'), font: { size: 10 } } },
            y: { min: 30, max: 100, grid: { color: thmC('#232b3e', 'rgba(0,0,0,0.03)'), lineWidth: thmC(1, 0.5) }, ticks: { color: thmC('#64748b', '#71717a'), font: { size: 10 }, callback: v => v + '%' } }
          }
        }
      });
    }
    function buildCharts() {
      const trendEl = document.getElementById('trendChart');
      if (!trendEl) return;
      const ctx = trendEl.getContext('2d');
      if (trendChart) trendChart.destroy();
      let labels = [], data = [], colors = [];
      Object.keys(DASHBOARD_DATA).sort().forEach(name => {
        if(name.includes('Промежуточный')) return;
        const m = DASHBOARD_DATA[name].months[currentMonth]; if (!m) return;
        const d = _getEffectiveData(m);
        if (!d || !d.svp) return; // показываем всех, у кого есть данные
        const t = (d.tqs || 0) * 100; // Convert 0-1 to 0-100
        labels.push(shortN(name)); data.push(t);
        colors.push(t >= 75 ? '#22c55e' : (t >= 60 ? '#eab308' : '#f87171'));
      });
      if (!labels.length) return;
      trendChart = new Chart(ctx, {
        type: 'bar',
        data: { labels, datasets: [{ label: 'TQS %', data, backgroundColor: colors, borderRadius: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            y: { min: 0, max: 100, grid: { color: thmC('#232b3e', 'rgba(0,0,0,0.03)'), lineWidth: thmC(1, 0.5) }, ticks: { color: thmC('#64748b', '#71717a'), callback: v => v + '%' } },
            x: { grid: { display: false }, ticks: { color: thmC('#64748b', '#71717a'), font: { size: 10 }, maxRotation: 45 } }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: thmC('#131920', '#ffffff'), borderColor: thmC('#262F38', '#e4e4e7'), borderWidth: 1, titleColor: thmC('#f1f5f9', '#27272a'), bodyColor: thmC('#94a3b8', '#52525b'),
              callbacks: { label: c => c.parsed.y > 0 ? 'TQS: ' + c.parsed.y + '%' : 'Нет данных TQS' }
            }
          }
        }
      });
    }

    function buildGrowthTable() {
      const tbody = document.getElementById('growthTableBody');
      if (!tbody) return;
      tbody.innerHTML = '';

      const empProblems = [];
      Object.keys(DASHBOARD_DATA).forEach(name => {
        if(name.includes('Промежуточный')) return;
        const m = DASHBOARD_DATA[name]?.months?.[currentMonth]; if (!m) return;
        const d = _getEffectiveData(m);
        if (!d || !d.svp) return;

        const periodsToAnalyze = currentPeriod === "Все" ? (m.periods || []) : [d];
        const rankInfo = getSmartTooltip(periodsToAnalyze);

        let critList = [];
        SVP_KEYS.forEach(k => {
          let v = d.svp[k];
          if (v !== undefined && v < 1) {
            let diag = getDiagnosticForCriterion(periodsToAnalyze, k);
            critList.push({ name: k, val: v, diag: diag });
          }
        });

        if (critList.length > 0) {
          critList.sort((a, b) => {
            if (a.val !== b.val) return a.val - b.val;
            return b.diag.rank - a.diag.rank;
          });
          
          let critHtml = '';
          let statHtml = '';
          critList.forEach(c => {
            let cls = c.val <= 0.25 ? 'badge-red' : 'badge-yellow';
            critHtml += `<div style="height:24px;display:flex;align-items:center;margin-bottom:6px;"><span class="kpi-badge ${cls}" style="margin:0">${c.name} (${Math.round(c.val * 100)}%)</span></div>`;
            statHtml += `<div style="height:24px;display:flex;align-items:center;margin-bottom:6px;font-size:11px;font-weight:600;color:${c.diag.bg};">${c.diag.text}</div>`;
          });

          empProblems.push({
            name: name,
            tqs: d.tqs,
            rank: rankInfo.rank,
            critHtml: critHtml,
            statHtml: statHtml,
            rec: d.rec ? escapeHtmlWithBreaks(d.rec) : 'Нет системных рекомендаций'
          });
        }
      });

      empProblems.sort((a, b) => b.rank - a.rank || a.tqs - b.tqs);

      let html = '';
      empProblems.forEach(ep => {
        html += `<tr style="cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);" data-emp-name="${escapeHtml(ep.name)}" onclick="showEmployee(this.dataset.empName)">
          <td style="font-weight:600;vertical-align:top;padding-top:14px;">${escapeHtml(ep.name)}</td>
          <td style="vertical-align:top;padding-top:14px;">${ep.tqs !== undefined && ep.tqs !== null ? (ep.tqs * 100).toFixed(1) + '%' : '—'}</td>
          <td style="vertical-align:top;padding-top:14px;">${ep.critHtml}</td>
          <td style="vertical-align:top;padding-top:14px;">${ep.statHtml}</td>
          <td style="font-size:11px;color:${thmC('#94a3b8', '#3f3f46')};line-height:1.5;white-space:pre-wrap;vertical-align:top;padding:14px 12px 14px 0;">${ep.rec}</td>
        </tr>`;
      });
      tbody.innerHTML = html || '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:20px;">Нет зон роста (все показатели 100%)</td></tr>';
    }

    function buildLeaderboard() {
      const tbody = document.getElementById('leaderboardBody');
      if (!tbody) return;

      const empDataList = [];
      const monthKeys = Object.keys(DASHBOARD_DATA).map(name => DASHBOARD_DATA[name]?.months ? Object.keys(DASHBOARD_DATA[name].months) : []).flat();
      const uniqueMonths = [...new Set(monthKeys)].sort((a, b) => {
        const MONTH_ORDER = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
        const aMonth = a.split(' ')[0];
        const bMonth = b.split(' ')[0];
        const aIdx = MONTH_ORDER.indexOf(aMonth);
        const bIdx = MONTH_ORDER.indexOf(bMonth);
        if (aIdx !== bIdx) return aIdx - bIdx;
        const aYear = parseInt(a.split(' ')[1]) || 0;
        const bYear = parseInt(b.split(' ')[1]) || 0;
        return aYear - bYear;
      });
      
      const currentMonthIdx = uniqueMonths.indexOf(currentMonth);
      const prevMonth = currentMonthIdx > 0 ? uniqueMonths[currentMonthIdx - 1] : null;

      Object.keys(DASHBOARD_DATA).forEach(name => {
        if(name.includes('Промежуточный')) return;
        const m = DASHBOARD_DATA[name]?.months?.[currentMonth]; 
        if (!m) return;
        
        // Определяем данные для текущего периода
        let currentData = null;
        if (currentRatingPeriod === 'Все периоды') {
          currentData = _getEffectiveData(m);
        } else {
          currentData = m.periods?.find(p => p.period === currentRatingPeriod);
        }
        
        if (!currentData || currentData.tqs === undefined) return;

        // Расчет Δ TQS (динамика vs предыдущий период)
        let trend = 0;
        if (currentRatingPeriod === 'Все периоды') {
          // Сравнение с предыдущим месяцем (последний период текущего vs последний период предыдущего)
          if (prevMonth) {
            const prevM = DASHBOARD_DATA[name]?.months?.[prevMonth];
            if (prevM && prevM.periods && prevM.periods.length > 0) {
              const lastPrev = prevM.periods[prevM.periods.length - 1];
              const lastCurrent = m.periods && m.periods.length > 0 ? m.periods[m.periods.length - 1] : null;
              if (lastCurrent && lastPrev) {
                trend = lastCurrent.tqs - lastPrev.tqs;
              }
            }
          }
        } else {
          // Сравнение с предыдущим периодом внутри месяца
          if (m.periods && m.periods.length >= 2) {
            const currentIdx = m.periods.findIndex(p => p.period === currentRatingPeriod);
            if (currentIdx > 0) {
              const prev = m.periods[currentIdx - 1];
              trend = currentData.tqs - prev.tqs;
            }
          }
        }

        // Расчет TQS период (значение за текущий период)
        const periodTqs = currentData.tqs * 100;

        // Расчет Динамика периода (то же что и trend, но для отдельного столбца)
        const periodTrend = trend * 100;

        // Расчет Средний TQS за последние 3 периода
        let avgTqs3 = 0;
        if (currentRatingPeriod === 'Все периоды') {
          // Средний по месяцам (текущий + 2 предыдущих)
          const monthsToAvg = [currentMonth];
          if (currentMonthIdx > 0) monthsToAvg.push(uniqueMonths[currentMonthIdx - 1]);
          if (currentMonthIdx > 1) monthsToAvg.push(uniqueMonths[currentMonthIdx - 2]);
          
          let totalTqs = 0, count = 0;
          monthsToAvg.forEach(monthName => {
            const monthData = DASHBOARD_DATA[name]?.months?.[monthName];
            if (monthData) {
              const d = _getEffectiveData(monthData);
              if (d && d.tqs > 0) {
                totalTqs += d.tqs;
                count++;
              }
            }
          });
          avgTqs3 = count > 0 ? (totalTqs / count) * 100 : 0;
        } else {
          // Средний по периодам внутри месяца (текущий + 2 предыдущих)
          const periodsToAvg = [];
          if (m.periods) {
            const currentIdx = m.periods.findIndex(p => p.period === currentRatingPeriod);
            if (currentIdx >= 0) {
              periodsToAvg.push(m.periods[currentIdx]);
              if (currentIdx > 0) periodsToAvg.push(m.periods[currentIdx - 1]);
              if (currentIdx > 1) periodsToAvg.push(m.periods[currentIdx - 2]);
            }
          }
          let totalTqs = 0, count = 0;
          periodsToAvg.forEach(p => {
            if (p && p.tqs > 0) {
              totalTqs += p.tqs;
              count++;
            }
          });
          avgTqs3 = count > 0 ? (totalTqs / count) * 100 : 0;
        }

        empDataList.push({ 
          name, 
          tqs: currentData.tqs * 100, 
          trend: trend * 100,
          periodTqs: periodTqs,
          periodTrend: periodTrend,
          avgTqs3: avgTqs3
        });
      });

      empDataList.sort((a, b) => b.tqs - a.tqs);
      window.lastLeaderboardData = empDataList; // used by exportRatingToExcel()

      let html = '';
      empDataList.forEach((ep, idx) => {
        let trendHtml = '<span style="color:#94a3b8">▬ 0.0%</span>';
        if (ep.trend > 0.5) trendHtml = `<span style="color:#22c55e">▲ +${ep.trend.toFixed(1)}%</span>`;
        if (ep.trend < -0.5) trendHtml = `<span style="color:#ef4444">▼ ${ep.trend.toFixed(1)}%</span>`;

        let periodTrendHtml = '<span style="color:#94a3b8">▬ 0.0%</span>';
        if (ep.periodTrend > 0.5) periodTrendHtml = `<span style="color:#22c55e">▲ +${ep.periodTrend.toFixed(1)}%</span>`;
        if (ep.periodTrend < -0.5) periodTrendHtml = `<span style="color:#ef4444">▼ ${ep.periodTrend.toFixed(1)}%</span>`;

        let rankColor = idx === 0 ? '#fbbf24' : (idx === 1 ? '#94a3b8' : (idx === 2 ? '#b45309' : '#4a5568'));

        html += `<tr style="cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05);" data-emp-name="${escapeHtml(ep.name)}" onclick="showEmployee(this.dataset.empName)">
          <td style="font-weight:800;color:${rankColor};font-size:14px;">${idx + 1}</td>
          <td style="font-weight:600;">${escapeHtml(ep.name)}</td>
          <td style="font-weight:800;color:${thmC('#e2e8f0','#18181b')};">${ep.tqs.toFixed(1)}%</td>
          <td style="font-size:12px;">${trendHtml}</td>
          <td style="font-weight:600;color:#93c5fd;">${ep.periodTqs.toFixed(1)}%</td>
          <td style="font-size:12px;">${periodTrendHtml}</td>
          <td style="font-weight:600;color:#fbbf24;">${ep.avgTqs3.toFixed(1)}%</td>
        </tr>`;
      });
      tbody.innerHTML = html || '<tr><td colspan="7" style="text-align:center;color:#64748b;padding:20px;">Нет данных для рейтинга</td></tr>';
    }

    // ========== 5. REGLAMENT RENDERING ==========
    function renderCriteria() {
      const g = document.getElementById('criteriaGrid');
      CRITERIA.forEach(c => {
        g.innerHTML += `<div class="crit-card" style="border-top:3px solid ${c.color}"><div class="crit-num">${c.n}</div><div class="crit-weight" style="color:${c.color}">${c.weight}%</div><div class="crit-name">${c.name}</div><div class="crit-desc">${c.desc}</div><div class="crit-bar" style="background:linear-gradient(90deg,${c.color},${c.color}44);width:${c.weight * 5}%"></div></div>`;
      });
    }

    function renderSVP() {
      const c = document.getElementById('svpContainer'); c.innerHTML = '';
      const svpData = currentObjMode === 'B2C' ? SVP_STAGES_REG : SVP_STAGES_B2B; svpData.forEach((s, i) => {
        const el = document.createElement('div'); el.className = 'svp-stage' + (i === 0 ? ' active' : '');
        el.innerHTML = `<div class="svp-num">${s.num}</div><div class="svp-title">${s.title}</div><div class="svp-desc">${s.desc}</div><div class="svp-detail">${s.detail}</div>`;
        el.onclick = () => { document.querySelectorAll('.svp-stage').forEach(x => x.classList.remove('active')); el.classList.add('active'); };
        c.appendChild(el);
      });
    }

    function renderLaws() {
      const g = document.getElementById('lawGrid'); g.innerHTML = '';
      const lawData = currentObjMode === 'B2C' ? LAWS : LAWS_B2B; lawData.forEach((l, i) => { g.innerHTML += `<div class="law-card" onclick="openLawModal(${i})"><div class="law-art">${l.art}</div><div class="law-name">${l.name}</div><div class="law-text">${l.text.substring(0, 80)}...</div></div>`; });
    }
    function openLawModal(i) {
      const l = currentObjMode === 'B2C' ? LAWS[i] : LAWS_B2B[i];
      document.getElementById('lawModalContent').innerHTML = `<div style="font-size:22px;font-weight:800;color:#3FA7C9;margin-bottom:4px">${l.art}</div><div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:12px">${l.name}</div><div style="font-size:12px;color:#94a3b8;line-height:1.6;margin-bottom:16px">${l.text}</div><div style="background:rgba(63, 167, 201,0.1);border:1px solid #2E7A91;border-radius:8px;padding:14px;"><div style="font-size:10px;font-weight:700;color:#3FA7C9;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Пример цитирования</div><div style="font-size:12px;color:#7CC9E0;line-height:1.6;font-style:italic">"${l.use}"</div></div>`;
      document.getElementById('lawModal').classList.add('open');
    }
    function closeLawModal() { document.getElementById('lawModal').classList.remove('open'); }

    // ========== 6. OBJECTIONS ==========
    let currentCat = 'Все', searchTerm = '';
    function renderCatTabs() { const el = document.getElementById('catTabs'); el.innerHTML = ''; CATEGORIES.forEach(cat => { const btn = document.createElement('div'); btn.className = 'cat-tab' + (cat === currentCat ? ' active' : ''); const objData = currentObjMode === 'B2C' ? OBJECTIONS : OBJECTIONS_B2B; const cnt = cat === 'Все' ? objData.length : objData.filter(o => o.cat === cat).length; btn.textContent = cat + ' (' + cnt + ')'; btn.onclick = () => { currentCat = cat; renderCatTabs(); renderObjList(); }; el.appendChild(btn); }) }
    function filterObj() { searchTerm = document.getElementById('objSearch').value.toLowerCase().trim(); renderObjList(); }
    function renderObjList() {
      const container = document.getElementById('objList');
      const objData = currentObjMode === 'B2C' ? OBJECTIONS : OBJECTIONS_B2B; const filtered = objData.filter(o => (currentCat === 'Все' || o.cat === currentCat) && (!searchTerm || o.q.toLowerCase().includes(searchTerm) || o.script.toLowerCase().includes(searchTerm)));
      document.getElementById('objCount').textContent = 'Найдено: ' + filtered.length + ' из ' + objData.length + ' кейсов';
      if (!filtered.length) { container.innerHTML = '<div style="text-align:center;padding:40px;color:#4a5568;"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> Ничего не найдено</div>'; return; }
      const groups = {}; filtered.forEach(o => { if (!groups[o.cat]) groups[o.cat] = []; groups[o.cat].push(o); });
      let html = '';
      Object.entries(groups).forEach(([cat, items]) => {
        const c = CAT_COLORS[cat] || {};
        html += `<div class="obj-group"><div class="obj-group-title">${cat} — ${items.length} кейс${items.length < 5 ? 'а' : 'ов'}</div>`;
        items.forEach(o => {
          const lawsHtml = o.laws.length ? `<div class="laws-line">${o.laws.map(l => `<span class="law-chip" onclick="openLawByName('${l}')">${l} ГК РУз ↗</span>`).join('')}</div>` : '';
          const bs = c.bg ? `background:${c.bg};color:${c.color}` : '';
          html += `<div class="acc-item" id="acc-${o.id}"><div class="acc-header" onclick="toggleAcc(${o.id})"><span class="acc-num">#${String(o.id).padStart(2, '0')}</span><span class="acc-q">${o.q}</span><div class="acc-meta"><span class="acc-cat-badge" style="${bs}">${cat}</span><span class="acc-chevron">▼</span></div></div><div class="acc-body"><div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin:14px 0 6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg> Скрипт отработки</div><div class="script-box" id="script-${o.id}">${o.script}</div>${lawsHtml}<button class="copy-btn" id="copy-${o.id}" onclick="copyScript(${o.id})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg> Скопировать скрипт</button></div></div>`;
        });
        html += '</div>';
      });
      container.innerHTML = html;
    }
    function toggleAcc(id) { document.getElementById('acc-' + id).classList.toggle('open'); }
    function copyScript(id) { const t = document.getElementById('script-' + id).textContent; navigator.clipboard.writeText(t).then(() => { const b = document.getElementById('copy-' + id); b.textContent = '✅ Скопировано!'; b.classList.add('copied'); setTimeout(() => { b.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg> Скопировать скрипт'; b.classList.remove('copied'); }, 2000); }); }
    function openLawByName(name) {
      const lawData = currentObjMode === 'B2C' ? LAWS : LAWS_B2B;
      const idx = lawData.findIndex(l => l.art.includes(name));
      if (idx !== -1) { showSection('reglament'); setTimeout(() => openLawModal(idx), 300); }
    }

    let topChartIns = null;
    let botChartIns = null;

    function buildTopBottomCharts() {
      const topCanvas = document.getElementById('topChart');
      const botCanvas = document.getElementById('bottomChart');
      if (!topCanvas || !botCanvas) return;

      const empDataList = [];
      Object.entries(DASHBOARD_DATA).forEach(([name, emp]) => {
        if(name.includes('Промежуточный')) return;
        const m = emp.months[currentMonth]; if (!m) return;
        
        // Используем выбранный период для рейтинга
        let d;
        if (currentRatingPeriod === 'Все периоды') {
          d = _getEffectiveData(m);
        } else {
          d = m.periods?.find(p => p.period === currentRatingPeriod);
        }
        
        if (!d || d.tqs === undefined || isNaN(d.tqs)) return;
        empDataList.push({ name: name.split(' ')[0], tqs: parseFloat((d.tqs * 100).toFixed(1)) });
      });

      empDataList.sort((a, b) => b.tqs - a.tqs);

      const top5 = empDataList.slice(0, 5);
      const bot3 = empDataList.slice(-3).reverse();

      if(topChartIns) topChartIns.destroy();
      if(botChartIns) botChartIns.destroy();

      topChartIns = new Chart(topCanvas.getContext('2d'), {
          type: 'bar',
          data: { labels: top5.map(e => e.name), datasets: [{ label: 'TQS %', data: top5.map(e=>e.tqs), backgroundColor: '#22c55e', borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                     scales: { y: { min: 50, max: 100, ticks: {color:'#94a3b8'} }, x:{ ticks: {color:'#94a3b8'} } }
          }
      });

      botChartIns = new Chart(botCanvas.getContext('2d'), {
          type: 'bar',
          data: { labels: bot3.map(e => e.name), datasets: [{ label: 'TQS %', data: bot3.map(e=>e.tqs), backgroundColor: '#ef4444', borderRadius: 4 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } },
                     scales: { y: { min: 20, max: 100, ticks: {color:'#94a3b8'} }, x:{ ticks: {color:'#94a3b8'} } }
          }
      });
    }

    // ========== 7. INIT ==========
    document.addEventListener('DOMContentLoaded', () => {
      initFilters();
      initHeatmapModeTabs();
      loadCrmActionsData();
      
      // Инициализация для страницы Rating
      if (document.getElementById('leaderboardBody')) {
        buildLeaderboard();
        buildTopBottomCharts();
      } else {
        updateDashboard();
      }
    });

    // ========== EXCEL EXPORT ==========
    function exportRatingToExcel() {
      const data = window.lastLeaderboardData;
      if (!data || !data.length) {
        alert('Нет данных для экспорта — выберите месяц с загруженными оценками.');
        return;
      }
      const headers = ['#', 'Оператор', 'ТЕК.TQS %', 'Δ TQS %', 'TQS период %', 'Динамика периода %', 'Средний TQS (3 периода) %'];
      const rows = data.map((ep, idx) => [
        idx + 1,
        ep.name,
        Math.round(ep.tqs * 10) / 10,
        Math.round(ep.trend * 10) / 10,
        Math.round(ep.periodTqs * 10) / 10,
        Math.round(ep.periodTrend * 10) / 10,
        Math.round(ep.avgTqs3 * 10) / 10,
      ]);
      downloadXlsx(`Рейтинг_${currentMonth.replace(' ', '_')}_${todayForFilename()}.xlsx`, [
        { name: currentMonth, headers, rows },
      ]);
    }
    window.exportRatingToExcel = exportRatingToExcel;

    function exportAnalyticsToExcel() {
      const rows = [];
      Object.keys(DASHBOARD_DATA).sort().forEach(name => {
        if (name.includes('Промежуточный')) return;
        const m = DASHBOARD_DATA[name]?.months?.[currentMonth];
        if (!m) return;
        const d = _getEffectiveData(m);
        if (!d || !d.svp) return;
        const row = [name];
        SVP_KEYS.forEach(k => row.push(d.svp[k] !== undefined ? Math.round(d.svp[k] * 1000) / 10 : ''));
        row.push(d.tqs !== undefined ? Math.round(d.tqs * 1000) / 10 : '');
        row.push(d.activity_count || '');
        row.push(d.aht || '');
        rows.push(row);
      });
      if (!rows.length) {
        alert('Нет данных для экспорта — выберите месяц с загруженными оценками.');
        return;
      }
      const headers = ['Оператор', ...SVP_KEYS, 'Итого %', 'Звонков', 'AHT'];
      downloadXlsx(`Аналитика_СВП_${currentMonth.replace(' ', '_')}_${todayForFilename()}.xlsx`, [
        { name: currentMonth, headers, rows },
      ]);
    }
    window.exportAnalyticsToExcel = exportAnalyticsToExcel;

    window.showSection = showSection; window.toggleTheme = toggleTheme; window.showEmployee = showEmployee;
    window.openLawModal = openLawModal; window.closeLawModal = closeLawModal; window.copyScript = copyScript;
    window.filterObj = filterObj; window.toggleAcc = toggleAcc; window.openLawByName = openLawByName;
    window.toggleSidebar = toggleSidebar;
