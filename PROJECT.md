# Income Compass Belgium Project

Laatste update: 6 juli 2026

## Projectdoel

Income Compass Belgium wordt uitgebouwd van een webapp voor medische inkomsten
naar een persoonlijke financiele cockpit:

- standalone iOS-app via Capacitor en Xcode
- Face ID/toestelcode beveiliging
- salarisextractie via foto/screenshot in plaats van permanente upload
- vermogensdashboard met cash, brokerdata, pensioen/IPT en beleggingen
- Bolero-portfolio-import als huidige snapshot
- manuele cashsnapshots voor prive- en BVBA-rekeningen
- realtime BVBA/pensioen-simulator met loon, dividenden, liquidatiereserve,
  IPT-stortingen en pensioenbudget

## Huidige status

`main` bevat:

- iOS-basis met Capacitor project in `ios/`
- native lock en biometrische beveiliging
- portfolio en Bolero-import
- cash/debetstand verwerking
- manuele cashsnapshots voor prive en BVBA
- wide-screen optimalisaties voor het portfolio
- pensioen/BVBA-simulator onder `Simulaties > Pensioen & BVBA`
- overdrachtsdocumenten:
  - `CODEX_CHAT_HANDOFF.md`
  - `IOS_HANDOFF.md`

## Belangrijkste routes

- `/` en `/dashboard`: inkomsten dashboard
- `/upload`: salaris screenshot/foto verwerken
- `/records`: inkomensrecords
- `/statistics`: statistieken
- `/simulations`: inkomenssimulatie en pensioen/BVBA-simulator
- `/pensioen`: pensioenoverzicht
- `/pensioen/dashboard`: pensioendashboard
- `/aandelen`: vermogen/portfolio

## Belangrijkste bestanden

- `src/pages/PortfolioPage.tsx`
- `src/pages/SimulationsPage.tsx`
- `src/components/RetirementBvbaSimulator.tsx`
- `src/components/NativeLock.tsx`
- `src/components/AppLayout.tsx`
- `src/components/MobileTabBar.tsx`
- `src/pages/UploadPage.tsx`
- `capacitor.config.ts`
- `ios/`
- `supabase/migrations/20260706190000_allow_cash_debit_positions.sql`
- `supabase/migrations/20260706193000_allow_zero_cash_positions.sql`

## MacBook start

Als de repo nog niet op de MacBook staat:

```sh
cd ~/Documents
git clone https://github.com/strijbosmh-afk/income-compass-belgium.git
cd income-compass-belgium
npm install
npm run ios:sync
npm run ios:open
```

Als de repo al bestaat:

```sh
cd ~/Documents/income-compass-belgium
git checkout main
git pull --ff-only origin main
npm install
npm run ios:sync
npm run ios:open
```

In Xcode:

1. Selecteer het `App` target.
2. Kies je Apple Developer Team bij Signing & Capabilities.
3. Controleer bundle identifier `be.medincome.app`.
4. Selecteer een fysieke iPhone.
5. Run de app.

## Roadmap

### Fase 1: Mac/Xcode validatie

- Xcode build op MacBook uitvoeren.
- Signing & Capabilities instellen.
- Face ID/toestelcode testen.
- Camera/fotobibliotheek testen.
- iPhone safe-area en navigatie testen.

### Fase 2: Portfolio verfijnen

- Broker-CSV imports toevoegen voor DEGIRO, Saxo, Keytrade en IBKR.
- Bolero import uitbreiden met transactiehistoriek wanneer beschikbaar.
- Cashsnapshots historisch visualiseren.
- Allocatie per regio/sector/munt verder verfijnen met betere metadata.

### Fase 3: BVBA/pensioen simulator verdiepen

- Scenario's kunnen bewaren en vergelijken.
- Boekhouder-profielen voor fiscale parameters.
- 80%-regel berekening verfijnen met loopbaanjaren en verwachte wettelijke
  pensioenrente.
- Liquidatiereserve historiek per aanlegjaar expliciet modelleren.
- Netto loonberekening verfijnen via Belgische bedrijfsleiderparameters.

### Fase 4: UX en iOS polish

- Simulator op iPhone visueel finetunen.
- Haptics/feedback toevoegen waar nuttig.
- Dashboardkaarten verder optimaliseren voor landscape iPad/wide screen.
- Offline/read-only fallback voor laatst bekende cijfers.

## Bekende aandachtspunten

- Volledige `npm run lint` bevat nog bestaande lintproblemen buiten de recent
  gewijzigde bestanden.
- `npm run build` toont een bestaande Vite chunk-size waarschuwing.
- Echte Face ID- en Xcode-validatie moet op macOS met fysiek toestel gebeuren.
- Simulator is indicatief en geen fiscaal advies.
- Fiscale parameters moeten finaal gevalideerd worden met boekhouder/makelaar.

## Laatste checks

Voor PR #12 waren groen:

```sh
npx eslint src/pages/SimulationsPage.tsx src/components/RetirementBvbaSimulator.tsx
npm run build
```

## Codex projectthread

Deze chat is in Codex hernoemd en gepind als:

`Income Compass Belgium iOS + Vermogen Project`

Gebruik deze thread voor vervolgwerk aan dezelfde app.
