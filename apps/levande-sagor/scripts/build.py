"""Wraps the app page (app/levande-sagor.html, the same file published as the Claude artifact)
into public/index.html for the standalone version: real <head>, PWA tags, and the bridge
script that talks to our own server instead of a Claude account."""
import pathlib, sys

root = pathlib.Path(__file__).resolve().parent.parent
page = (root / 'app' / 'levande-sagor.html').read_text(encoding='utf-8')

split = page.index('<header class="bar"')
head_part, body_part = page[:split], page[split:]

def patch(text, old, new):
    if old not in text:
        sys.exit(f'build: expected text not found: {old[:60]!r}')
    return text.replace(old, new, 1)

# Standalone copy for errors that only make sense inside Claude.
body_part = patch(body_part,
    "not_granted: 'Claude fick inte skriva sagor här. Du kan ändra det under sidans behörigheter.'",
    "not_granted: 'Appen saknar sin familjekod. Öppna appen en gång med länken du fick, så kommer den ihåg koden.'")
body_part = patch(body_part,
    "session_expired: 'Du behöver logga in i Claude igen.'",
    "session_expired: 'Appen saknar sin familjekod. Öppna appen en gång med länken du fick.'")
body_part = patch(body_part, '<script>\n(() => {', '<script src="/claude-shim.js"></script>\n<script>\n(() => {')

head = f'''<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Barnens teckningar vaknar och får egna sagor, upplästa på svenska.">
<meta name="theme-color" content="#27317C">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Sagor">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<style>:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0;font:14px system-ui,sans-serif}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
{head_part.strip()}
</head>
<body>
'''
out = head + body_part.strip() + '\n</body>\n</html>\n'
(root / 'public' / 'index.html').write_text(out, encoding='utf-8')
print(f'public/index.html: {len(out.encode()) // 1024} KB')
