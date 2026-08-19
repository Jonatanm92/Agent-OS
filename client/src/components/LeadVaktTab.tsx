import { useMemo, useState } from 'react';

type LeadSource = 'missed-call' | 'website' | 'email';

type LeadAnalysis = {
  category: string;
  priority: 'Akut' | 'Hög' | 'Normal';
  confidence: number;
  missing: string[];
  questions: string[];
  draft: string;
  nextAction: string;
};

type Prospect = {
  company: string;
  area: string;
  channel: string;
  angle: string;
};

const SAMPLE_INQUIRIES = [
  'Hej, vår Nibe-värmepump visar larm 50 och huset blir kallare. Kan någon hjälpa oss? Vi bor i Vargön.',
  'Vi vill byta varmvattenberedare i en villa och vill gärna ha pris och ungefärlig leveranstid.',
  'Det droppar från en koppling under diskhon. Vi kan skicka bild men behöver veta när ni kan komma.',
];

const PROSPECTS: Prospect[] = [
  {
    company: 'Vänersnäs Rörservice',
    area: 'Vargön / Vänersborg',
    channel: 'Telefon, SMS och e-post',
    angle: 'Flera inkommande kanaler kan samlas i en enkel leadkö med snabb första återkoppling.',
  },
  {
    company: 'Rörpulsen VVS',
    area: 'Trollhättan / Trestad',
    channel: 'Telefon och webbformulär',
    angle: 'Akuta och planerade ärenden behöver olika prioritet och olika följdfrågor.',
  },
  {
    company: 'Hisingens Kylservice',
    area: 'Trollhättan / Vänersborg',
    channel: 'Telefon, e-post och felanmälan',
    angle: 'Modell, fabrikat och felkod kan samlas in innan en tekniker tar över.',
  },
  {
    company: 'Hogstorps Rör',
    area: 'Uddevalla',
    channel: 'Telefon och offertkontakt',
    angle: 'Offertförfrågningar kan kvalificeras direkt utan att tappa personlig service.',
  },
  {
    company: 'mvsrör',
    area: 'Trollhättan / Vänersborg',
    channel: 'Telefon och webbformulär',
    angle: 'Snabb respons är redan en del av löftet; LeadVakt gör den mätbar och konsekvent.',
  },
];

const OUTREACH_TEMPLATE = `Hej [namn],

jag såg att ni tar emot service- och offertförfrågningar via telefon eller webb. Jag har byggt en liten demo för VVS- och serviceföretag som svarar direkt, samlar in saknad information och lägger rätt nästa uppgift till en människa — utan att ersätta den personliga kontakten.

Jag söker tre företag till en founder-pilot: 2 900 kr exkl. moms för installation och 30 dagar. Betalning först när den överenskomna demon är installerad och godkänd. Ingen bindningstid.

Är en 10-minuters genomgång relevant för er?`;

export function LeadVaktTab() {
  const [source, setSource] = useState<LeadSource>('website');
  const [inquiry, setInquiry] = useState(SAMPLE_INQUIRIES[0]);
  const [submittedInquiry, setSubmittedInquiry] = useState(SAMPLE_INQUIRIES[0]);
  const [copied, setCopied] = useState(false);
  const [monthlyLeads, setMonthlyLeads] = useState(45);
  const [missedPercent, setMissedPercent] = useState(22);
  const [averageOrder, setAverageOrder] = useState(8500);
  const [closeRate, setCloseRate] = useState(32);
  const [recoveryRate, setRecoveryRate] = useState(40);

  const analysis = useMemo(
    () => analyseInquiry(submittedInquiry, source),
    [submittedInquiry, source],
  );

  const roi = useMemo(() => {
    const missedLeads = monthlyLeads * (missedPercent / 100);
    const recoveredLeads = missedLeads * (recoveryRate / 100);
    const recoveredOrders = recoveredLeads * (closeRate / 100);
    const recoveredRevenue = recoveredOrders * averageOrder;
    return { missedLeads, recoveredLeads, recoveredOrders, recoveredRevenue };
  }, [monthlyLeads, missedPercent, averageOrder, closeRate, recoveryRate]);

  async function copyOutreach() {
    try {
      await navigator.clipboard.writeText(OUTREACH_TEMPLATE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="lead-vakt">
      <section className="lv-hero">
        <div className="lv-hero-copy">
          <div className="lv-eyebrow">
            <span className="lv-live-dot" /> Revenue mode · första betalande pilot
          </div>
          <h2>En missad förfrågan ska inte bli någon annans jobb.</h2>
          <p>
            <strong>LeadVakt</strong> hjälper små VVS-, värmepumps- och serviceföretag att
            svara snabbt, samla in rätt uppgifter och lämna över till en människa medan
            kunden fortfarande är varm.
          </p>
          <div className="lv-hero-actions">
            <button
              className="lv-button lv-button-primary"
              onClick={() => document.getElementById('lv-demo')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Kör säljdemon
            </button>
            <button
              className="lv-button lv-button-secondary"
              onClick={() => document.getElementById('lv-sprint')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Öppna första-kund-sprinten
            </button>
          </div>
        </div>

        <aside className="lv-mission-card">
          <div className="lv-card-label">Dagens kommersiella mål</div>
          <div className="lv-mission-number">1</div>
          <div className="lv-mission-title">bokad demo med rätt företag</div>
          <div className="lv-mission-grid">
            <div><span>5</span> personliga kontakter</div>
            <div><span>3</span> founder-platser</div>
            <div><span>2 900 kr</span> pilotpris</div>
            <div><span>0 kr</span> påhittad intäkt</div>
          </div>
          <p className="lv-disclaimer">Målet är verklig försäljning. Inga demodata räknas som intäkt.</p>
        </aside>
      </section>

      <section className="lv-proof-strip" aria-label="Produktlöfte">
        <div><strong>Under 1 minut</strong><span>första svar</span></div>
        <div><strong>3–5 frågor</strong><span>innan mänskligt övertagande</span></div>
        <div><strong>Ingen robotförsäljare</strong><span>människan godkänner offert och bokning</span></div>
        <div><strong>30 dagar</strong><span>founder-pilot utan bindningstid</span></div>
      </section>

      <section id="lv-demo" className="lv-section">
        <div className="lv-section-heading">
          <div>
            <span className="lv-kicker">Interaktiv säljdemo</span>
            <h3>Visa resultatet på kundens egen typ av förfrågan</h3>
          </div>
          <span className="lv-demo-badge">SIMULERAD DEMO · INGET SKICKAS</span>
        </div>

        <div className="lv-demo-grid">
          <div className="lv-panel lv-input-panel">
            <label className="lv-label">Inkommande kanal</label>
            <div className="lv-source-picker">
              {([
                ['missed-call', 'Missat samtal'],
                ['website', 'Webbformulär'],
                ['email', 'E-post'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  className={source === value ? 'active' : ''}
                  onClick={() => setSource(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="lv-label" htmlFor="lv-inquiry">Kundens meddelande</label>
            <textarea
              id="lv-inquiry"
              value={inquiry}
              onChange={(event) => setInquiry(event.target.value)}
              rows={7}
            />

            <div className="lv-sample-row">
              {SAMPLE_INQUIRIES.map((sample, index) => (
                <button key={sample} onClick={() => setInquiry(sample)}>
                  Exempel {index + 1}
                </button>
              ))}
            </div>

            <button
              className="lv-button lv-button-primary lv-full"
              disabled={!inquiry.trim()}
              onClick={() => setSubmittedInquiry(inquiry.trim())}
            >
              Analysera och skapa svar
            </button>
          </div>

          <div className="lv-panel lv-result-panel">
            <div className="lv-result-top">
              <div>
                <span className="lv-label">Leadtyp</span>
                <h4>{analysis.category}</h4>
              </div>
              <span className={`lv-priority lv-priority-${analysis.priority.toLowerCase()}`}>
                {analysis.priority} prioritet
              </span>
            </div>

            <div className="lv-confidence">
              <span>Automatisk klassificering</span>
              <div><i style={{ width: `${analysis.confidence}%` }} /></div>
              <strong>{analysis.confidence}%</strong>
            </div>

            <div className="lv-result-columns">
              <div>
                <span className="lv-label">Saknas innan övertagande</span>
                <ul>
                  {analysis.missing.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div>
                <span className="lv-label">Nästa mänskliga åtgärd</span>
                <p>{analysis.nextAction}</p>
              </div>
            </div>

            <div className="lv-draft">
              <div className="lv-draft-head">
                <span>Föreslaget första svar</span>
                <span>väntar på godkännande</span>
              </div>
              <p>{analysis.draft}</p>
            </div>

            <div className="lv-question-chips">
              {analysis.questions.map((question) => <span key={question}>{question}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section className="lv-section">
        <div className="lv-section-heading">
          <div>
            <span className="lv-kicker">ROI-kalkylator</span>
            <h3>Gör kostnaden begriplig innan kunden säger “AI”</h3>
          </div>
          <span className="lv-demo-badge">ANTAGANDEN · EJ KUNDRESULTAT</span>
        </div>

        <div className="lv-roi-grid">
          <div className="lv-panel lv-roi-inputs">
            <NumberField label="Förfrågningar / månad" value={monthlyLeads} onChange={setMonthlyLeads} min={1} max={1000} />
            <NumberField label="Missas eller får sent svar (%)" value={missedPercent} onChange={setMissedPercent} min={0} max={100} suffix="%" />
            <NumberField label="Genomsnittligt ordervärde" value={averageOrder} onChange={setAverageOrder} min={500} max={500000} suffix="kr" />
            <NumberField label="Normal stängningsgrad" value={closeRate} onChange={setCloseRate} min={0} max={100} suffix="%" />
            <NumberField label="Andel missade leads som återvinns" value={recoveryRate} onChange={setRecoveryRate} min={0} max={100} suffix="%" />
          </div>

          <div className="lv-panel lv-roi-result">
            <span className="lv-card-label">Illustrativ månadseffekt</span>
            <strong className="lv-roi-money">{formatCurrency(roi.recoveredRevenue)}</strong>
            <p>möjligt återvunnet ordervärde enligt inmatade antaganden</p>
            <div className="lv-roi-breakdown">
              <div><span>{roi.missedLeads.toFixed(1)}</span> riskerade leads</div>
              <div><span>{roi.recoveredLeads.toFixed(1)}</span> återkopplade leads</div>
              <div><span>{roi.recoveredOrders.toFixed(1)}</span> möjliga order</div>
              <div><span>{formatCurrency(2900)}</span> founder-pilot</div>
            </div>
            <small>
              Kalkylen är ett diskussionsunderlag. Verkligt utfall beror på leadkvalitet,
              svarstid, kapacitet, pris och försäljning.
            </small>
          </div>
        </div>
      </section>

      <section id="lv-sprint" className="lv-section">
        <div className="lv-section-heading">
          <div>
            <span className="lv-kicker">Första-kund-sprint</span>
            <h3>Fem lokala företag. Fem personliga observationer. Inget massutskick.</h3>
          </div>
          <button className="lv-button lv-button-secondary" onClick={copyOutreach}>
            {copied ? 'Kopierad' : 'Kopiera grundmeddelande'}
          </button>
        </div>

        <div className="lv-prospect-list">
          {PROSPECTS.map((prospect, index) => (
            <article key={prospect.company} className="lv-prospect">
              <span className="lv-prospect-index">0{index + 1}</span>
              <div>
                <h4>{prospect.company}</h4>
                <p>{prospect.area} · {prospect.channel}</p>
              </div>
              <div className="lv-prospect-angle">
                <span>Personlig demo-vinkel</span>
                <p>{prospect.angle}</p>
              </div>
              <span className="lv-status-chip">redo för research</span>
            </article>
          ))}
        </div>

        <div className="lv-sprint-footer">
          <div>
            <strong>Arbetsordning</strong>
            <span>1. kontrollera kontaktperson · 2. spela in 60 sek personlig demo · 3. skicka · 4. följ upp · 5. boka 10 min</span>
          </div>
          <div>
            <strong>Ägargrind som återstår</strong>
            <span>Du godkänner de fem faktiska meddelandena innan de skickas. Inget annat behöver frysas.</span>
          </div>
        </div>
      </section>

      <section className="lv-offer">
        <div>
          <span className="lv-kicker">Founder-erbjudande · tre platser</span>
          <h3>LeadVakt 30</h3>
          <p>
            En avgränsad inkommande kanal, omedelbart svar, kvalificeringsfrågor,
            mänsklig överlämning, uppföljningskö och enkel resultatrapport.
          </p>
        </div>
        <div className="lv-price">
          <strong>2 900 kr</strong>
          <span>exkl. moms · installation + 30 dagar</span>
          <small>Därefter valfritt 990 kr/mån. Ingen bindningstid.</small>
        </div>
        <ul>
          <li>Betalning när den avtalade installationen är demonstrerad och godkänd</li>
          <li>Ingen autonom offert, bokning eller utskick utan företagets regler</li>
          <li>En tydlig kanal och ett tydligt resultat — inte ett stort AI-projekt</li>
        </ul>
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <label className="lv-number-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(clamp(Number(event.target.value), min, max))}
        />
        {suffix && <b>{suffix}</b>}
      </div>
    </label>
  );
}

function analyseInquiry(text: string, source: LeadSource): LeadAnalysis {
  const normalized = text.toLocaleLowerCase('sv-SE');
  const urgentTerms = ['läcka', 'läcker', 'droppar', 'översväm', 'utan värme', 'kallt', 'stopp', 'akut', 'larm'];
  const highTerms = ['fel', 'service', 'reparation', 'värmepump', 'varmvatten'];
  const isUrgent = urgentTerms.some((term) => normalized.includes(term));
  const isHigh = highTerms.some((term) => normalized.includes(term));

  let category = 'Allmän serviceförfrågan';
  if (/(värmepump|nibe|ctc|ivt|thermia|daikin|mitsubishi)/.test(normalized)) {
    category = 'Värmepump · service/felsökning';
  } else if (/(läcka|läcker|dropp|rör|koppling|avlopp|stopp)/.test(normalized)) {
    category = 'VVS · serviceärende';
  } else if (/(offert|pris|install|byta|renover)/.test(normalized)) {
    category = 'Offert · planerad installation';
  }

  const missing: string[] = [];
  if (!/(?:\+46|0)[\d\s-]{7,}/.test(text)) missing.push('Telefonnummer');
  if (!/(gata|vägen|gränd|allé|adress|\b\d{3}\s?\d{2}\b)/i.test(text)) missing.push('Fullständig adress eller postnummer');
  if (!/(idag|imorgon|måndag|tisdag|onsdag|torsdag|fredag|förmiddag|eftermiddag|klockan|kl\.)/i.test(text)) {
    missing.push('När kunden kan ta emot besök eller samtal');
  }
  if (category.startsWith('Värmepump') && !/(modell|larmkod|felkod|nibe\s?\w*\d|ctc\s?\w*\d)/i.test(text)) {
    missing.push('Fabrikat, modell och eventuell felkod');
  }
  if (category.startsWith('VVS') && !/(bild|foto)/i.test(text)) missing.push('Bild på problemet om möjligt');

  const questions = missing.slice(0, 4).map((item) => questionFor(item));
  const priority: LeadAnalysis['priority'] = isUrgent ? 'Akut' : isHigh ? 'Hög' : 'Normal';
  const confidence = category === 'Allmän serviceförfrågan' ? 78 : 93;
  const sourceIntro = source === 'missed-call'
    ? 'Hej! Vi såg att du försökte nå oss.'
    : 'Hej! Tack för din förfrågan.';
  const questionSentence = questions.length
    ? ` För att rätt person ska kunna hjälpa dig direkt behöver vi bara veta: ${questions.join(' ')}`
    : ' Vi har de viktigaste uppgifterna och lämnar nu ärendet till rätt person.';

  return {
    category,
    priority,
    confidence,
    missing: missing.length ? missing : ['Inga kritiska uppgifter saknas'],
    questions: questions.length ? questions : ['Bekräfta bästa tid för återkoppling.'],
    draft: `${sourceIntro} Vi har registrerat ärendet som “${category}” med ${priority.toLocaleLowerCase('sv-SE')} prioritet.${questionSentence} En medarbetare återkommer så snart uppgifterna är kompletta.`,
    nextAction: priority === 'Akut'
      ? 'Ring upp och bekräfta säkerhetsläget innan ärendet planeras.'
      : category.startsWith('Offert')
        ? 'Granska underlaget och föreslå hembesök eller offertsteg.'
        : 'Granska uppgifterna och tilldela rätt tekniker eller återuppringning.',
  };
}

function questionFor(item: string): string {
  switch (item) {
    case 'Telefonnummer':
      return 'Vilket nummer når vi dig på?';
    case 'Fullständig adress eller postnummer':
      return 'Vilken adress gäller det?';
    case 'När kunden kan ta emot besök eller samtal':
      return 'När passar återkoppling eller besök bäst?';
    case 'Fabrikat, modell och eventuell felkod':
      return 'Vilket fabrikat, modell och felkod gäller det?';
    case 'Bild på problemet om möjligt':
      return 'Kan du skicka en bild på problemet?';
    default:
      return `Kan du komplettera med ${item.toLocaleLowerCase('sv-SE')}?`;
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
