const SERVICE_RULES = [
  {
    category: 'VVS',
    keywords: ['läcka', 'läcker', 'vatten', 'rör', 'avlopp', 'stopp', 'wc', 'toalett', 'blandare', 'badrum'],
  },
  {
    category: 'El',
    keywords: ['ström', 'el', 'säkring', 'jordfelsbrytare', 'laddbox', 'uttag', 'belysning', 'spänning'],
  },
  {
    category: 'Ventilation',
    keywords: ['ventilation', 'fläkt', 'luftflöde', 'inomhusluft', 'ovk', 'kanal', 'frånluft'],
  },
  {
    category: 'Värmepump',
    keywords: ['värmepump', 'bergvärme', 'luftvärme', 'luft-vatten', 'kompressor', 'ingen värme'],
  },
  {
    category: 'Solenergi',
    keywords: ['solcell', 'solceller', 'batteri', 'energilager', 'växelriktare', 'solpanel'],
  },
  {
    category: 'Lås och port',
    keywords: ['lås', 'utlåst', 'nyckel', 'port', 'garageport', 'passersystem', 'dörr'],
  },
  {
    category: 'Bygg och mark',
    keywords: ['bygg', 'renovera', 'tak', 'fasad', 'staket', 'markarbete', 'plåt', 'snickeri'],
  },
];

const COMMON_REQUIRED_FIELDS = [
  ['contactName', 'kontaktperson'],
  ['contactChannel', 'svarskanal'],
  ['location', 'adress eller ort'],
  ['description', 'beskrivning av ärendet'],
];

const CONDITIONAL_FIELDS = {
  VVS: [['propertyType', 'typ av fastighet']],
  El: [['propertyType', 'typ av fastighet']],
  Ventilation: [['propertyType', 'typ av fastighet']],
  Värmepump: [
    ['propertyType', 'typ av fastighet'],
    ['currentSystem', 'nuvarande anläggning eller modell'],
  ],
  Solenergi: [
    ['propertyType', 'typ av fastighet'],
    ['currentSystem', 'befintlig elanläggning eller huvudsäkring'],
  ],
  'Lås och port': [['propertyType', 'typ av objekt eller dörr/port']],
  'Bygg och mark': [['propertyType', 'typ av fastighet eller arbetsplats']],
};

const EMERGENCY_TERMS = [
  'akut',
  'översväm',
  'vatten forsar',
  'stor läcka',
  'brand',
  'röklukt',
  'gaslukt',
  'utlåst',
  'avloppsvatten',
  'helt strömlöst',
];

const HIGH_TERMS = [
  'idag',
  'snarast',
  'så fort som möjligt',
  'ingen värme',
  'strömmen borta',
  'stopp i avlopp',
  'kan inte öppna',
  'driftstopp',
];

function normalize(value) {
  return String(value ?? '')
    .toLocaleLowerCase('sv-SE')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

export function classifyService(inquiry) {
  const haystack = normalize(`${inquiry.subject ?? ''} ${inquiry.description ?? ''}`);
  const scored = SERVICE_RULES.map((rule) => {
    const matches = rule.keywords.filter((keyword) => haystack.includes(keyword));
    return { category: rule.category, matches };
  }).sort((a, b) => b.matches.length - a.matches.length);

  const winner = scored[0];
  if (!winner || winner.matches.length === 0) {
    return {
      category: 'Övrigt',
      confidence: 0.32,
      matchedKeywords: [],
      sourceFields: ['subject', 'description'],
    };
  }

  const runnerUp = scored[1]?.matches.length ?? 0;
  const separation = Math.max(0, winner.matches.length - runnerUp);
  const confidence = Math.min(0.96, 0.54 + winner.matches.length * 0.09 + separation * 0.04);
  return {
    category: winner.category,
    confidence: Number(confidence.toFixed(2)),
    matchedKeywords: winner.matches,
    sourceFields: ['subject', 'description'],
  };
}

export function classifyUrgency(inquiry) {
  const haystack = normalize(`${inquiry.subject ?? ''} ${inquiry.description ?? ''}`);
  const emergencyMatch = EMERGENCY_TERMS.find((term) => haystack.includes(term));
  if (emergencyMatch) {
    return { level: 'AKUT', reason: `Matchade uttrycket “${emergencyMatch}”`, score: 3 };
  }
  const highMatch = HIGH_TERMS.find((term) => haystack.includes(term));
  if (highMatch) {
    return { level: 'HÖG', reason: `Matchade uttrycket “${highMatch}”`, score: 2 };
  }
  return { level: 'NORMAL', reason: 'Inget uttryck för akut eller brådskande läge hittades', score: 1 };
}

export function findMissingFields(inquiry, category) {
  const required = [...COMMON_REQUIRED_FIELDS, ...(CONDITIONAL_FIELDS[category] ?? [])];
  return required
    .filter(([key]) => !isPresent(inquiry[key]))
    .map(([key, label]) => ({ key, label }));
}

function addBusinessDays(date, days) {
  const output = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    output.setUTCDate(output.getUTCDate() + 1);
    const weekday = output.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return output;
}

export function calculateFollowUpDate(now, urgencyLevel) {
  const base = new Date(now);
  if (Number.isNaN(base.getTime())) throw new Error('now must be a valid ISO date');
  if (urgencyLevel === 'AKUT') return base.toISOString();
  return addBusinessDays(base, urgencyLevel === 'HÖG' ? 1 : 2).toISOString();
}

function createCustomerDraft(inquiry, category, missingFields) {
  const name = isPresent(inquiry.contactName) ? String(inquiry.contactName).trim() : 'hej';
  if (missingFields.length > 0) {
    const questions = missingFields.map((field) => `• ${field.label}`).join('\n');
    return `Hej ${name}!\n\nTack för din förfrågan om ${category.toLocaleLowerCase('sv-SE')}. För att en medarbetare ska kunna bedöma nästa steg behöver vi komplettera med:\n${questions}\n\nDetta är ett utkast och skickas först efter manuell granskning.`;
  }
  return `Hej ${name}!\n\nTack för din förfrågan om ${category.toLocaleLowerCase('sv-SE')}. Underlaget ser komplett ut för en första bedömning. En medarbetare granskar nu ärendet och bekräftar nästa steg.\n\nDetta är ett utkast och skickas först efter manuell granskning.`;
}

function stableId(inquiry) {
  const seed = normalize(`${inquiry.subject ?? ''}|${inquiry.location ?? ''}|${inquiry.contactName ?? ''}`);
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `DEMO-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}

export function prepareWorkflow(inquiry, now = '2026-08-19T12:00:00.000Z') {
  if (!inquiry || typeof inquiry !== 'object' || Array.isArray(inquiry)) {
    throw new TypeError('inquiry must be an object');
  }
  const classification = classifyService(inquiry);
  const urgency = classifyUrgency(inquiry);
  const missingFields = findMissingFields(inquiry, classification.category);
  const followUpAt = calculateFollowUpDate(now, urgency.level);
  const id = stableId(inquiry);

  const log = [
    { state: 'RECEIVED', at: now, retryable: true },
    { state: 'CLASSIFIED', at: now, retryable: true },
    { state: 'INFORMATION_CHECKED', at: now, retryable: true },
    { state: 'DRAFT_CREATED', at: now, retryable: true },
    { state: 'INTERNAL_TASK_CREATED', at: now, retryable: true },
    { state: 'APPROVAL_REQUIRED', at: now, retryable: false },
    { state: 'FOLLOW_UP_SCHEDULED', at: followUpAt, retryable: true },
  ];

  return {
    id,
    synthetic: true,
    received: {
      subject: String(inquiry.subject ?? '').trim(),
      description: String(inquiry.description ?? '').trim(),
      location: String(inquiry.location ?? '').trim(),
      contactName: String(inquiry.contactName ?? '').trim(),
      contactChannel: String(inquiry.contactChannel ?? '').trim(),
    },
    classification,
    urgency,
    missingFields,
    responseDraft: createCustomerDraft(inquiry, classification.category, missingFields),
    internalTask: {
      title: `${urgency.level}: ${classification.category} — ${inquiry.location || 'plats saknas'}`,
      priority: urgency.level,
      ownerRole: 'Servicekoordinator',
      checklist: [
        'Verifiera klassificering och brådska',
        'Kontrollera kompletteringsfrågor',
        'Godkänn eller redigera svarutkast',
        'Välj nästa ansvariga person',
      ],
    },
    approval: {
      required: true,
      status: 'AWAITING_HUMAN_APPROVAL',
      externalActionAllowed: false,
      reason: 'Demonstrationen får aldrig skicka, boka eller skriva till ett externt system.',
    },
    followUpAt,
    log,
    riskFlags: [
      ...(urgency.level === 'AKUT' ? ['Akutmarkering måste bekräftas av människa'] : []),
      ...(classification.confidence < 0.6 ? ['Låg klassificeringssäkerhet'] : []),
      ...(missingFields.length ? ['Ofullständigt underlag'] : []),
    ],
  };
}

export function evaluateFixtureBatch(inquiries, now = '2026-08-19T12:00:00.000Z') {
  if (!Array.isArray(inquiries)) throw new TypeError('inquiries must be an array');
  return inquiries.map((inquiry) => prepareWorkflow(inquiry, now));
}
