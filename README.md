# MedIncome

MedIncome is een Vite + React applicatie voor het opvolgen van inkomsten, nomenclatuur, controles, simulaties, doelstellingen en pensioen/IPT-overzichten voor medische oncologie in Belgie.

## Stack

- React 18, TypeScript en Vite
- shadcn/Radix UI componenten met Tailwind CSS
- Supabase Auth, Postgres, Storage en Edge Functions
- Recharts voor dashboards
- jsPDF en write-excel-file voor export
- Vitest en Playwright voor tests
- Finnhub voor ticker search, quotes en historische koersdata

## Vereisten

- Node.js 20 of nieuwer
- npm
- Een Supabase project
- Een Lovable AI Gateway key voor de OCR Edge Functions

## Lokale setup

1. Installeer dependencies:

```bash
npm install
```

2. Maak je lokale environment file:

```bash
cp .env.example .env
```

3. Vul `.env` in:

```bash
VITE_SUPABASE_PROJECT_ID="your-project-id"
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-anon-or-publishable-key"
```

4. Start de app:

```bash
npm run dev
```

De Vite dev server draait standaard op `http://localhost:8080`.

## Supabase

De frontend verwacht dat Supabase Auth actief is en dat de database is opgebouwd met de migraties in `supabase/migrations`.

Belangrijke runtime onderdelen:

- Storage bucket `screenshots` voor geuploade inkomsten-screenshots
- Edge Function `extract-income` voor OCR/extractie van inkomsten
- Edge Functions `extract-pension` en `extract-pension-ipt` voor pensioen/IPT-documenten
- Edge Function `market-data` voor aandelen/ETF ticker search, actuele quotes en historische candles
- Secret `LOVABLE_API_KEY` op Supabase voor AI Gateway calls
- Secret `AI_ALLOWED_USER_IDS` of `AI_ALLOWED_EMAILS` om AI-extractie te beperken tot toegelaten gebruikers
- Secret `FINNHUB_API_KEY` voor marktdata

Deploy de functies met de Supabase CLI nadat de secrets zijn ingesteld:

```bash
supabase secrets set LOVABLE_API_KEY="..."
supabase secrets set AI_ALLOWED_USER_IDS="00000000-0000-0000-0000-000000000000"
supabase secrets set FINNHUB_API_KEY="..."
supabase functions deploy extract-income
supabase functions deploy extract-pension
supabase functions deploy extract-pension-ipt
supabase functions deploy market-data
```

De extractiefuncties vereisen een geldige Supabase JWT en een match met de AI-allowlist. De frontend roept deze functies aan via de ingelogde Supabase client.

## Scripts

```bash
npm run dev        # lokale dev server
npm run build      # productiebuild
npm run lint       # ESLint
npm run test       # Vitest test suite
npm run preview    # preview van de productiebuild
```

## Veiligheid

- Commit geen lokale `.env` bestanden. Gebruik `.env.example` als template.
- Zet alleen publishable/anon Supabase keys in de frontend.
- Bewaar `LOVABLE_API_KEY` uitsluitend als Supabase secret.
- Beperk AI-extractie met `AI_ALLOWED_USER_IDS` of `AI_ALLOWED_EMAILS`.
- Houd JWT-verificatie aan voor Edge Functions die AI-calls of gebruikersdata verwerken.
