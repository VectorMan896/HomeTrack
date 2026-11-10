# App icon / logo

Drop your logo here so I can wire it into the Android launcher icon and the web/PWA icon.

**Save your green wallet-house logo as:**

```
hometrack/assets/icon.png       (square, ideally 1024×1024, PNG)
```

Optional, for the Android splash screen:

```
hometrack/assets/splash.png     (2732×2732, logo centered on the brand background)
```

Once `icon.png` is here, generation is one command:

```bash
npx capacitor-assets generate --android
```

That produces every Android density (mipmap + adaptive icons). The web/PWA icon and
favicon are updated to point at the same image.
