# MedIncome

MedIncome is een React/Vite-app met een standalone iOS-shell via Capacitor.

## Web

```sh
npm install
npm run dev
```

## iOS

Een Mac met Xcode is vereist om de app te bouwen en op een iPhone te installeren.

```sh
npm install
npm run ios:sync
npm run ios:open
```

Selecteer daarna een signing team in Xcode en start de app op een fysieke iPhone.
De app vergrendelt bij openen en hervatten met Face ID of de toestelcode.

## Portfolio MVP

De app bevat een eerste portfolio-module voor assets, transacties,
assetallocatie, DCA/rebalancing en Belgische tax-aandachtspunten. Maak eerst
assets aan en voeg daarna transacties toe of plak een CSV met kolommen zoals:

```csv
date,symbol,type,quantity,price,amount,fees,taxes,currency,broker,notes
2026-07-01,VWCE,buy,3,110,330,2.5,0.4,EUR,Bolero,maandelijkse DCA
```

## Privacy van screenshots

Nieuwe salarisafbeeldingen worden niet opgeslagen in Supabase Storage. Ze worden
tijdelijk naar de bestaande extractiefunctie gestuurd, lokaal getoond voor
controle en uit het scherm verwijderd na opslaan of annuleren. Alleen de
gecontroleerde cijferrecords worden bewaard.
