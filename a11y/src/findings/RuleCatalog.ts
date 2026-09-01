import type { LocalizedSteps, LocalizedText } from '../core/Copy.js';
import type { Confidence, Severity } from '../core/Types.js';

export interface RuleDefinition {
  /** WCAG success criteria this rule maps to, when the mapping is reliable. */
  wcag: string[];
  baseSeverity: Severity;
  confidence: Confidence;
  title: LocalizedText;
  /** What a user should be able to do. */
  expected: LocalizedText;
  /**
   * What was observed, as a template over the probe's parameters. Keeping the
   * wording here rather than in the probes is what makes findings consistent
   * across engines and translatable per market.
   */
  observed?: LocalizedText;
  /** Who is blocked and from what — concrete, never "may impact some users". */
  userImpact: LocalizedText;
  remediation: LocalizedText;
  reproduction?: LocalizedSteps;
  /** True when one occurrence usually means a shared component is at fault. */
  componentScoped?: boolean;
}

const t = (sv: string, en: string): LocalizedText => ({ sv, en });
const steps = (sv: string[], en: string[]): LocalizedSteps => ({ sv, en });

/**
 * The knowledge base behind every finding: WCAG mapping, severity, and the
 * words a customer actually reads. Swedish is the first market, English is the
 * fallback and the language of the technical fields.
 */
export const RULE_CATALOG: Record<string, RuleDefinition> = {
  // ------------------------------------------------------- keyboard / focus
  'keyboard.mouse-only-control': {
    wcag: ['2.1.1', '4.1.2'],
    baseSeverity: 'critical',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Kontrollen går bara att använda med mus', 'Control can only be operated with a mouse'),
    expected: t(
      'Allt som går att klicka på ska också gå att nå med Tab och aktivera med Enter eller mellanslag.',
      'Every control that can be clicked can also be reached with Tab and activated with Enter or Space.',
    ),
    observed: t(
      '”{name}” {reason} men är inget vanligt formulärelement och saknar tabindex. Den kan därför aldrig få tangentbordsfokus och kan inte aktiveras med Enter eller mellanslag.',
      '"{name}" {reason} but is not a native control and has no tabindex, so it can never receive keyboard focus or be activated with Enter/Space.',
    ),
    userImpact: t(
      'Kunder som navigerar med tangentbord — skärmläsaranvändare, personer med tremor eller belastningsskador, och alla som använder switchstyrning — kan inte använda kontrollen alls. Ligger den i köpresan kan de inte slutföra köpet.',
      'Customers who navigate with a keyboard — including screen reader users, people with tremor or RSI, and anyone using switch access — cannot use this control at all. If it sits in the buying journey, they cannot complete the purchase.',
    ),
    remediation: t(
      'Använd ett riktigt <button> (eller <a href> för navigering) i stället för div/span, alternativt lägg till tabindex="0", role="button" och hantering av Enter och mellanslag. Native-element är att föredra: fokus, aktivering och uppläsning följer med gratis.',
      'Use a native <button> (or <a href> for navigation) instead of a div/span, or add tabindex="0", role="button" and key handlers for Enter and Space. Native elements are strongly preferred — they bring focus, activation and announcement for free.',
    ),
    reproduction: steps(
      ['Lägg musen åt sidan.', 'Tryck Tab upprepade gånger från sidans början.', 'Fokus når aldrig kontrollen.'],
      ['Put the mouse aside.', 'Press Tab repeatedly from the top of the page.', 'Focus never reaches the control.'],
    ),
  },
  'keyboard.focus-trap': {
    wcag: ['2.1.2'],
    baseSeverity: 'critical',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Tangentbordsfokus fastnar', 'Keyboard focus is trapped'),
    expected: t(
      'Tab flyttar alltid fokus vidare; en tangentbordsanvändare kan lämna varje komponent hen kommit in i.',
      'Tab always moves focus onwards; a keyboard user can leave any component they entered.',
    ),
    observed: t(
      'Fokus stannar kvar på ”{name}” — ytterligare tre Tab-tryck flyttar inte fokus någonstans, så en tangentbordsanvändare fastnar här.',
      'Keyboard focus stays on "{name}" — pressing Tab three more times does not move focus anywhere else, so a keyboard user is stuck at this point in the page.',
    ),
    userImpact: t(
      'En tangentbordsanvändare som når hit kan inte gå vidare och når inte resten av sidan. Enda vägen ut är att ladda om sidan — i praktiken slutar besöket här.',
      'A keyboard user who reaches this point cannot move on and cannot reach the rest of the page. The only way out is reloading the page — in practice the session ends here.',
    ),
    remediation: t(
      'Ta bort hanteraren som fångar Tab-tangenten. Är komponenten en modal dialog: implementera en korrekt fokusloop där Escape stänger och fokus återgår till knappen som öppnade den.',
      'Remove the handler that swallows the Tab key, or, if the component is a modal dialog, implement a proper focus loop that also allows Escape to close and return focus to the trigger.',
    ),
  },
  'keyboard.focus-in-aria-hidden': {
    wcag: ['1.3.1', '4.1.2'],
    baseSeverity: 'high',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Fokus hamnar i en yta som är dold för hjälpmedel', 'Focus moves into a region hidden from assistive technology'),
    expected: t('Allt som kan få fokus exponeras också för hjälpmedel.', 'Anything that can receive focus is exposed to assistive technology.'),
    observed: t(
      'Tab-ordningen når ”{name}”, som ligger inuti en behållare med aria-hidden="true". Skärmläsaren har fått besked att ignorera elementet, samtidigt som fokus flyttas dit.',
      'Tab order reaches "{name}", which sits inside an aria-hidden="true" container. Screen reader users get focus moved to an element their screen reader is told to ignore.',
    ),
    userImpact: t(
      'Skärmläsaranvändare tabbar till en kontroll som skärmläsaren inte läser upp, så ingenting händer hörbart. De tappar bort var de är på sidan.',
      'Screen reader users tab to a control their screen reader has been told to ignore, so nothing is announced. They lose their place in the page.',
    ),
    remediation: t(
      'Ta antingen bort aria-hidden="true" från behållaren, eller gör innehållet ofokuserbart medan det är dolt (attributet inert, eller tabindex="-1" tillsammans med display:none).',
      'Either remove aria-hidden="true" from the container, or make its contents unfocusable while hidden (inert attribute, or tabindex="-1" plus display:none).',
    ),
  },
  'keyboard.focus-on-hidden-element': {
    wcag: ['2.4.3', '2.4.7'],
    baseSeverity: 'high',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Fokus flyttas till ett element utanför skärmen', 'Focus moves to an off-screen or collapsed element'),
    expected: t(
      'Stängda menyer och utfällbara paneler tas bort ur tab-ordningen tills de öppnas.',
      'Collapsed menus and off-canvas panels are removed from the tab order until they are opened.',
    ),
    observed: t(
      'Tab-ordningen innehåller ”{name}”, som inte syns på skärmen ({width}×{height} px). Seende tangentbordsanvändare tappar bort var fokus är.',
      'Tab order includes "{name}", which is not visible on screen ({width}×{height}px). Sighted keyboard users lose track of where focus is.',
    ),
    userImpact: t(
      'Seende tangentbordsanvändare ser fokusmarkeringen försvinna under flera Tab-tryck medan fokus ligger i en stängd meny. De flesta tror att sidan är trasig och ger upp.',
      'Sighted keyboard users see the focus indicator disappear for several Tab presses while focus sits inside a closed menu. Most people assume the page is broken and give up.',
    ),
    remediation: t(
      'Dölj stängda paneler med display:none eller attributet inert i stället för att bara flytta dem utanför skärmen med transform eller negativ positionering.',
      'Hide closed panels with display:none or the inert attribute rather than only moving them off-screen with transforms or negative positioning.',
    ),
  },
  'keyboard.unnamed-focus-stop': {
    wcag: ['2.4.4', '4.1.2'],
    baseSeverity: 'high',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Fokuserbar kontroll saknar tillgängligt namn', 'Focusable control has no accessible name'),
    expected: t('Varje länk och knapp berättar vad den gör.', 'Every link and button announces what it does.'),
    observed: t(
      'Tab-stopp {stopIndex} är ett <{tag}> utan tillgängligt namn, så hjälpmedel läser upp det som en namnlös {kind}.',
      'Tab stop {stopIndex} is a <{tag}> with no accessible name, so assistive technology announces it as an unlabelled {kind}.',
    ),
    userImpact: t(
      'Skärmläsaren säger bara ”länk” eller ”knapp”. Användaren får gissa, eller aktivera kontrollen för att se vad den gör.',
      'A screen reader announces only "link" or "button". The user has to guess, or activate it to find out what it does.',
    ),
    remediation: t(
      'Lägg synlig text i elementet, eller ett aria-label när kontrollen bara har en ikon. För ikonlänkar ska aria-label beskriva målet, inte ikonen.',
      'Add visible text inside the element, or an aria-label when the control is icon-only. For icon links, aria-label should describe the destination, not the icon.',
    ),
  },
  'focus.no-visible-indicator': {
    wcag: ['2.4.7'],
    baseSeverity: 'high',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Tangentbordsfokus syns inte', 'Keyboard focus is invisible'),
    expected: t('Den fokuserade kontrollen ser synligt annorlunda ut än den ofokuserade.', 'The focused control looks visibly different from the unfocused one.'),
    observed: t(
      '”{name}” ser exakt likadan ut med och utan tangentbordsfokus — ingen ram, skugga, kant, färg eller bakgrund ändras. En tangentbordsanvändare kan inte se var hen är.',
      '"{name}" renders identically whether or not it has keyboard focus — no outline, box-shadow, border, colour or background change. A keyboard user cannot see where they are.',
    ),
    userImpact: t(
      'Tangentbordsanvändare kan inte se var på sidan de befinner sig. Varje interaktion blir gissning — det här är en av de vanligaste anledningarna till att tangentbordsanvändare avbryter en kassa.',
      'Keyboard users cannot see where they are on the page. Every interaction becomes guesswork — this is one of the most common reasons keyboard users abandon a checkout.',
    ),
    remediation: t(
      'Ta bort `outline: none`, eller komplettera med en egen markering. En pålitlig grund är `:focus-visible { outline: 3px solid <varumärkesfärg>; outline-offset: 2px; }` med minst 3:1 kontrast mot bakgrunden.',
      'Remove `outline: none` or pair it with a replacement indicator. A reliable default is `:focus-visible { outline: 3px solid <brand colour>; outline-offset: 2px; }` with at least 3:1 contrast against the background.',
    ),
    reproduction: steps(
      ['Tryck Tab tills fokus borde ligga på kontrollen.', 'Jämför kontrollen med hur den ser ut utan fokus — ingenting förändras.'],
      ['Press Tab until focus should be on this control.', 'Compare the control with its unfocused state — nothing changes.'],
    ),
  },

  // ---------------------------------------------------- interactive widgets
  'component.enter-does-not-activate': {
    wcag: ['2.1.1', '4.1.2'],
    baseSeverity: 'critical',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Komponenten öppnas med mus men inte med tangentbord', 'Component opens on click but not from the keyboard'),
    expected: t(
      'En kontroll som öppnar en panel ska göra det med Enter eller mellanslag, inte bara med musklick.',
      'A control that opens a panel does so with Enter or Space, not only with a mouse click.',
    ),
    observed: t(
      '”{name}” öppnas när den klickas med mus, men händer ingenting när den har tangentbordsfokus och Enter trycks. Tangentbordsanvändare kan alltså inte öppna komponenten över huvud taget.',
      '"{name}" opens when clicked with a mouse but does nothing when it has keyboard focus and Enter is pressed. Keyboard users cannot open this component at all.',
    ),
    userImpact: t(
      'Tangentbordsanvändare kan inte öppna komponenten. När det är ett produktfilter, en storleksväljare eller en meny blir produkterna bakom den helt enkelt oåtkomliga.',
      'Keyboard users cannot open this component. When it is a product filter, a size picker or a menu, the products behind it are simply unreachable for them.',
    ),
    remediation: t(
      'Koppla beteendet till ett riktigt <button> och använd dess click-händelse (den utlöses även av Enter och mellanslag) i stället för att lyssna på pekarhändelser på en div. Måste elementet förbli en div: lägg till role="button", tabindex="0" och hantera Enter och mellanslag explicit.',
      'Bind the behaviour to a native <button> and use its click event (which fires for Enter and Space), instead of listening for pointer events on a div. If the element must stay a div, add role="button", tabindex="0" and handle Enter and Space explicitly.',
    ),
    reproduction: steps(
      ['Tryck Tab tills kontrollen har fokus.', 'Tryck Enter — ingenting händer.', 'Klicka på samma kontroll med musen — panelen öppnas.'],
      ['Press Tab until the control has focus.', 'Press Enter — nothing happens.', 'Click the same control with the mouse — the panel opens.'],
    ),
  },
  'component.trigger-not-focusable': {
    wcag: ['2.1.1'],
    baseSeverity: 'critical',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Kontrollen som öppnar komponenten kan inte få fokus', 'Component trigger cannot receive keyboard focus'),
    expected: t('Allt som öppnar en panel går att nå med Tab.', 'Anything that opens a panel is reachable with Tab.'),
    observed: t(
      '”{name}” fungerar som en {role} men kan inte ta emot tangentbordsfokus, så den går inte att öppna utan mus.',
      '"{name}" behaves as a {role} but cannot take keyboard focus, so it cannot be opened without a mouse.',
    ),
    userImpact: t(
      'Tangentbordsanvändare kan aldrig öppna komponenten, så innehållet i den är oåtkomligt.',
      'Keyboard users can never open the component, so its content is unreachable.',
    ),
    remediation: t(
      'Använd ett riktigt <button>, eller lägg till tabindex="0" tillsammans med en passande ARIA-roll och tangenthantering.',
      'Use a native <button>, or add tabindex="0" together with a matching ARIA role and key handling.',
    ),
    reproduction: steps(['Tabba genom sidan.', 'Fokus når aldrig kontrollen.'], ['Tab through the page.', 'Focus never reaches this control.']),
  },
  'component.focus-not-moved': {
    wcag: ['2.4.3', '4.1.2'],
    baseSeverity: 'high',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Fokus flyttas inte in i panelen som öppnas', 'Focus is not moved into the panel that opens'),
    expected: t(
      'När en dialog eller panel öppnas flyttas fokus in i den, så att nästa Tab fortsätter inuti panelen.',
      'When a dialog or panel opens, focus moves into it so the next Tab continues inside the panel.',
    ),
    observed: t(
      'När ”{name}” öppnas med tangentbordet ligger fokus kvar på knappen; fokus flyttas inte in i panelen som dykt upp. En skärmläsaranvändare får ingen signal om att något öppnats, och Tab fortsätter i sidan bakom panelen.',
      'Opening "{name}" with the keyboard leaves focus on the trigger; focus is not moved into the panel that appeared. A screen reader user is not told that anything opened, and Tab continues through the page behind the panel.',
    ),
    userImpact: t(
      'Skärmläsaranvändare får inte veta att något öppnats, och tangentbordsanvändare måste tabba igenom hela sidan bakom panelen för att nå dess innehåll.',
      'Screen reader users are not told that anything opened; keyboard users have to tab through the entire page behind the panel to reach its contents.',
    ),
    remediation: t(
      'Flytta fokus till panelens behållare (tabindex="-1") eller till dess första interaktiva element när den öppnas, och tillbaka till knappen när den stängs.',
      'On open, move focus to the panel container (tabindex="-1") or to its first interactive element, and return focus to the trigger when it closes.',
    ),
    reproduction: steps(
      ['Tabba till kontrollen och tryck Enter.', 'Panelen öppnas visuellt.', 'Tryck Tab — fokus fortsätter i sidan bakom panelen i stället för inuti den.'],
      ['Tab to the control and press Enter.', 'The panel opens visually.', 'Press Tab — focus continues in the page behind the panel instead of inside it.'],
    ),
  },
  'component.modal-without-focus-containment': {
    wcag: ['2.4.3'],
    baseSeverity: 'high',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Modal dialog håller inte kvar fokus', 'Modal dialog does not contain keyboard focus'),
    expected: t('Så länge en modal dialog är öppen cirkulerar Tab endast inuti dialogen.', 'While a modal dialog is open, Tab cycles inside the dialog only.'),
    observed: t(
      'Panelen som öppnas av ”{name}” anger aria-modal="true", men fokus lämnar den medan den är öppen. Användare kan alltså interagera med sidan under en dialog som utger sig för att vara modal.',
      'The panel opened by "{name}" declares aria-modal="true" but keyboard focus leaves it while it is open, so users can interact with the page underneath a dialog that claims to be modal.',
    ),
    userImpact: t(
      'Användare kan tabba in i sidan bakom dialogen och hamna i innehåll som är visuellt övertäckt. Skärmläsaranvändare tappar sammanhanget helt.',
      'Users can tab into the page behind the dialog, interacting with content that is visually covered. Screen reader users lose track of context entirely.',
    ),
    remediation: t(
      'Använd elementet <dialog> med showModal(), eller sätt attributet inert på resten av sidan medan dialogen är öppen.',
      'Use the native <dialog> element with showModal(), or apply the inert attribute to the rest of the page while the dialog is open.',
    ),
    reproduction: steps(
      ['Öppna dialogen med tangentbordet.', 'Tryck Tab upprepade gånger — fokus lämnar dialogen och hamnar i sidan bakom.'],
      ['Open the dialog with the keyboard.', 'Press Tab repeatedly — focus escapes the dialog into the page behind it.'],
    ),
  },
  'component.escape-does-not-close': {
    wcag: ['2.1.2'],
    baseSeverity: 'medium',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Panelen går inte att stänga med Escape', 'Panel cannot be closed with Escape'),
    expected: t(
      'Escape stänger varje overlay, panel eller dialog och återför fokus till kontrollen som öppnade den.',
      'Escape closes any overlay, drawer or dialog and returns focus to the control that opened it.',
    ),
    observed: t(
      'Panelen som öppnas av ”{name}” förblir öppen när Escape trycks. En tangentbordsanvändare som öppnat den av misstag har ingen väg ut via tangentbordet.',
      'The panel opened by "{name}" stays open when Escape is pressed. A keyboard user who opens it by mistake has no keyboard way to dismiss it.',
    ),
    userImpact: t(
      'En tangentbordsanvändare som öppnar panelen av misstag måste tabba igenom hela dess innehåll för att komma vidare.',
      'A keyboard user who opens the panel by accident has no keyboard way out and has to tab through its whole contents.',
    ),
    remediation: t(
      'Lägg till en hanterare för Escape som stänger panelen och återför fokus till knappen. Elementet <dialog> gör detta som standard.',
      'Add an Escape key handler that closes the panel and returns focus to the trigger. The native <dialog> element does this by default.',
    ),
    reproduction: steps(
      ['Öppna komponenten med tangentbordet.', 'Tryck Escape — panelen är kvar.'],
      ['Open the component with the keyboard.', 'Press Escape — the panel remains open.'],
    ),
  },
  'component.dialog-missing-name': {
    wcag: ['4.1.2'],
    baseSeverity: 'medium',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Dialogen saknar tillgängligt namn', 'Dialog has no accessible name'),
    expected: t('En dialog berättar vad den är när den öppnas.', 'A dialog announces what it is when it opens.'),
    observed: t(
      'Dialogen saknar tillgängligt namn (varken aria-label eller aria-labelledby), så skärmläsaren säger bara ”dialog” utan att berätta vad det gäller.',
      'The dialog has no accessible name (no aria-label or aria-labelledby), so a screen reader announces only "dialog" with no indication of what it is.',
    ),
    userImpact: t(
      'Skärmläsaranvändare hör bara ”dialog” och måste utforska innehållet för att förstå vad som hände.',
      'Screen reader users hear only "dialog" and must explore the contents to work out what happened.',
    ),
    remediation: t(
      'Lägg till aria-labelledby som pekar på dialogens rubrik, eller aria-label med en kort beskrivning.',
      'Add aria-labelledby pointing at the dialog heading, or aria-label with a short description.',
    ),
  },

  // ------------------------------------------------------------------ forms
  'form.missing-label': {
    wcag: ['1.3.1', '3.3.2', '4.1.2'],
    baseSeverity: 'critical',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Formulärfältet saknar etikett', 'Form field has no label'),
    expected: t('Varje fält läses upp med vad det är till för.', 'Every field is announced with what it is for.'),
    observed: t(
      'Fältet ({type}) saknar etikett, aria-label och title, så hjälpmedel läser bara upp det som ”redigerbar text”.',
      'The {type} field has no label, no aria-label and no title, so assistive technology announces it only as "edit text".',
    ),
    userImpact: t(
      'Skärmläsaranvändare hör bara ”redigerbar text” och kan inte veta vad de ska skriva. I kassan och vid inloggning stoppar det affären.',
      'Screen reader users hear only "edit text" and cannot know what to type. In checkout and login this stops the transaction.',
    ),
    remediation: t(
      'Koppla en <label for="…"> till fältet, eller lägg till aria-label / aria-labelledby när en synlig etikett inte önskas.',
      'Associate a <label for="…"> with the field, or add aria-label / aria-labelledby when a visible label is not wanted.',
    ),
  },
  'form.required-unnamed': {
    wcag: ['3.3.2'],
    baseSeverity: 'critical',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Obligatoriskt fält saknar etikett', 'Required field has no label'),
    expected: t('Ett fält som måste fyllas i berättar vad det vill ha.', 'A field that must be filled in says what it wants.'),
    observed: t(
      'Ett obligatoriskt fält saknar tillgängligt namn, så användaren får veta att något krävs men inte vad.',
      'A required field has no accessible name, so the user is told something is required but not what.',
    ),
    userImpact: t(
      'Formuläret går inte att skicka, och användaren får inte veta vilket fält som blockerar.',
      'The form cannot be submitted, and the user is not told which field is blocking them.',
    ),
    remediation: t(
      'Lägg till en programmatisk etikett och behåll required-attributet så att kravet också läses upp.',
      'Add a programmatic label and keep the required state in the `required` attribute so it is announced too.',
    ),
  },
  'form.placeholder-as-label': {
    wcag: ['1.3.1', '3.3.2'],
    baseSeverity: 'high',
    confidence: 'HIGH_CONFIDENCE',
    componentScoped: true,
    title: t('Fältet har bara platshållartext som etikett', 'Field is labelled only by its placeholder'),
    expected: t('En bestående etikett syns kvar medan användaren skriver.', 'A persistent label stays visible while the user types.'),
    observed: t(
      'Fältet ({type}) har bara platshållaren ”{placeholder}” som etikett. Den försvinner så fort användaren börjar skriva, och flera kombinationer av skärmläsare och webbläsare läser aldrig upp den.',
      'The {type} field is labelled only by its placeholder ("{placeholder}"). The label disappears as soon as the user types, and several screen reader / browser combinations do not announce it at all.',
    ),
    userImpact: t(
      'Etiketten försvinner när användaren börjar skriva, så personer med minnes- eller uppmärksamhetssvårigheter tappar sammanhanget, och flera skärmläsare läser aldrig upp den.',
      'The label disappears as soon as typing starts, so users with memory or attention difficulties lose the context, and several screen reader/browser combinations never announce it.',
    ),
    remediation: t(
      'Lägg till en riktig <label>. Behåll platshållaren som exempelvärde, eller ta bort den.',
      'Add a real <label>. Keep the placeholder for an example value, or drop it.',
    ),
  },
  'form.missing-autocomplete': {
    wcag: ['1.3.5'],
    baseSeverity: 'medium',
    confidence: 'HIGH_CONFIDENCE',
    componentScoped: true,
    title: t('Fält med personuppgifter saknar autocomplete', 'Personal-data field has no autocomplete attribute'),
    expected: t(
      'Fält för namn, adress, e-post och telefon anger sitt syfte så att webbläsaren kan fylla i dem.',
      'Name, address, email and phone fields declare their purpose so browsers can fill them.',
    ),
    observed: t(
      'Fältet samlar in personuppgifter (”{name}”) men saknar autocomplete-attribut, så webbläsare och hjälpmedel kan inte fylla i det automatiskt.',
      'The field collects personal information ("{name}") but has no autocomplete attribute, so browsers and assistive technology cannot fill it automatically.',
    ),
    userImpact: t(
      'Användare med motoriska eller kognitiva funktionsnedsättningar måste skriva varje uppgift för hand i kassan, vilket är långsamt och felbenäget.',
      'Users with motor or cognitive disabilities have to type every detail by hand at checkout, which is slow and error-prone.',
    ),
    remediation: t(
      'Lägg till rätt autocomplete-värde, t.ex. autocomplete="email", "tel", "given-name", "postal-code", "street-address".',
      'Add the matching autocomplete token, e.g. autocomplete="email", "tel", "given-name", "postal-code", "street-address".',
    ),
  },
  'form.error-not-associated': {
    wcag: ['3.3.1'],
    baseSeverity: 'high',
    confidence: 'CONFIRMED_AUTOMATED',
    componentScoped: true,
    title: t('Felmeddelandet är inte kopplat till sitt fält', 'Validation error is not connected to its field'),
    expected: t('Ett ogiltigt fält pekar på meddelandet som förklarar varför.', 'An invalid field points at the message explaining why.'),
    observed: t(
      'Fältet är markerat aria-invalid="true" men inget felmeddelande är kopplat till det, så skärmläsaren säger ”ogiltigt” utan att berätta vad som är fel.',
      'The field is marked aria-invalid="true" but no error message is associated with it, so a screen reader announces "invalid" without saying what is wrong.',
    ),
    userImpact: t(
      'Skärmläsaranvändare får veta att fältet är fel men aldrig vad som är fel, så de kan inte rätta det.',
      'Screen reader users are told the field is invalid but never hear what is wrong, so they cannot fix it.',
    ),
    remediation: t(
      'Ge meddelandet ett id och referera till det från fältet med aria-describedby (eller aria-errormessage tillsammans med aria-invalid).',
      'Give the message an id and reference it from the field with aria-describedby (or aria-errormessage together with aria-invalid).',
    ),
  },
  'form.validation-message-not-announced': {
    wcag: ['3.3.1', '4.1.3'],
    baseSeverity: 'high',
    confidence: 'REVIEW_REQUIRED',
    title: t('Felmeddelandet läses kanske inte upp', 'Validation message may not be announced'),
    expected: t('Meddelanden som dyker upp efter en åtgärd läses upp utan att fokus flyttas.', 'Messages that appear after an action are announced without moving focus.'),
    observed: t(
      'Valideringstexten ”{text}” visas men refereras inte från något fält och ligger inte i en live-region, så skärmläsaranvändare får sannolikt ingen information om den.',
      'Validation text "{text}" is displayed but is not referenced by any field and is not in a live region, so screen reader users are not told about it.',
    ),
    userImpact: t(
      'Om meddelandet inte läses upp får skärmläsaranvändare aldrig veta att formuläret misslyckades och fortsätter vänta på att något ska hända.',
      'If the message is not announced, screen reader users do not learn that the form failed and keep waiting for something to happen.',
    ),
    remediation: t(
      'Placera meddelandet i en behållare med role="alert" (eller aria-live="assertive") och koppla det till fältet det gäller.',
      'Put the message in a container with role="alert" (or aria-live="assertive"), and associate it with the field it belongs to.',
    ),
  },
  'form.group-not-labelled': {
    wcag: ['1.3.1', '3.3.2'],
    baseSeverity: 'medium',
    confidence: 'HIGH_CONFIDENCE',
    componentScoped: true,
    title: t('Alternativgruppen saknar gruppetikett', 'Option group has no group label'),
    expected: t('Grupper av radioknappar och kryssrutor omsluts av ett fieldset med legend.', 'Radio and checkbox groups are wrapped in a fieldset with a legend.'),
    observed: t(
      'Gruppen ”{key}” ({memberCount} kontroller) ligger inte i ett namngivet fieldset eller role="group", så frågan som alternativen svarar på läses aldrig upp.',
      'The "{key}" option group ({memberCount} controls) is not wrapped in a labelled fieldset or role="group", so the question the options answer is never announced.',
    ),
    userImpact: t(
      'Skärmläsaranvändare hör de enskilda alternativen (”Small”, ”Medium”) utan att någonsin höra frågan (”Storlek”).',
      'Screen reader users hear the individual options ("Small", "Medium") without ever hearing the question ("Size").',
    ),
    remediation: t(
      'Omslut gruppen med <fieldset> och en <legend>, eller använd role="group" med aria-labelledby.',
      'Wrap the group in <fieldset> with a <legend>, or use role="group" with aria-labelledby.',
    ),
  },

  // -------------------------------------------------------------- structure
  'structure.missing-h1': {
    wcag: ['1.3.1', '2.4.6'],
    baseSeverity: 'low',
    confidence: 'HIGH_CONFIDENCE',
    title: t('Sidan saknar huvudrubrik', 'Page has no level-1 heading'),
    expected: t('Varje sida inleder sitt innehåll med en <h1> som namnger sidan.', 'Each page starts its content with one <h1> naming the page.'),
    observed: t(
      'Sidan har rubriker men ingen <h1>, så skärmläsaranvändare har ingen pålitlig ingång till sidans innehåll.',
      'The page has headings but no <h1>, so screen reader users cannot jump to the main topic of the page.',
    ),
    userImpact: t(
      'Skärmläsaranvändare som navigerar via rubriker saknar en tydlig startpunkt i innehållet.',
      'Screen reader users who navigate by headings have no reliable entry point to the page content.',
    ),
    remediation: t('Gör sidans huvudtitel till en <h1>; håll det till en per sida.', 'Make the main page title an <h1>; keep one per page.'),
  },
  'structure.heading-skip': {
    wcag: ['1.3.1'],
    baseSeverity: 'low',
    confidence: 'HIGH_CONFIDENCE',
    title: t('Rubriknivåer hoppar över steg', 'Heading levels skip a level'),
    expected: t('Rubriknivåer ökar ett steg i taget.', 'Heading levels increase one step at a time.'),
    observed: t(
      'Rubriknivån hoppar från h{from} till h{to} (”{text}”), vilket bryter dispositionen som skärmläsaranvändare navigerar efter.',
      'Heading level jumps from h{from} to h{to} ("{text}"), which breaks the outline screen reader users navigate by.',
    ),
    userImpact: t(
      'Rubrikstrukturen ger en felaktig bild av sidan, så rubriknavigering landar användaren i fel avsnitt.',
      'The heading outline misrepresents the page structure, so heading navigation lands users in the wrong section.',
    ),
    remediation: t(
      'Välj rubriknivå efter dokumentets struktur och styr storleken med CSS i stället för att välja nivå efter utseende.',
      'Choose heading levels by document structure and style them with CSS instead of picking a level for its size.',
    ),
  },
  'structure.missing-main': {
    wcag: ['1.3.1', '2.4.1'],
    baseSeverity: 'medium',
    confidence: 'CONFIRMED_AUTOMATED',
    title: t('Ingen main-landmärke', 'No main landmark'),
    expected: t('Sidans innehåll ligger i ett <main>-landmärke.', 'The page content sits inside a <main> landmark.'),
    observed: t(
      'Sidan har varken <main> eller role="main", så det finns inget sätt att hoppa direkt till innehållet.',
      'The page has no <main> or role="main" landmark, so there is no way to skip straight to the page content.',
    ),
    userImpact: t(
      'Skärmläsaranvändare kan inte hoppa förbi sidhuvud och meny, utan måste lyssna igenom dem på varje sida.',
      'Screen reader users cannot jump past the header and navigation, and have to listen through them on every page.',
    ),
    remediation: t('Omslut huvudinnehållet med <main> (ett per sida).', 'Wrap the primary content in <main> (one per page).'),
  },
  'structure.duplicate-unnamed-landmarks': {
    wcag: ['1.3.1'],
    baseSeverity: 'low',
    confidence: 'HIGH_CONFIDENCE',
    title: t('Flera landmärken har samma generiska namn', 'Several landmarks share the same generic name'),
    expected: t('Upprepade landmärken av samma typ skiljs åt med namn.', 'Repeated landmarks of the same type are distinguished by name.'),
    observed: t(
      '{count} navigationslandmärken delar samma generiska namn, så skärmläsaren listar flera identiska ”navigation”-poster.',
      '{count} navigation landmarks share the same generic name, so a screen reader lists several identical "navigation" entries.',
    ),
    userImpact: t(
      'Landmärkeslistan läser ”navigation, navigation, navigation” och ger ingen hjälp att välja.',
      'The landmark list reads "navigation, navigation, navigation" and gives no help choosing.',
    ),
    remediation: t(
      'Lägg till aria-label på varje nav, t.ex. aria-label="Huvudmeny" och aria-label="Sidfot".',
      'Add aria-label to each nav, e.g. aria-label="Huvudmeny" and aria-label="Sidfot".',
    ),
  },
  'structure.alt-is-filename': {
    wcag: ['1.1.1'],
    baseSeverity: 'medium',
    confidence: 'CONFIRMED_AUTOMATED',
    title: t('Bildens alternativtext är ett filnamn', 'Image alternative text is a filename'),
    expected: t('Alternativtexten beskriver bildens innehåll eller syfte.', 'Alt text describes the content or purpose of the image.'),
    observed: t(
      'Bildens alternativtext är ett filnamn (”{alt}”), vilket inte säger en skärmläsaranvändare någonting om produkten.',
      'The image\'s alternative text is a filename ("{alt}"), which tells a screen reader user nothing about the product or content.',
    ),
    userImpact: t(
      'Skärmläsaranvändare får ett filnamn uppläst tecken för tecken i stället för att få veta hur produkten ser ut.',
      'Screen reader users hear a filename read out character by character instead of learning what the product looks like.',
    ),
    remediation: t(
      'Skriv en alternativtext som beskriver produkten eller innehållet. Använd alt="" för rent dekorativa bilder.',
      'Write alt text describing the product or content. Use alt="" for purely decorative images.',
    ),
  },
  'structure.alt-not-descriptive': {
    wcag: ['1.1.1'],
    baseSeverity: 'medium',
    confidence: 'HIGH_CONFIDENCE',
    title: t('Bildens alternativtext är inte beskrivande', 'Image alternative text is not descriptive'),
    expected: t('Alternativtexten berättar vad bilden visar eller gör.', 'Alt text says what the image shows or does.'),
    observed: t(
      'Bildens alternativtext är ”{alt}”, vilket inte beskriver vad bilden visar.',
      'The image\'s alternative text is "{alt}", which does not describe what the image shows.',
    ),
    userImpact: t(
      'Skärmläsaranvändare får ingen användbar information om bilden, vilket spelar störst roll på produktbilder.',
      'Screen reader users get no useful information about the image, which matters most on product photos.',
    ),
    remediation: t(
      'Ersätt generisk alternativtext med en kort beskrivning av produkten eller innehållet, eller alt="" om bilden är dekorativ.',
      'Replace generic alt text with a short description of the product or content, or alt="" if decorative.',
    ),
  },
  'structure.ambiguous-link-text': {
    wcag: ['2.4.4'],
    baseSeverity: 'medium',
    confidence: 'HIGH_CONFIDENCE',
    title: t('Flera länkar har samma vaga namn', 'Several links share the same vague name'),
    expected: t('Länktexten går att förstå fristående.', 'Link text makes sense when read on its own.'),
    observed: t(
      '{count} länkar på sidan heter bara ”{text}”. Skärmläsaranvändare som listar sidans länkar kan inte skilja dem åt.',
      '{count} links on this page are named only "{text}". Screen reader users listing the links on the page cannot tell them apart.',
    ),
    userImpact: t(
      'Skärmläsaranvändare som listar sidans länkar hör ”läs mer, läs mer, läs mer” och kan inte avgöra vart någon av dem leder.',
      'Screen reader users listing the page links hear "läs mer, läs mer, läs mer" and cannot tell where any of them go.',
    ),
    remediation: t(
      'Låt länktexten bära målet (”Läs mer om fraktvillkor”), eller komplettera med en visuellt dold span.',
      'Make the link text carry the destination ("Läs mer om fraktvillkor"), or extend it with a visually hidden span.',
    ),
  },
  'structure.no-skip-link': {
    wcag: ['2.4.1'],
    baseSeverity: 'low',
    confidence: 'HIGH_CONFIDENCE',
    title: t('Ingen hoppa-till-innehåll-länk', 'No skip link'),
    expected: t('Första tab-stoppet erbjuder ett sätt att hoppa förbi återkommande navigation.', 'The first tab stop offers a way to skip repeated navigation.'),
    observed: t(
      'Sidan har {linkCount} länkar och ingen ”hoppa till innehåll”-länk, så tangentbordsanvändare måste tabba igenom hela sidhuvudet på varje sida.',
      'The page has {linkCount} links and no "skip to content" link, so keyboard users must tab through the whole header on every page.',
    ),
    userImpact: t(
      'Tangentbordsanvändare tabbar igenom hela sidhuvudet och menyn på varje sida innan de når innehållet.',
      'Keyboard users tab through the full header and menu on every page before reaching content.',
    ),
    remediation: t(
      'Lägg till en visuellt dold ”Hoppa till innehåll”-länk som första fokuserbara element och som blir synlig vid fokus.',
      'Add a visually hidden "Hoppa till innehåll" link as the first focusable element that becomes visible on focus.',
    ),
  },

  // ----------------------------------------------------------------- reflow
  'reflow.horizontal-scroll': {
    wcag: ['1.4.10'],
    baseSeverity: 'high',
    confidence: 'CONFIRMED_AUTOMATED',
    title: t('Innehållet kräver sidledsskroll vid hög förstoring', 'Content requires horizontal scrolling at high zoom'),
    expected: t(
      'Innehållet flödar om till en kolumn vid 320 CSS-pixlars bredd utan sidledsskroll.',
      'Content reflows into a single column at a 320 CSS-pixel viewport without horizontal scrolling.',
    ),
    observed: t(
      'Vid {viewport} px bredd (motsvarar ungefär 400 % förstoring på en laptop) är sidan {docWidth} px bred och kräver {overflowBy} px sidledsskroll för att innehållet ska gå att läsa.',
      'At a {viewport}px viewport (equivalent to about 400% zoom on a laptop) the page is {docWidth}px wide and requires {overflowBy}px of horizontal scrolling to read the content.',
    ),
    userImpact: t(
      'Personer som förstorar till 400 % — en stor andel av äldre kunder — måste skrolla i sidled på varje rad för att läsa sidan. De flesta ger upp.',
      'People who zoom to 400% — a large share of older customers — must scroll left and right on every line to read the page. Most abandon it.',
    ),
    remediation: t(
      'Ersätt fasta pixelbredder med max-width, flex eller grid, och låt tabeller och media krympa. Utgå från det bredaste elementet i underlaget.',
      'Replace fixed pixel widths with max-width/flex or grid layouts, and let tables and media shrink. Check the widest child reported in the evidence.',
    ),
    reproduction: steps(
      [
        'Öppna sidan i webbläsaren.',
        'Zooma till 400 % (Ctrl och plus i Windows, Cmd och plus i macOS), eller dra ihop fönstret till {viewport} px bredd.',
        'Innehållet flödar inte om — sidan kräver {overflowBy} px sidledsskroll för att läsas.',
      ],
      [
        'Open the page in a browser.',
        'Zoom to 400% (Ctrl/Cmd and plus), or resize the window to {viewport}px wide.',
        'The content does not reflow — the page needs {overflowBy}px of horizontal scrolling to read.',
      ],
    ),
  },
};

/** Business phrasing for the axe rules that dominate ecommerce scans. */
export const AXE_RULE_OVERRIDES: Record<string, Partial<RuleDefinition>> = {
  'image-alt': {
    baseSeverity: 'high',
    title: t('Bilden saknar alternativtext', 'Image has no text alternative'),
    expected: t('Varje informationsbärande bild har en alternativtext.', 'Every informative image has a text alternative.'),
    observed: t('Bilden saknar alt-attribut, så hjälpmedel har ingenting att läsa upp i dess ställe.', 'The image has no alt attribute, so assistive technology has nothing to announce in its place.'),
    userImpact: t(
      'Skärmläsaranvändare får ingenting där bilden är — på en produktlista innebär det att produkten i praktiken är osynlig för dem.',
      'Screen reader users get nothing where the image is — on a product listing that means the product is effectively invisible to them.',
    ),
    remediation: t(
      'Lägg till en alternativtext som beskriver produkten eller innehållet, eller alt="" om bilden är dekorativ.',
      'Add alt text describing the product or content, or alt="" when the image is decorative.',
    ),
  },
  'button-name': {
    baseSeverity: 'critical',
    title: t('Knappen saknar tillgängligt namn', 'Button has no accessible name'),
    expected: t('Varje knapp berättar vad den gör.', 'Every button announces what it does.'),
    observed: t('Knappen saknar text, aria-label och title, så den läses upp som enbart ”knapp”.', 'The button has no text, aria-label or title, so it is announced as just "button".'),
    userImpact: t(
      'Knappen läses upp som bara ”knapp”. På en varukorgs- eller kassasida kan kunden inte avgöra vad den gör.',
      'The button is announced as just "button". On a cart or checkout page the customer cannot tell what it does.',
    ),
    remediation: t('Lägg text inuti knappen, eller aria-label när den bara har en ikon.', 'Add text inside the button, or aria-label when it is icon-only.'),
  },
  'link-name': {
    baseSeverity: 'high',
    title: t('Länken saknar tillgängligt namn', 'Link has no accessible name'),
    expected: t('Varje länk berättar vart den leder.', 'Every link announces where it leads.'),
    observed: t('Länken saknar text och tillgängligt namn, så den läses upp som enbart ”länk”.', 'The link has no text or accessible name, so it is announced as just "link".'),
    userImpact: t(
      'Länken läses upp som bara ”länk”, så skärmläsaranvändare kan inte avgöra vart den leder.',
      'The link is announced as just "link", so screen reader users cannot tell where it goes.',
    ),
    remediation: t('Lägg till länktext, eller aria-label som beskriver målet för ikonlänkar.', 'Add link text, or aria-label describing the destination for icon-only links.'),
  },
  label: {
    baseSeverity: 'critical',
    title: t('Formulärfältet saknar etikett', 'Form field has no label'),
    expected: t('Varje formulärfält har en kopplad etikett.', 'Every form field has an associated label.'),
    observed: t('Fältet har ingen kopplad etikett, så hjälpmedel kan inte berätta vad det är till för.', 'The field has no associated label, so assistive technology cannot say what it is for.'),
    userImpact: t('Skärmläsaranvändare kan inte avgöra vad de ska skriva i fältet.', 'Screen reader users cannot tell what to type into the field.'),
    remediation: t('Lägg till en <label for="…"> eller ett aria-label.', 'Add a <label for="…"> or aria-label.'),
  },
  'color-contrast': {
    baseSeverity: 'medium',
    confidence: 'HIGH_CONFIDENCE',
    title: t('Textkontrasten är under WCAG AA-gränsen', 'Text contrast is below the WCAG AA minimum'),
    expected: t('Text har minst den kontrast mot bakgrunden som WCAG AA kräver.', 'Text has at least the contrast against its background that WCAG AA requires.'),
    observed: t('Texten har lägre kontrast mot sin bakgrund än WCAG AA kräver.', 'The text has lower contrast against its background than WCAG AA requires.'),
    userImpact: t(
      'Kunder med nedsatt syn, och alla som använder mobilen i dagsljus, kan inte läsa texten bekvämt. Priser och lagerstatus är de vanligaste offren.',
      'Customers with low vision, and anyone on a phone in daylight, cannot read this text comfortably. Prices and stock information are the usual casualties.',
    ),
    remediation: t(
      'Gör texten mörkare eller bakgrunden ljusare tills kontrasten är minst 4,5:1 (3:1 för text från 24 px, eller 19 px fet).',
      'Darken the text or lighten the background until the ratio is at least 4.5:1 (3:1 for text 24px+, or 19px+ bold).',
    ),
  },
  'html-has-lang': {
    baseSeverity: 'medium',
    title: t('Sidans språk är inte angivet', 'Page language is not declared'),
    expected: t('<html>-elementet anger sidans språk.', 'The <html> element declares the page language.'),
    observed: t('<html>-elementet saknar lang-attribut.', 'The <html> element has no lang attribute.'),
    userImpact: t(
      'Skärmläsare gissar språket och kan läsa svenskt innehåll med engelsk röst, vilket är nästan obegripligt.',
      'Screen readers guess the language and may read Swedish content with an English voice, which is close to unintelligible.',
    ),
    remediation: t('Lägg till lang="sv" (eller rätt språk) på <html>-elementet.', 'Add lang="sv" (or the correct language) to the <html> element.'),
  },
  'document-title': {
    baseSeverity: 'medium',
    title: t('Sidan saknar titel', 'Page has no title'),
    expected: t('Varje sida har en unik, beskrivande <title>.', 'Every page has a unique, descriptive <title>.'),
    observed: t('Sidan saknar <title>, så webbläsarflik och skärmläsare har inget namn att visa.', 'The page has no <title>, so the browser tab and screen readers have no name to present.'),
    userImpact: t(
      'Användare med många flikar öppna, och skärmläsaranvändare som landar på sidan, får ingen ledtråd om var de är.',
      'Users with several tabs open, and screen reader users landing on the page, get no indication of where they are.',
    ),
    remediation: t('Ge varje sida en unik, beskrivande <title>.', 'Give every page a unique, descriptive <title>.'),
  },
  'aria-hidden-focus': {
    baseSeverity: 'high',
    title: t('Fokuserbart element är dolt för hjälpmedel', 'Focusable element is hidden from assistive technology'),
    expected: t('Allt som kan få tangentbordsfokus exponeras också för hjälpmedel.', 'Anything that can receive keyboard focus is also exposed to assistive technology.'),
    observed: t('Elementet kan få tangentbordsfokus men ligger inuti aria-hidden="true".', 'The element can receive keyboard focus but sits inside aria-hidden="true".'),
    userImpact: t(
      'Tangentbordsfokus hamnar på en kontroll som skärmläsaren fått besked att ignorera, så ingenting läses upp.',
      'Keyboard focus lands on a control screen readers are told to ignore, so nothing is announced.',
    ),
    remediation: t('Ta bort aria-hidden, eller gör innehållet ofokuserbart medan det är dolt.', 'Remove aria-hidden, or make the contents unfocusable while hidden.'),
  },
  'nested-interactive': {
    baseSeverity: 'high',
    title: t('Interaktiv kontroll ligger inuti en annan', 'Interactive control nested inside another'),
    expected: t('Interaktiva kontroller är syskon i markupen, aldrig kapslade i varandra.', 'Interactive controls are siblings in the markup, never nested inside one another.'),
    observed: t('En interaktiv kontroll ligger inuti en annan interaktiv kontroll.', 'An interactive control is nested inside another interactive control.'),
    userImpact: t(
      'Skärmläsare läser upp kontrollerna olika i olika webbläsare och vissa går inte att nå alls.',
      'Screen readers announce the controls inconsistently and some of them cannot be reached at all.',
    ),
    remediation: t('Platta ut markupen så att varje kontroll är syskon i stället för barn till en annan kontroll.', 'Flatten the markup so each control is a sibling rather than a child of another control.'),
  },
  'select-name': {
    baseSeverity: 'critical',
    title: t('Rullgardinsmenyn saknar tillgängligt namn', 'Select element has no accessible name'),
    expected: t('Varje rullgardinsmeny berättar vad den styr.', 'Every select element announces what it controls.'),
    observed: t('<select>-elementet saknar kopplad etikett och aria-label.', 'The <select> element has no associated label or aria-label.'),
    userImpact: t(
      'En skärmläsaranvändare som väljer storlek eller antal får inte veta vad rullgardinsmenyn styr.',
      'A screen reader user selecting a size or quantity is not told what the dropdown controls.',
    ),
    remediation: t('Koppla en <label> till elementet, eller lägg till aria-label.', 'Associate a <label> with the select, or add aria-label.'),
  },
  'landmark-one-main': {
    baseSeverity: 'medium',
    title: t('Sidan saknar main-landmärke', 'Page has no main landmark'),
    expected: t('Sidans innehåll ligger i ett <main>-landmärke.', 'The page content sits inside a <main> landmark.'),
    observed: t('Sidan saknar ett <main>-landmärke.', 'The page has no <main> landmark.'),
    userImpact: t('Skärmläsaranvändare kan inte hoppa förbi sidhuvudet på varje sida.', 'Screen reader users cannot jump past the header on every page.'),
    remediation: t('Omslut sidans innehåll med ett enda <main>.', 'Wrap the page content in a single <main>.'),
  },
  'target-size': {
    baseSeverity: 'medium',
    title: t('Klickytan är mindre än minimimåttet', 'Touch target is smaller than the minimum'),
    expected: t('Interaktiva ytor är minst 24×24 CSS-pixlar, eller har tillräckligt avstånd runt omkring.', 'Interactive targets are at least 24×24 CSS pixels, or have enough spacing around them.'),
    observed: t('Den interaktiva ytan är mindre än 24×24 CSS-pixlar och har inte tillräckligt avstånd till närliggande kontroller.', 'The interactive target is smaller than 24×24 CSS pixels without sufficient spacing.'),
    userImpact: t(
      'Kunder med tremor eller nedsatt finmotorik träffar fel och hamnar på fel produkt eller raderar fel rad i varukorgen.',
      'Customers with tremor or limited fine motor control mis-tap and end up on the wrong product or delete the wrong cart line.',
    ),
    remediation: t('Ge interaktiva ytor minst 24×24 CSS-pixlar, eller tillräckligt avstånd runt omkring.', 'Give interactive targets at least 24×24 CSS pixels, or enough spacing around them.'),
  },
  region: {
    baseSeverity: 'low',
    title: t('Innehåll ligger utanför landmärken', 'Content sits outside landmarks'),
    expected: t('Allt sidinnehåll ligger inuti ett landmärke (header, nav, main eller footer).', 'All page content sits inside a landmark (header, nav, main or footer).'),
    observed: t('Delar av sidans innehåll ligger utanför alla landmärken.', 'Some page content is not contained by any landmark.'),
    userImpact: t(
      'Skärmläsaranvändare som navigerar via landmärken missar innehållet som ligger utanför dem.',
      'Screen reader users navigating by landmarks miss the content that sits outside them.',
    ),
    remediation: t('Placera allt sidinnehåll i lämpliga landmärken (header, nav, main, footer).', 'Place all page content inside appropriate landmarks (header, nav, main, footer).'),
  },
  'heading-order': {
    baseSeverity: 'low',
    title: t('Rubriknivåerna är i fel ordning', 'Heading levels are out of order'),
    expected: t('Rubriknivåer ökar ett steg i taget.', 'Heading levels increase one step at a time.'),
    observed: t('Rubriknivåerna följer inte en stigande ordning.', 'Heading levels do not follow an increasing order.'),
    userImpact: t('Rubriknavigering ger en missvisande bild av sidans struktur.', 'Heading navigation gives a misleading picture of the page structure.'),
    remediation: t('Välj rubriknivå efter struktur och styr storleken med CSS.', 'Choose heading levels by structure and control size with CSS.'),
  },
  'aria-dialog-name': {
    baseSeverity: 'medium',
    title: t('Dialogen saknar tillgängligt namn', 'Dialog has no accessible name'),
    expected: t('En dialog berättar vad den är när den öppnas.', 'A dialog announces what it is when it opens.'),
    observed: t('Elementet har role="dialog" men varken aria-label eller aria-labelledby.', 'The element has role="dialog" but neither aria-label nor aria-labelledby.'),
    userImpact: t('Skärmläsaren säger bara ”dialog” utan att berätta vad den gäller.', 'A screen reader announces only "dialog" without saying what it is.'),
    remediation: t('Lägg till aria-labelledby mot dialogens rubrik, eller aria-label.', 'Add aria-labelledby pointing at the dialog heading, or aria-label.'),
  },
};
