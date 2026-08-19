import { LeadVaktTab } from './LeadVaktTab';

export function LeadVaktPublic() {
  return (
    <div className="public-leadvakt-shell">
      <section className="lv-hero public-lv-hero">
        <div className="lv-hero-copy">
          <div className="lv-eyebrow">
            <span className="lv-live-dot" /> Snabb återkoppling för serviceföretag
          </div>
          <h2>En missad förfrågan ska inte bli någon annans jobb.</h2>
          <p>
            <strong>LeadVakt</strong> hjälper VVS-, värmepumps- och serviceföretag att
            svara snabbt, samla in rätt uppgifter och lämna över till en människa medan
            kunden fortfarande är varm.
          </p>
          <div className="lv-hero-actions">
            <button
              className="lv-button lv-button-primary"
              onClick={() => document.getElementById('lv-demo')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Testa demon
            </button>
            <button
              className="lv-button lv-button-secondary"
              onClick={() => document.querySelector('.lv-offer')?.scrollIntoView({ behavior: 'smooth' })}
            >
              Se founder-piloten
            </button>
          </div>
        </div>

        <aside className="lv-mission-card">
          <div className="lv-card-label">Founder-pilot · tre platser</div>
          <div className="lv-mission-number lv-mission-price">2 900</div>
          <div className="lv-mission-title">kr exkl. moms · installation + 30 dagar</div>
          <div className="lv-mission-grid">
            <div><span>1</span> inkommande kanal</div>
            <div><span>30 dagar</span> användning och korrigering</div>
            <div><span>990 kr</span> valfri fortsättning</div>
            <div><span>0 mån</span> bindningstid</div>
          </div>
          <p className="lv-disclaimer">
            Betalning när den avtalade installationen är demonstrerad och godkänd.
          </p>
        </aside>
      </section>

      <LeadVaktTab />
    </div>
  );
}
