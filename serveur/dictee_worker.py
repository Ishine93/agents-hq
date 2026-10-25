# Transcription locale (faster-whisper) : processus permanent qui garde le modèle chargé.
# Entrée : une ligne JSON par demande {"id", "fichier", "vocabulaire", "langue"} sur stdin.
# Sortie : une ligne JSON par réponse {"id", "texte", "duree", "appareil"} ou {"id", "erreur"}.
import json
import os
import sys
import time
from pathlib import Path

# Lancé avec -I (isolé), Python ignore PYTHONIOENCODING : on force l'UTF-8 ici, sinon les accents
# partent en cp1252 et arrivent cassés côté Node.
sys.stdin.reconfigure(encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")

RACINE = Path(__file__).resolve().parent.parent
DICTEE = RACINE / "runtime" / "dictee"

# Les DLL CUDA (cuBLAS, cuDNN) viennent des paquets pip nvidia-* : on les rend trouvables.
site = DICTEE / "venv" / "Lib" / "site-packages" / "nvidia"
for sous in ("cublas", "cudnn", "cuda_runtime", "cuda_nvrtc"):
    d = site / sous / "bin"
    if d.is_dir():
        os.add_dll_directory(str(d))
        os.environ["PATH"] = str(d) + os.pathsep + os.environ.get("PATH", "")

from faster_whisper import WhisperModel  # noqa: E402


def decoder(fichier):
    # Décodage maison (PyAV récent) : faster-whisper appelle av.open avec une option retirée des
    # versions récentes de PyAV. On produit directement le signal 16 kHz mono attendu par Whisper.
    import av
    import numpy as np

    morceaux = []
    with av.open(fichier) as conteneur:
        flux = conteneur.streams.audio[0]
        reechantillonneur = av.AudioResampler(format="s16", layout="mono", rate=16000)
        for trame in conteneur.decode(flux):
            for t in reechantillonneur.resample(trame):
                morceaux.append(t.to_ndarray().reshape(-1))
        for t in reechantillonneur.resample(None):
            morceaux.append(t.to_ndarray().reshape(-1))
    if not morceaux:
        return np.zeros(0, dtype="float32")
    return np.concatenate(morceaux).astype("float32") / 32768.0


def ecrire(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def charger():
    # GPU d'abord avec large-v3 ; sinon CPU (turbo s'il est présent, plus rapide).
    essais = [("cuda", "float16", "large-v3"), ("cpu", "int8", "large-v3-turbo"), ("cpu", "int8", "large-v3")]
    for appareil, calcul, nom in essais:
        chemin = DICTEE / "modeles" / nom
        if not chemin.is_dir():
            continue
        try:
            modele = WhisperModel(str(chemin), device=appareil, compute_type=calcul)
            # Petit essai à vide pour vérifier que les noyaux CUDA tournent vraiment.
            import numpy as np
            list(modele.transcribe(np.zeros(16000, dtype="float32"), language="fr")[0])
            return modele, f"{appareil}/{nom}"
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"[dictee] {appareil}/{nom} indisponible : {e}\n")
    raise RuntimeError("aucun modèle Whisper utilisable")


modele, appareil = charger()
ecrire({"pret": True, "appareil": appareil})

for ligne in sys.stdin:
    try:
        demande = json.loads(ligne)
    except json.JSONDecodeError:
        continue
    debut = time.time()
    try:
        segments, info = modele.transcribe(
            decoder(demande["fichier"]),
            language=demande.get("langue") or "fr",
            initial_prompt=demande.get("vocabulaire") or None,
            vad_filter=True,
            beam_size=5,
        )
        texte = " ".join(s.text.strip() for s in segments).strip()
        ecrire({"id": demande.get("id"), "texte": texte, "duree": round(info.duration, 1), "calcul": round(time.time() - debut, 1), "appareil": appareil})
    except Exception as e:  # noqa: BLE001
        ecrire({"id": demande.get("id"), "erreur": str(e)})
