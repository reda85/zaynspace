# Vidéo promo zaynspace

`zaynspace-promo.mp4` : 9:16 · 1080×1920 · ~49 s, avec musique. Pour TikTok,
Instagram Reels, YouTube Shorts et LinkedIn.

Elle montre le mobile et le web dans la même histoire : une réserve posée sur le
plan depuis le chantier (pin, photo annotée, dictée vocale, mode hors ligne),
qui arrive en temps réel sur le web (suivi jusqu'à la levée, équipe et invités,
rapport PDF en un clic). Charte de zaynspace.com : bleu nuit `#0f172a`,
émeraude `#10b981`, titres Lexend, texte Outfit, logo blanc sur carré bleu nuit.

## Musique

Bande-son originale synthétisée par `music.py` (aucun échantillon, aucun droit
à payer), calée sur le montage : impact au logo, whoosh à chaque scène, clics et
cloches sur les moments forts. Volume normalisé à -14 LUFS. Pour un son tendance
TikTok à la place, baissez le son d'origine à 0 dans l'éditeur de TikTok.

## Modifier et ré-exporter

Textes, minutage et couleurs sont dans `zaynspace-promo.html` (ouvrez-le dans un
navigateur pour le prévisualiser). Export, avec Node, Playwright (Chromium),
ffmpeg et python3 + numpy :

```bash
node marketing/motion/render.mjs           # avec musique
node marketing/motion/render.mjs --mute    # sans musique
```
