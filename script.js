// Configuración del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnTTS = document.getElementById('btn-tts');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const pageIndicator = document.getElementById('page-indicator');

let pageFlip = null;
let currentZoom = 1.0;
let textContentByPage = []; // Guarda el texto procesado para la lectura en voz alta
let synth = window.speechSynthesis;
let currentUtterance = null;
let isSpeaking = false;

// 1. Cargar automáticamente el archivo 'cuento.pdf' desde el repositorio al iniciar
document.addEventListener('DOMContentLoaded', () => {
    fetchPDF('cuento.pdf');
});

async function fetchPDF(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`No se encontró el archivo ${url}`);
        const data = await response.arrayBuffer();
        await loadPDF(data);
    } catch (error) {
        console.error('Error al cargar el PDF:', error);
        loading.innerText = 'Error: No se pudo encontrar o cargar el archivo "cuento.pdf" en el repositorio.';
    }
}

async function loadPDF(pdfData) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';
    bookContainer.innerHTML = '';
    textContentByPage = [];

    if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
    }

    try {
        const pdf = await pdfjsLib.getDocument(pdfData).promise;
        const totalPages = pdf.numPages;

        const firstPage = await pdf.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        // Bucle para procesar cada página del PDF y extraer texto para accesibilidad
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });

            // Extraer texto plano para la síntesis de voz (Text-to-Speech)
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            textContentByPage.push(pageText);

            // Renderizar la página en un canvas
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.setAttribute('tabindex', '0');
            pageDiv.setAttribute('aria-label', `Página ${pageNum}: ${pageText.substring(0, 100)}...`);
            pageDiv.appendChild(canvas);

            bookContainer.appendChild(pageDiv);
        }

        bookContainer.style.display = 'block';

        // Inicializar animación PageFlip
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 300,
            maxWidth: pageWidth,
            minHeight: 400,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.5,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Eventos de animación y sonido al pasar página
        pageFlip.on('flip', (e) => {
            playPageFlipSound();
            stopSpeech();
            updatePageIndicator();
        });

        loading.style.display = 'none';
        updatePageIndicator();

    } catch (error) {
        console.error('Error al procesar el PDF:', error);
        loading.innerText = 'Ocurrió un error al procesar las páginas del cuento.';
    }
}

// 2. Efecto de sonido sintético de pasar página (Web Audio API)
function playPageFlipSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
        console.log('AudioContext no soportado o bloqueado');
    }
}

// 3. Controles de Paginación
btnPrev.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

btnNext.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

function updatePageIndicator() {
    if (!pageFlip) return;
    const page = pageFlip.getCurrentPageIndex() + 1;
    const total = pageFlip.getPageCount();
    pageIndicator.innerText = `Página ${page} de ${total}`;
}

// 4. Lectura en Voz Alta (Text-To-Speech) en Español
btnTTS.addEventListener('click', () => {
    if (isSpeaking) {
        stopSpeech();
    } else {
        readCurrentPage();
    }
});

function readCurrentPage() {
    if (!pageFlip || textContentByPage.length === 0) return;

    const pageIndex = pageFlip.getCurrentPageIndex();
    const textToRead = textContentByPage[pageIndex];

    if (!textToRead || textToRead.trim() === '') {
        speakText('Esta página no contiene texto para leer.');
        return;
    }

    speakText(textToRead);
}

function speakText(text) {
    stopSpeech();

    currentUtterance = new SpeechSynthesisUtterance(text);
    currentUtterance.lang = 'es-ES'; // Configurar voz en español
    currentUtterance.rate = 0.9; // Velocidad ligeramente reducida para baja visión/comprensión clara

    currentUtterance.onstart = () => {
        isSpeaking = true;
        btnTTS.classList.add('tts-active');
        btnTTS.innerText = '⏹ Detener Lectura';
    };

    currentUtterance.onend = () => {
        stopSpeech();
    };

    currentUtterance.onerror = () => {
        stopSpeech();
    };

    synth.speak(currentUtterance);
}

function stopSpeech() {
    if (synth.speaking) {
        synth.cancel();
    }
    isSpeaking = false;
    btnTTS.classList.remove('tts-active');
    btnTTS.innerText = '🔊 Leer en Voz Alta';
}

// 5. Botones para agrandar y achicar la escala/letra del cuento
btnZoomIn.addEventListener('click', () => {
    if (currentZoom < 1.6) {
        currentZoom += 0.15;
        applyZoom();
    }
});

btnZoomOut.addEventListener('click', () => {
    if (currentZoom > 0.7) {
        currentZoom -= 0.15;
        applyZoom();
    }
});

function applyZoom() {
    bookContainer.style.transform = `scale(${currentZoom})`;
    bookContainer.style.transformOrigin = 'top center';
}