/* Aura — reflection and Mystik (optional module, off by default).
 *
 * The spirit of the old Mystik concept, made elegant rather than
 * pseudoscientific: a theme for the day is a prompt to think with, not a
 * prediction. It never dominates the practical side of Aura.
 */
(function (root) {
  const A = root.Aura || (root.Aura = {});
  const U = A.util, I = A.i18n;

  const PROMPTS = {
    sv: [
      'Vad spelade roll i dag?', 'Vad kan du släppa inför i morgon?', 'Vad gav dig energi i dag?', 'Vad tog energi?',
      'Vad är du tacksam för just nu?', 'Vad skulle göra i morgon lite lättare?', 'Vad gjorde du bra i dag, även om det var litet?',
      'Vad behöver du mer av den här veckan?', 'Vad säger du ja till som du egentligen vill säga nej till?', 'Vad väntar du på?',
      'När kände du dig mest som dig själv i dag?', 'Vad vill du minnas från i dag?', 'Vad är nog, just nu?',
      'Vilken tanke har snurrat mest i dag?', 'Vem skulle du vilja höra av dig till?',
    ],
    en: [
      'What mattered today?', 'What can you let go of before tomorrow?', 'What gave you energy today?', 'What drained it?',
      'What are you grateful for right now?', 'What would make tomorrow a little easier?', 'What did you do well today, even if small?',
      'What do you need more of this week?', 'What are you saying yes to that you want to say no to?', 'What are you waiting for?',
      'When did you feel most like yourself today?', 'What do you want to remember about today?', 'What is enough, right now?',
      'Which thought has circled the most today?', 'Who would you like to get in touch with?',
    ],
  };

  /* A small deck of contemplative themes. Symbolic, never predictive. */
  const THEMES = [
    ['Tröskeln', 'Threshold', 'Något börjar.', 'Something is beginning.', 'Vad kliver du in i?', 'What are you stepping into?'],
    ['Stillheten', 'Stillness', 'Allt behöver inte röra sig.', 'Not everything needs to move.', 'Var kan du stå still en stund?', 'Where can you be still for a while?'],
    ['Skörden', 'Harvest', 'Det du sått finns redan.', 'What you planted is already here.', 'Vad har du faktiskt åstadkommit?', 'What have you actually brought in?'],
    ['Lyktan', 'The Lantern', 'Du behöver bara se nästa steg.', 'You only need to see the next step.', 'Vilket är nästa lilla steg?', 'What is the next small step?'],
    ['Floden', 'The River', 'Det som flyter behöver inte knuffas.', 'What flows does not need pushing.', 'Vad kan du låta ha sin gång?', 'What can you let take its course?'],
    ['Rötterna', 'Roots', 'Det som håller dig syns inte alltid.', 'What holds you is not always visible.', 'Vad står du stadigt på?', 'What are you standing on?'],
    ['Den öppna dörren', 'The Open Door', 'Ett val finns där du inte tittat.', "There is a choice where you haven't looked.", 'Vilken dörr har du inte prövat?', "Which door haven't you tried?"],
    ['Spegeln', 'The Mirror', 'Det du ser hos andra säger något om dig.', 'What you see in others says something about you.', 'Vad känner du igen i någon annan i dag?', 'What do you recognise in someone else today?'],
    ['Tidvattnet', 'Tide', 'Allt kommer tillbaka i sin takt.', 'Everything returns at its own pace.', 'Vad är på väg tillbaka?', 'What is on its way back?'],
    ['Fröet', 'The Seed', 'Litet nu betyder inte litet sedan.', "Small now doesn't mean small later.", 'Vad vill du så i dag?', 'What do you want to plant today?'],
    ['Bron', 'The Bridge', 'Två saker kan vara sanna samtidigt.', 'Two things can be true at once.', 'Vad behöver du förena?', 'What do you need to bring together?'],
    ['Glöden', 'Ember', 'Värme finns kvar även när lågan är låg.', 'Warmth remains even when the flame is low.', 'Vad ger dig fortfarande värme?', 'What still keeps you warm?'],
    ['Nordstjärnan', 'North Star', 'Riktning är viktigare än fart.', 'Direction matters more than speed.', 'Vart är du på väg, egentligen?', 'Where are you actually heading?'],
    ['Trädgården', 'The Garden', 'Omsorg är upprepning.', 'Care is repetition.', 'Vad behöver lite omsorg i dag?', 'What needs a little care today?'],
    ['Regnet', 'Rain', 'Det som känns grått vattnar också.', 'What feels grey also waters.', 'Vad växer i det som är svårt?', 'What is growing in what is hard?'],
    ['Nyckeln', 'The Key', 'Ofta är lösningen mindre än problemet.', 'Often the answer is smaller than the problem.', 'Vilken liten sak skulle låsa upp mycket?', 'What small thing would unlock a lot?'],
    ['Månen', 'The Moon', 'Allt syns inte på en gång.', 'Not everything shows at once.', 'Vad får vara ofärdigt ett tag till?', 'What can stay unfinished a while longer?'],
    ['Horisonten', 'Horizon', 'Det finns mer framför dig än du ser.', 'There is more ahead than you can see.', 'Vad ser du fram emot?', 'What are you looking forward to?'],
    ['Härden', 'The Hearth', 'Hemma är en känsla man bygger.', 'Home is a feeling you build.', 'Vad gör det hemmavarmt för dig?', 'What makes home feel like home to you?'],
    ['Kompassen', 'Compass', 'Du vet mer än du tror.', 'You know more than you think.', 'Vad säger magkänslan?', 'What does your gut say?'],
    ['Vintern', 'Winter', 'Vila är också en årstid.', 'Rest is a season too.', 'Var får du vila nu?', 'Where can you rest now?'],
    ['Gryningen', 'Dawn', 'Varje dag börjar om.', 'Every day begins again.', 'Vad får börja om i dag?', 'What gets to begin again today?'],
  ];

  const RITUALS = {
    sv: [['Tre andetag', 'Tre långsamma andetag innan du fortsätter.'], ['Ett ljus', 'Tänd ett ljus och låt kvällen börja.'], ['En rad', 'Skriv en rad om dagen — bara en.'], ['Fem minuter ute', 'Gå ut, titta upp, kom tillbaka.']],
    en: [['Three breaths', 'Three slow breaths before you carry on.'], ['A candle', 'Light a candle and let the evening begin.'], ['One line', 'Write one line about the day — just one.'], ['Five minutes outside', 'Step out, look up, come back.']],
  };

  function lang() { return I.language() === 'sv' ? 'sv' : 'en'; }

  function promptOfDay(key, offset) {
    const list = PROMPTS[lang()];
    return list[(U.hash(`p${key}`) + (offset || 0)) % list.length];
  }

  function themeOfDay(key) {
    const t = THEMES[U.hash(`t${key}`) % THEMES.length];
    const sv = lang() === 'sv';
    return { name: sv ? t[0] : t[1], line: sv ? t[2] : t[3], question: sv ? t[4] : t[5] };
  }

  function rituals() { return RITUALS[lang()].map(([name, text]) => ({ name, text })); }

  A.reflect = { promptOfDay, themeOfDay, rituals, PROMPTS, THEMES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
