# MedIncome

MedIncome is een Vite + React applicatie voor het opvolgen van inkomsten, nomenclatuur, controles, simulaties, doelstellingen en pensioen/IPT-overzichten voor medische oncologie in Belgie.

## Stack

- React 18, TypeScript en Vite
- shadcn/Radix UI componenten met Tailwind CSS
- Supabase Auth, Postgres, Storage en Edge Functions
- Vercel hosting
- Recharts voor dashboards
- jsPDF en write-excel-file voor export
- Vitest en Playwright voor tests
- Finnhub voor ticker search, quotes en historische koersdata

## Vereisten

- Node.js 20 of nieuwer
- npm
- Een Supabase project
- Een OpenAI API key voor de OCR- en PDF-extractie Edge Functions

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
- Secret `OPENAI_API_KEY` op Supabase voor AI-extractie
- Optioneel: `OPENAI_EXTRACTION_MODEL` en `OPENAI_EXTRACTION_FALLBACK_MODEL` om de extractiemodellen te sturen
- Secret `AI_ALLOWED_USER_IDS` of `AI_ALLOWED_EMAILS` om AI-extractie te beperken tot toegelaten gebruikers
- Secret `FINNHUB_API_KEY` voor marktdata

Deploy de functies met de Supabase CLI nadat de secrets zijn ingesteld:

```bash
supabase secrets set OPENAI_API_KEY="..."
supabase secrets set OPENAI_EXTRACTION_MODEL="gpt-5.6-terra"
supabase secrets set OPENAI_EXTRACTION_FALLBACK_MODEL="gpt-5"
supabase secrets set AI_ALLOWED_USER_IDS="00000000-0000-0000-0000-000000000000"
supabase secrets set FINNHUB_API_KEY="..."
supabase functions deploy extract-income
supabase functions deploy extract-pension-ipt
supabase functions deploy extract-vapz
supabase functions deploy extract-vapz-riziv
supabase functions deploy extract-pensioensparen
supabase functions deploy market-data
```

De extractiefuncties vereisen een geldige Supabase JWT en een match met de AI-allowlist. De frontend roept deze functies aan via de ingelogde Supabase client.

## Vercel migratie

Deze repo is geschikt gemaakt om zelfstandig op Vercel te draaien. `vercel.json` zorgt dat alle React routes naar `index.html` terugvallen, zodat pagina's zoals `/login`, `/pensioen` en `/aandelen` niet als 404 eindigen.

Zet in Vercel bij Project Settings → Environment Variables minimaal:

```bash
VITE_SUPABASE_PROJECT_ID="mncgpeqzbdamohvwfkla"
VITE_SUPABASE_URL="https://mncgpeqzbdamohvwfkla.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-supabase-publishable-or-anon-key"
```

Zet in Supabase Auth → URL Configuration:

```text
Site URL: https://myfinstate.com
Redirect URLs:
https://myfinstate.com/**
https://*.vercel.app/**
http://localhost:8080/**
```

Voor Supabase zelf:

```bash
supabase link --project-ref mncgpeqzbdamohvwfkla
supabase db push
supabase functions deploy extract-income
supabase functions deploy extract-pension-ipt
supabase functions deploy extract-vapz
supabase functions deploy extract-vapz-riziv
supabase functions deploy extract-pensioensparen
supabase functions deploy market-data
supabase functions deploy refresh-portfolio-prices --no-verify-jwt
```

Voor de portfolio-refresh function moet ook een server-side secret bestaan:

```bash
supabase secrets set CRON_SECRET="een-lange-random-waarde"
```

Roep `refresh-portfolio-prices` alleen aan vanuit je scheduler met header `Authorization: Bearer <CRON_SECRET>`.

Belangrijk: de database, storage buckets, auth users en Edge Function secrets leven in Supabase, niet in Vercel. Zolang je hetzelfde Supabase project blijft gebruiken, hoef je de database niet per se te migreren. Wil je naar een ander Supabase project, exporteer dan eerst data/storage/auth en importeer die in het nieuwe Supabase project voordat je de Vercel variabelen omwijst.

De AI-extracties lopen rechtstreeks via de OpenAI Responses API en gebruiken standaard `OPENAI_EXTRACTION_MODEL=gpt-5.6-terra` met `OPENAI_EXTRACTION_FALLBACK_MODEL=gpt-5`. De frontend en iOS-app blijven dezelfde Supabase Edge Functions aanroepen.

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
- Bewaar `OPENAI_API_KEY` uitsluitend als Supabase secret.
- Beperk AI-extractie met `AI_ALLOWED_USER_IDS` of `AI_ALLOWED_EMAILS`.
- Houd JWT-verificatie aan voor Edge Functions die AI-calls of gebruikersdata verwerken.
- Bescherm server-side scheduled functions met `CRON_SECRET`.
