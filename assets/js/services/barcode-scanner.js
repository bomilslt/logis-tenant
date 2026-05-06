/**
 * BarcodeScanner Service
 * ======================
 * Scan de codes-barres via la caméra de l'appareil.
 *
 * Stratégie :
 *   1. BarcodeDetector (API native) + getUserMedia → scan vidéo en temps réel
 *      Supporté sur : Chrome ≥ 83, Edge ≥ 83, Opera, Samsung Internet, Chrome Android
 *   2. Fallback : <input capture="environment"> → l'OS ouvre l'appareil photo natif,
 *      l'utilisateur prend une photo, BarcodeDetector lit l'image.
 *   3. Dernier recours : message d'aide (scan physique ou saisie manuelle).
 */

const BarcodeScanner = (() => {

    // Formats de codes-barres courants pour la logistique
    const BARCODE_FORMATS = [
        'code_128', 'code_39', 'code_93',
        'ean_13', 'ean_8',
        'qr_code', 'data_matrix',
        'itf', 'aztec'
    ];

    /**
     * Vérifie si BarcodeDetector est disponible dans ce navigateur
     */
    function isNativeSupported() {
        return 'BarcodeDetector' in window;
    }

    /**
     * Vérifie si getUserMedia est disponible (caméra en continu)
     */
    function isCameraStreamSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    /**
     * Lance le scan caméra en mode vidéo (temps réel).
     * Injecte un overlay vidéo dans `containerEl` et appelle `onDetected(value)`
     * dès qu'un code est lu.
     *
     * @param {HTMLElement} containerEl  - Conteneur où injecter l'UI caméra
     * @param {Function}    onDetected   - Appelé avec la valeur du code détecté
     * @returns {Function}  stopFn - Appelé pour stopper le scan et libérer la caméra
     */
    async function startLiveScan(containerEl, onDetected) {
        let stream = null;
        let animFrameId = null;
        let stopped = false;

        const detector = new BarcodeDetector({ formats: BARCODE_FORMATS });

        containerEl.innerHTML = `
            <div class="cam-scan-container" id="cam-scan-container">
                <div class="cam-scan-viewport">
                    <video id="cam-scan-video" playsinline autoplay muted></video>
                    <div class="cam-scan-overlay">
                        <div class="cam-scan-frame"></div>
                        <div class="cam-scan-beam"></div>
                    </div>
                </div>
                <p class="cam-scan-hint">Pointez vers le code-barres</p>
                <button class="btn btn-ghost btn-sm cam-scan-stop" id="btn-cam-stop">
                    Annuler
                </button>
            </div>
        `;

        const video = document.getElementById('cam-scan-video');
        const stopBtn = document.getElementById('btn-cam-stop');

        const stopFn = () => {
            stopped = true;
            if (animFrameId) cancelAnimationFrame(animFrameId);
            if (stream) stream.getTracks().forEach(t => t.stop());
            const el = document.getElementById('cam-scan-container');
            if (el) el.remove();
        };

        stopBtn?.addEventListener('click', stopFn);

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            video.srcObject = stream;
            await video.play();
        } catch (err) {
            stopFn();
            throw err;
        }

        const scanLoop = async () => {
            if (stopped) return;
            try {
                const barcodes = await detector.detect(video);
                if (barcodes.length > 0) {
                    const value = barcodes[0].rawValue;
                    stopFn();
                    onDetected(value);
                    return;
                }
            } catch {
                // ignorer les erreurs de frame (video pas encore prête)
            }
            animFrameId = requestAnimationFrame(scanLoop);
        };

        video.addEventListener('playing', () => { scanLoop(); }, { once: true });

        return stopFn;
    }

    /**
     * Scan via capture photo (input[capture]).
     * Ouvre l'appareil photo natif, l'utilisateur prend une photo,
     * puis on tente de lire le code sur l'image.
     *
     * @param {Function} onDetected  - Appelé avec la valeur détectée
     * @param {Function} onFail      - Appelé si aucun code trouvé sur la photo
     */
    function startCaptureScan(onDetected, onFail) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';

        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) { onFail?.('Aucune photo sélectionnée'); return; }

            if (!isNativeSupported()) {
                onFail?.('BarcodeDetector non disponible sur ce navigateur. Utilisez le scanner physique ou saisissez le code manuellement.');
                return;
            }

            try {
                const img = await createImageBitmap(file);
                const detector = new BarcodeDetector({ formats: BARCODE_FORMATS });
                const barcodes = await detector.detect(img);
                if (barcodes.length > 0) {
                    onDetected(barcodes[0].rawValue);
                } else {
                    onFail?.('Aucun code-barres détecté sur la photo. Réessayez ou utilisez le scanner physique.');
                }
            } catch (e) {
                onFail?.('Erreur de lecture : ' + (e.message || e));
            }
        });

        input.click();
    }

    /**
     * Point d'entrée principal.
     * Choisit automatiquement la meilleure méthode disponible.
     *
     * @param {HTMLElement} containerEl   - Zone d'injection de l'UI caméra (pour le live scan)
     * @param {Function}    onDetected    - cb(value: string)
     * @param {Function}    onError       - cb(message: string)
     * @returns {Promise<Function|null>}  stopFn (uniquement pour live scan)
     */
    async function scan(containerEl, onDetected, onError) {
        if (isNativeSupported() && isCameraStreamSupported()) {
            // Scan vidéo en temps réel
            try {
                return await startLiveScan(containerEl, onDetected);
            } catch (err) {
                if (err.name === 'NotAllowedError') {
                    onError?.('Accès caméra refusé. Activez la permission caméra dans les paramètres du navigateur.');
                } else if (err.name === 'NotFoundError') {
                    onError?.('Aucune caméra détectée sur cet appareil.');
                } else {
                    // Si le stream échoue, tenter le fallback photo
                    startCaptureScan(onDetected, onError);
                }
            }
        } else if (isNativeSupported()) {
            // BarcodeDetector dispo mais pas de stream → photo capture
            startCaptureScan(onDetected, onError);
        } else {
            // Navigateur non supporté
            onError?.('La détection de codes-barres via caméra n\'est pas disponible sur ce navigateur. Utilisez le scanner physique ou saisissez le code manuellement.');
        }
        return null;
    }

    return { scan, isNativeSupported, isCameraStreamSupported };
})();

window.BarcodeScanner = BarcodeScanner;
