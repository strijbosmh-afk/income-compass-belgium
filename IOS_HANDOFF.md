# iOS Handoff

Laatste update: 6 juli 2026

## Doel

De bestaande React/Vite-webapp is voorbereid als standalone iOS-app met:

- Capacitor 8 en een gegenereerd Xcode-project.
- Face ID of toestelcode bij openen en hervatten.
- Handmatige vergrendelknop.
- Native camera- en fotobibliotheekkeuze.
- Mobiele iOS-tabbar en safe-area-ondersteuning.
- Portrait-modus op iPhone.
- Geen permanente opslag van nieuwe salarisafbeeldingen in Supabase Storage.

Voor de volledige Codex-chatcontext, inclusief portfolio-cash, Bolero-import,
BVBA-cashsnapshots en de pensioen/BVBA-simulator, zie
`CODEX_CHAT_HANDOFF.md`.

## Privacygedrag

Nieuwe salarisafbeeldingen worden:

1. Tijdelijk gekozen via camera of fotobibliotheek.
2. Als base64 naar de bestaande Supabase `extract-income` functie gestuurd.
3. Lokaal als preview getoond tijdens controle.
4. Niet meer geüpload naar de Supabase Storage-bucket `screenshots`.
5. Verwijderd uit de actieve UI na opslaan of annuleren.

Alleen de gecontroleerde cijferrecords worden opgeslagen. Dit is geen volledig
on-device OCR-proces: de afbeelding gaat tijdelijk naar de extractiefunctie.

## Belangrijkste bestanden

- `capacitor.config.ts`: native appconfiguratie.
- `ios/`: gegenereerd Xcode-project.
- `ios/App/App/Info.plist`: Face ID-, camera- en fotobibliotheekpermissies.
- `src/components/NativeSecurityGate.tsx`: biometrische vergrendeling.
- `src/components/MobileTabBar.tsx`: mobiele tabbar.
- `src/components/AppLayout.tsx`: iOS-header, safe areas en lock-knop.
- `src/pages/UploadPage.tsx`: native camera/screenshotflow zonder Storage-upload.
- `src/index.css`: mobiele en safe-area-styling.
- `README.md`: buildinstructies.
- `CODEX_CHAT_HANDOFF.md`: samenvatting van de recente Codex-sessie en Mac/Xcode
  vervolgcontext.

## Op macOS

Open een terminal in deze repository en voer uit:

```sh
npm install
npm run ios:sync
npm run ios:open
```

Daarna in Xcode:

1. Selecteer het `App` target.
2. Stel bij Signing & Capabilities je Apple Developer Team in.
3. Controleer de bundle identifier `be.medincome.app`.
4. Selecteer een fysieke iPhone met Face ID.
5. Build en start de app.
6. Test openen, achtergrond/voorgrond, handmatig vergrendelen, camera en fotobibliotheek.

`npm run ios:sync` regenereert native pluginconfiguratie en moet op de Mac worden
uitgevoerd voordat Xcode wordt geopend.

## Verificatie op Windows

- `npm run build`: geslaagd.
- `npx tsc --noEmit -p tsconfig.app.json`: geslaagd.
- `npm run test`: geslaagd, 1 test.
- Gerichte ESLint-controle voor nieuwe componenten: geslaagd.
- `npm run ios:sync`: geslaagd.
- Volledige bestaande lint-suite heeft al veel fouten buiten deze wijziging.
- Een echte Xcode-build en Face ID-test zijn op Windows niet mogelijk.
- Visuele browsercontrole kon niet starten door de lokale Windows-sandbox.

## Bekende aandachtspunten

- De productie-bundle is groot; Vite toont een chunk-size-waarschuwing.
- `npm install` rapporteerde 18 bestaande dependencykwetsbaarheden.
- Bestaande historische screenshots in Supabase Storage worden niet automatisch verwijderd.
- De pensioen-PDF-uploadflows bewaren hun documenten nog steeds in Supabase Storage.
- Voor volledig lokale verwerking is later een on-device OCR/extractiearchitectuur nodig.
