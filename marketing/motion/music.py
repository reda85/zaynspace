"""
Bande-son originale de la vidéo zaynspace, synthétisée (aucun échantillon,
aucun droit d'auteur) et calée sur les repères de l'animation.

    python3 music.py repères.json sortie.wav

repères.json vient de window.__cues dans zaynspace-promo.html :
  duration  durée de la vidéo (s)
  drop      apparition du logo : impact, puis le morceau démarre
  whoosh    changements de scène
  ticks     clics, photo, éléments synchronisés : petits clics
  dings     moments forts (pin posé, synchro, réserve levée, rapport)
  cta       apparition du bouton « Commencer gratuitement »

Pop électro lumineuse à 112 BPM, progression fa – sol – mi mineur – la mineur.
Seule dépendance : numpy.
"""
import json
import sys
import wave

import numpy as np

SR = 44100
BPM = 112
BEAT = 60 / BPM
BAR = 4 * BEAT
rng = np.random.default_rng(7)


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


# fa – sol – mi mineur – la mineur (un accord par mesure, en do majeur)
CHORDS = [
    (41, [57, 60, 64]),  # Fmaj7 (sans fondamentale aiguë)
    (43, [55, 59, 62]),  # G
    (40, [55, 59, 64]),  # Em
    (45, [57, 60, 64]),  # Am
]


def env_adsr(n, a, d, s, r, sustain_len):
    """Enveloppe ADSR échantillonnée (durées en secondes)."""
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    hold = max(0, int(sustain_len * SR) - a - d)
    e = np.concatenate([
        np.linspace(0, 1, max(a, 1), endpoint=False),
        np.linspace(1, s, max(d, 1), endpoint=False),
        np.full(hold, s),
        np.linspace(s, 0, max(r, 1)),
    ])
    out = np.zeros(n)
    out[: min(n, len(e))] = e[:n]
    return out


def additive(freq, dur, harmonics, decay=None, detune=0.0):
    """Onde riche à spectre limité (somme d'harmoniques 1/k), sans aliasing."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    sig = np.zeros(n)
    f = freq * 2 ** (detune / 1200)
    for k in range(1, harmonics + 1):
        if f * k > SR / 2.5:
            break
        part = np.sin(2 * np.pi * f * k * t + k * 0.7) / k
        if decay is not None:
            part *= np.exp(-t * decay * (1 + 0.6 * (k - 1)))
        sig += part
    return sig


def fft_filter(x, lo=None, hi=None):
    """Passe-bande idéal par FFT (rapide, suffisant pour du bruit)."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    m = np.ones_like(f)
    if lo:
        m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi:
        m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, len(x))


class Mix:
    def __init__(self, duration):
        self.n = int(duration * SR) + SR
        self.buf = np.zeros((self.n, 2))

    def add(self, sig, at, gain=1.0, pan=0.0):
        i = int(at * SR)
        if i >= self.n or i + len(sig) <= 0:
            return
        j0 = max(0, -i)
        sig = sig[j0:]
        i = max(0, i)
        sig = sig[: self.n - i]
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        self.buf[i : i + len(sig), 0] += sig * gain * l * 1.41
        self.buf[i : i + len(sig), 1] += sig * gain * r * 1.41


# ---------- instruments ----------

def kick():
    t = np.arange(int(0.45 * SR)) / SR
    f = 48 + 110 * np.exp(-t * 28)
    ph = 2 * np.pi * np.cumsum(f) / SR
    click = np.exp(-t * 400) * 0.3
    return np.sin(ph) * np.exp(-t * 7.5) + click


def clap():
    n = int(0.28 * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), 900, 5000)
    e = np.zeros(n)
    for k, off in enumerate((0, 0.011, 0.022)):
        e += np.exp(-np.maximum(t - off, 0) * (180 if k < 2 else 22)) * (t >= off)
    return noise * e / np.max(np.abs(noise)) * 0.8


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    noise = fft_filter(rng.standard_normal(n), 7000)
    return noise / np.max(np.abs(noise)) * np.exp(-t * (18 if open_ else 90))


def pluck(note, dur=0.5):
    s = additive(midi(note), dur, 10, decay=7)
    return s * env_adsr(len(s), 0.003, 0.05, 0.6, dur * 0.6, dur * 0.3)


def pad(notes, dur):
    s = sum(additive(midi(n), dur, 7, detune=d) for n in notes for d in (-7, 7))
    return s * env_adsr(len(s), 0.25, 0.3, 0.8, 0.35, dur - 0.35) / (len(notes) * 2)


def bass(note, dur):
    s = additive(midi(note), dur, 6) + 0.6 * np.sin(2 * np.pi * midi(note) * np.arange(int(dur * SR)) / SR)
    return s * env_adsr(len(s), 0.005, 0.08, 0.7, 0.05, dur - 0.05)


def bell(note, dur=1.6):
    t = np.arange(int(dur * SR)) / SR
    f = midi(note)
    s = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * dcy) for m, a, dcy in
            ((1, 1, 3.2), (2.0, 0.5, 4.5), (3.01, 0.25, 6), (4.2, 0.18, 9), (5.4, 0.1, 12)))
    return s * np.minimum(1, t / 0.002)


def whoosh(dur=0.55):
    n = int(dur * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    low, high = fft_filter(noise, 300, 1800), fft_filter(noise, 2500, 9000)
    x = t / dur
    sweep = low * (1 - x) + high * x
    e = np.sin(np.pi * x) ** 2
    return sweep / np.max(np.abs(sweep)) * e


def tick():
    t = np.arange(int(0.06 * SR)) / SR
    return np.sin(2 * np.pi * 2300 * t) * np.exp(-t * 90) + 0.5 * np.sin(2 * np.pi * 3450 * t) * np.exp(-t * 140)


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = t / dur
    noise = fft_filter(rng.standard_normal(n), 1500)
    noise /= np.max(np.abs(noise))
    tone = np.sin(2 * np.pi * np.cumsum(220 + 900 * x ** 2) / SR)
    return (noise * 0.7 + tone * 0.3) * x ** 2.2


def impact():
    t = np.arange(int(1.4 * SR)) / SR
    f = 40 + 90 * np.exp(-t * 9)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 2.6)
    noise = fft_filter(rng.standard_normal(len(t)), 200, 6000)
    return boom + noise / np.max(np.abs(noise)) * np.exp(-t * 9) * 0.5


# ---------- arrangement ----------

def compose(c):
    dur, drop = c["duration"], c["drop"]
    mix = Mix(dur)
    end = dur - 0.15

    # Accroche : nappe filtrée + tic-tac qui accélère + montée vers l'impact
    intro = pad([53, 57, 60, 64], drop + 0.3)
    mix.add(fft_filter(intro, None, 900), 0, 0.35)
    step = BEAT / 2
    t = 0.0
    while t < drop - 0.05:
        mix.add(tick(), t, 0.10 + 0.15 * t / drop, pan=0.3 if int(t / step) % 2 else -0.3)
        t += step if t < drop * 0.6 else step / 2
    mix.add(riser(drop), 0, 0.16)
    mix.add(impact(), drop, 0.9)

    # Morceau : grille calée sur le logo
    sidechain = np.ones(mix.n)
    bar = 0
    t0 = drop
    while t0 < end:
        root, notes = CHORDS[bar % 4]
        full = bar >= 2                      # batterie complète après deux mesures
        for b in range(4):
            tb = t0 + b * BEAT
            if tb >= end:
                break
            mix.add(kick(), tb, 0.75)
            i = int(tb * SR)
            k = np.arange(min(int(BEAT * SR), mix.n - i)) / SR
            sidechain[i : i + len(k)] = np.minimum(sidechain[i : i + len(k)], 1 - 0.55 * np.exp(-k / 0.11))
            if full and b in (1, 3):
                mix.add(clap(), tb, 0.75, pan=0.05)
            mix.add(hat(open_=full and b == 3), tb + BEAT / 2, 0.30 if full else 0.14, pan=0.25)
            if full:
                mix.add(hat(), tb + BEAT / 4, 0.12, pan=-0.25)
                mix.add(hat(), tb + 3 * BEAT / 4, 0.12, pan=-0.25)
        # basse en croches (octave sautée sur les contretemps)
        for e in range(8):
            te = t0 + e * BEAT / 2
            if te < end:
                mix.add(bass(root + (12 if e % 2 else 0), BEAT / 2 * 0.9), te, 0.20)
        mix.add(pad(notes, min(BAR, end - t0) + 0.3), t0, 0.42)
        # arpège pluck + écho pointé, à partir de la 2e mesure
        if bar >= 1:
            pattern = [0, 1, 2, 1, 0, 2, 1, 2]
            for e, idx in enumerate(pattern):
                te = t0 + e * BEAT / 2
                if te >= end:
                    break
                note = notes[idx] + 12
                p = pluck(note)
                mix.add(p, te, 0.42, pan=-0.35)
                mix.add(p, te + 0.75 * BEAT, 0.16, pan=0.45)
        t0 += BAR
        bar += 1

    # sidechain sur tout sauf la batterie et les effets : appliqué à la piste musicale
    music = mix.buf * sidechain[:, None]
    fx = Mix(dur)
    for w in c["whoosh"]:
        fx.add(whoosh(), w - 0.3, 0.35)
    for tk in c["ticks"]:
        fx.add(tick(), tk, 0.22, pan=0.15)
    for d in c["dings"]:
        fx.add(bell(81), d, 0.32, pan=-0.1)
        fx.add(bell(88, 1.2), d + 0.09, 0.18, pan=0.2)
    if c.get("cta") is not None:
        fx.add(bell(76, 2.2), c["cta"], 0.25)
        fx.add(bell(83, 2.2), c["cta"] + 0.06, 0.18, pan=0.3)
        fx.add(bell(88, 2.2), c["cta"] + 0.12, 0.14, pan=-0.3)

    out = music + fx.buf
    n = int(dur * SR)
    out = out[:n]
    # fondu de sortie sur la dernière seconde
    fade = np.ones(n)
    k = int(1.0 * SR)
    fade[-k:] = np.linspace(1, 0, k) ** 1.5
    out *= fade[:, None]
    # saturation douce sur les crêtes, puis normalisation à -1 dBFS
    # (render.mjs ramène ensuite le tout à -14 LUFS, le niveau des réseaux sociaux)
    out /= np.max(np.abs(out))
    out = np.tanh(out * 1.5) / np.tanh(1.5)
    out *= 10 ** (-1 / 20)
    return out


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    cues = json.load(open(sys.argv[1]))
    write_wav(sys.argv[2], compose(cues))
