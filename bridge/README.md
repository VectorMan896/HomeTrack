# HomeTrack bridge

A tiny local server that lets the HomeTrack **Studio** tab (on your phone) reach things on your PC:

- **Gallery** — serves images/videos (with thumbnails and prompt metadata) from your ComfyUI and Fooocus output folders (read-only).
- **Chat** — proxies your local **Ollama** so the phone can talk to your models.
- **PixelAnvil** — in-app image generation: the app loads `bridge/workflow.json` (a ComfyUI workflow in API format), fills in your prompt/size/steps, and queues it on ComfyUI through the bridge.

## Run it

Requires Node.js (already installed).

```bat
bridge\start-bridge.bat
```

or:

```bash
node bridge/server.js
```

Keep the window open while you use the Studio tab. It listens on **port 8790**, bound to all interfaces (LAN + Tailscale).

## Point the app at it

1. Find your PC's address:
   - Same Wi‑Fi: run `ipconfig` → your IPv4 (e.g. `192.168.1.10`).
   - Anywhere (recommended): your **Tailscale** IP (`100.x.x.x`).
2. In HomeTrack → **Settings → Admin · Studio**, tick **Show hidden features** and enter that address, then **Test bridge connection**.
3. The **Studio** tab appears: Gallery · Chat · PixelAnvil.

## Requirements per feature

- **Gallery** — just this bridge running.
- **Chat** — this bridge **and** Ollama running (`ollama serve`, models pulled). The bridge reaches Ollama at `127.0.0.1:11434`, so you don't need to change Ollama's host or CORS.
- **PixelAnvil** — this bridge **and** ComfyUI running (`127.0.0.1:8188`), plus `workflow.json` in this folder.
- Thumbnails need `jimp` (`npm install` here — `start-bridge.bat` does it); without it full images are sent.

## Config (optional, via environment variables)

| Var | Default |
|-----|---------|
| `PORT` | `8790` |
| `COMFY_DIR` | `C:/Users/Vector/AppData/Local/Comfy-Desktop/ComfyUI-Shared/output` |
| `FOOOCUS_DIR` | `C:/Users/Vector/Pictures/outputs` |
| `OLLAMA` | `http://127.0.0.1:11434` |
| `COMFYUI` | `http://127.0.0.1:8188` |
| `ALLOW_ORIGINS` | *(none)* — extra browser origins allowed to call the bridge, comma-separated |

Example: `set COMFY_DIR=D:\other\output && node server.js`

## Notes

- Serve only on a trusted network (home Wi‑Fi or Tailscale). There's no password on the bridge — any device on the same network that knows the address could read your images and use Ollama/ComfyUI.
- Web pages from other sites can't use it: browser requests are only accepted from the HomeTrack app and `localhost` (add more with `ALLOW_ORIGINS`), and requests addressed to unknown domain names are refused (blocks DNS-rebinding tricks).
- The gallery is read-only; the bridge never writes or deletes files.
