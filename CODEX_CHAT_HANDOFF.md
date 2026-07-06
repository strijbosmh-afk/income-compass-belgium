# Codex Chat Handoff

Laatste update: 6 juli 2026

Dit document bewaart de praktische context uit de Codex-sessie, zodat je op je
MacBook verder kan werken en de app in Xcode kan starten.

## Repository

- GitHub: `strijbosmh-afk/income-compass-belgium`
- Lokale Windows-map tijdens deze sessie:
  `C:\Users\strij\Documents\Codex\2026-06-14\strijbosmh-afk-income-compass-belgium-git\work\income-compass-belgium`
- Default branch: `main`
- Capacitor app id: `be.medincome.app`
- Capacitor app name: `MedIncome`

## Wat is gebouwd en gemerged

### iOS basis

De app is voorbereid als standalone iOS-app via Capacitor:

- Face ID/toestelcode bij openen en hervatten.
- Native camera- en fotobibliotheekflow.
- Screenshot/foto gebruiken voor salarisextractie in plaats van salarisdata
  uploaden als permanente Storage-file.
- iOS-safe-area styling, mobiele navigatie en lock-knop.
- Xcode-project staat in `ios/`.

Zie ook `IOS_HANDOFF.md`.

### Portfolio en vermogen

Gemergede PR's:

- PR #10: Bolero cash/debetstand correct verwerkt en wide-screen layouts verbeterd.
- PR #11: manuele cashsnapshots toegevoegd voor prive- en BVBA-rekeningen.

Belangrijkste bestanden:

- `src/pages/PortfolioPage.tsx`
- `supabase/migrations/20260706190000_allow_cash_debit_positions.sql`
- `supabase/migrations/20260706193000_allow_zero_cash_positions.sql`

Huidig gedrag:

- Bolero `Cash EUR` wordt behandeld als broker cash.
- Negatieve Bolero cash wordt debetstand.
- In het vermogenspanel kan je manueel cash toevoegen voor:
  - prive rekening
  - BVBA rekening
- Cash wordt ingevoerd als snapshot met datum.
- Analyses gebruiken per cashrekening alleen de meest recente snapshot.
- Cash telt mee in netto waarde, cashbuffer, allocatie, broker/bron-analyse en
  cumulatieve EUR-grafiek.

### Pensioen/BVBA simulator

Gemergede PR:

- PR #12: interactieve pensioen- en BVBA-simulator.

Belangrijkste bestanden:

- `src/pages/SimulationsPage.tsx`
- `src/components/RetirementBvbaSimulator.tsx`

Waar te vinden in de app:

- Ga naar `Simulaties`.
- Open tab `Pensioen & BVBA`.

Wat erin zit:

- Geboortedatum: `14-04-1976`.
- Pensioen op 67 jaar.
- Pensioenstart in de simulator: `01/05/2043`.
- Sliders voor:
  - vrije BVBA-winst
  - bruto loon uit BVBA
  - netto loonpercentage
  - vennootschapsbelasting
  - bruto dividend
  - roerende voorheffing op dividend
  - liquidatiereserve
  - aanlegbelasting liquidatiereserve
  - roerende voorheffing bij uitkering liquidatiereserve
  - wachttijd liquidatiereserve
  - IPT-storting
  - IPT-rendement
  - IPT-nettofactor bij opname
  - prive spaarquote
  - extra prive-inleg
  - prive beleggingsrendement
  - wettelijk pensioen netto/maand
  - onttrekkingsratio
  - spreiding van IPT/liquidatiereserve
  - inflatie
- Realtime grafieken:
  - kapitaalopbouw tot pensioen
  - kapitaalmix op pensioen
  - maandbudget op pensioen
- Indicatieve 80%-regel check.
- Waarschuwing wanneer gekozen loon/dividend/IPT/liquidatiereserve meer BVBA
  cash vereist dan de ingestelde BVBA-winst.

Fiscale defaults in de simulator zijn bewust aanpasbaar:

- dividend RV: 30%
- liquidatiereserve aanleg: 10%
- liquidatiereserve uitkering: 9,8% na 3 jaar voor nieuwe reserves
- IPT nettofactor: 85%

Dit is een planningsmodel, geen fiscaal advies. De echte 80%-regel en optimale
verloning moeten met boekhouder/makelaar gevalideerd worden.

## MacBook en Xcode starten

Op je MacBook:

```sh
git clone https://github.com/strijbosmh-afk/income-compass-belgium.git
cd income-compass-belgium
npm install
npm run ios:sync
npm run ios:open
```

Als de repo al bestaat op je MacBook:

```sh
cd income-compass-belgium
git checkout main
git pull --ff-only origin main
npm install
npm run ios:sync
npm run ios:open
```

In Xcode:

1. Open het `App` target.
2. Stel je Apple Developer Team in bij Signing & Capabilities.
3. Controleer bundle identifier `be.medincome.app`.
4. Kies een fysieke iPhone voor Face ID-testen.
5. Build en start.
6. Test:
   - openen en ontgrendelen met Face ID
   - terugkomen uit achtergrond
   - handmatig vergrendelen
   - foto/screenshotflow
   - portfolio cashsnapshots
   - simulaties > pensioen & BVBA

## Laatst uitgevoerde checks

- `npx eslint src/pages/SimulationsPage.tsx src/components/RetirementBvbaSimulator.tsx`
- `npm run build`

Beide waren groen voor PR #12.

Let op: de volledige bestaande `npm run lint` suite bevat nog oudere lintfouten
in andere bestanden. De Vite-build toont ook een bestaande chunk-size waarschuwing.

## Belangrijke operationele notities

- `npm run build` raakt in deze Windows-omgeving soms
  `supabase/functions/mcp/index.ts` aan als gegenereerde bijvangst. Die wijziging
  werd telkens teruggezet en hoort niet mee in feature-commits.
- Voor iOS moet `npm run ios:sync` op macOS opnieuw worden uitgevoerd voordat je
  in Xcode bouwt.
- Echte Face ID- en Xcode-buildvalidatie kan alleen op macOS met fysiek toestel.
