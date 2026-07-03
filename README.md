# MedIncome

MedIncome is a React and Supabase income tracker with a native iOS shell powered by Capacitor.

## Web development

```sh
npm install
npm run dev
```

## iOS development

Requirements: macOS, Xcode, and an Apple development team for installation on a physical iPhone.

```sh
npm install
npm run ios:sync
npm run ios:open
```

In Xcode, select the `App` target, configure Signing & Capabilities, then run on an iPhone or simulator.

The iOS app includes:

- Face ID or device-passcode protection for an authenticated session
- Native camera and photo-library access for income uploads
- Portrait-first safe-area-aware layout
- Bottom-tab navigation and iPhone-sized touch targets

After changing React code, run `npm run ios:sync` before building again in Xcode.
