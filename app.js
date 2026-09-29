
(() => {
  "use strict";

  const PDF_URL = "tesi.pdf";
  const KEEP_RADIUS = 4;

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const bookEl = document.getElementById("book");
  const loadingEl = document.getElementById("loading");
  const pageLabel = document.getElementById("pageLabel");
  const totalPagesEl = document.getElementById("totalPages");

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const prevSmallBtn = document.getElementById("prevSmallBtn");
  const nextSmallBtn = document.getElementById("nextSmallBtn");
  const firstBtn = document.getElementById("firstBtn");
  const lastBtn = document.getElementById("lastBtn");
  const fullscreenBtn = document.getElementById("fullscreenBtn");
  const viewerShell = document.querySelector(".viewer-shell");

  let pdfDoc = null;
  let pageFlip = null;
  let numPages = 0;
  const renderJobs = new Map();

  function createPageShell(pageNum) {
    const page = document.createElement("div");
    page.className = "page";
    page.dataset.page = String(pageNum);

    const inner = document.createElement("div");
    inner.className = "page-inner";

    const canvas = document.createElement("canvas");
    canvas.className = "page-canvas";
    canvas.setAttribute("aria-label", `Pagina ${pageNum}`);

    const placeholder = document.createElement("div");
    placeholder.className = "page-placeholder";
    placeholder.textContent = pageNum === 1 ? "Copertina" : `Pagina ${pageNum}`;

    inner.append(canvas, placeholder);
    page.append(inner);
    return page;
  }

  function currentLogicalPage() {
    if (!pageFlip) return 1;
    return Math.min(numPages, pageFlip.getCurrentPageIndex() + 1);
  }

  function updateCounter() {
    const p = currentLogicalPage();
    pageLabel.textContent = p === 1 ? "Copertina" : `Pagina ${p}`;
    totalPagesEl.textContent = String(numPages);

    const atStart = p <= 1;
    const atEnd = p >= numPages;

    [prevBtn, prevSmallBtn, firstBtn].forEach(b => b.disabled = atStart);
    [nextBtn, nextSmallBtn, lastBtn].forEach(b => b.disabled = atEnd);
  }

  function wantedCssPageWidth() {
    const stage = document.querySelector(".book-stage");
    const portrait = window.matchMedia("(max-width: 760px)").matches;
    const visiblePages = portrait ? 1 : 2;
    const available = Math.max(300, stage.clientWidth - 24);
    return Math.min(700, available / visiblePages);
  }

  async function renderPage(pageNum) {
    if (!pdfDoc || pageNum < 1 || pageNum > numPages) return;
    if (renderJobs.has(pageNum)) return renderJobs.get(pageNum);

    const el = bookEl.querySelector(`.page[data-page="${pageNum}"]`);
    if (!el || el.classList.contains("rendered")) return;

    const job = (async () => {
      const pdfPage = await pdfDoc.getPage(pageNum);
      const base = pdfPage.getViewport({ scale: 1 });

      const cssWidth = wantedCssPageWidth();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetWidth = Math.min(1350, Math.max(760, cssWidth * dpr * 1.15));
      const scale = targetWidth / base.width;
      const viewport = pdfPage.getViewport({ scale });

      const canvas = el.querySelector("canvas");
      const ctx = canvas.getContext("2d", { alpha: false });

      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      await pdfPage.render({
        canvasContext: ctx,
        viewport,
        background: "rgb(255,255,255)"
      }).promise;

      el.classList.add("rendered");
    })()
    .catch(err => {
      console.error(`Errore nel rendering della pagina ${pageNum}:`, err);
    })
    .finally(() => {
      renderJobs.delete(pageNum);
    });

    renderJobs.set(pageNum, job);
    return job;
  }

  function unloadFarPages(center) {
    const pages = bookEl.querySelectorAll(".page");
    pages.forEach(el => {
      const n = Number(el.dataset.page);
      if (Math.abs(n - center) <= KEEP_RADIUS) return;

      const canvas = el.querySelector("canvas");
      if (canvas && (canvas.width || canvas.height)) {
        canvas.width = 0;
        canvas.height = 0;
        el.classList.remove("rendered");
      }
    });
  }

  async function warmPages(center) {
    const jobs = [];
    for (let n = center - KEEP_RADIUS; n <= center + KEEP_RADIUS; n++) {
      if (n >= 1 && n <= numPages) jobs.push(renderPage(n));
    }
    await Promise.allSettled(jobs);
    unloadFarPages(center);
  }

  function goPrev() {
    if (pageFlip) pageFlip.flipPrev("top");
  }

  function goNext() {
    if (pageFlip) pageFlip.flipNext("top");
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await viewerShell.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Fullscreen non disponibile:", err);
    }
  }

  async function init() {
    try {
      const task = pdfjsLib.getDocument({
        url: PDF_URL,
        disableAutoFetch: false,
        disableStream: false,
        disableRange: false
      });

      pdfDoc = await task.promise;
      numPages = pdfDoc.numPages;
      totalPagesEl.textContent = String(numPages);

      const fragment = document.createDocumentFragment();
      for (let i = 1; i <= numPages; i++) {
        fragment.appendChild(createPageShell(i));
      }
      bookEl.appendChild(fragment);

      // Renderizza subito la copertina e le pagine adiacenti.
      await warmPages(1);

      pageFlip = new St.PageFlip(bookEl, {
        width: 595,
        height: 842,
        size: "stretch",
        minWidth: 280,
        maxWidth: 700,
        minHeight: 396,
        maxHeight: 990,
        maxShadowOpacity: 0.32,
        showCover: true,
        mobileScrollSupport: false,
        usePortrait: true,
        autoSize: true,
        drawShadow: true,
        flippingTime: 720,
        startZIndex: 0
      });

      pageFlip.loadFromHTML(bookEl.querySelectorAll(".page"));

      pageFlip.on("flip", async (event) => {
        const logical = Math.min(numPages, Number(event.data) + 1);
        await warmPages(logical);
        updateCounter();
      });

      pageFlip.on("changeOrientation", async () => {
        await warmPages(currentLogicalPage());
      });

      updateCounter();
      loadingEl.classList.add("hidden");
    } catch (err) {
      console.error(err);
      loadingEl.innerHTML = `
        <div style="max-width:520px;text-align:center;padding:24px;font-family:Arial,sans-serif;color:#7b2130">
          <strong>Non riesco ad aprire la tesi.</strong><br><br>
          Verifica che <code>tesi.pdf</code> sia nella stessa cartella di questa pagina e che il sito sia aperto tramite HTTPS.
        </div>`;
    }
  }

  prevBtn.addEventListener("click", goPrev);
  prevSmallBtn.addEventListener("click", goPrev);
  nextBtn.addEventListener("click", goNext);
  nextSmallBtn.addEventListener("click", goNext);

  firstBtn.addEventListener("click", () => {
    if (pageFlip) pageFlip.flip(0, "top");
  });

  lastBtn.addEventListener("click", () => {
    if (pageFlip) pageFlip.flip(numPages - 1, "top");
  });

  fullscreenBtn.addEventListener("click", toggleFullscreen);

  document.addEventListener("fullscreenchange", () => {
    const label = fullscreenBtn.querySelector("span");
    if (label) label.textContent = document.fullscreenElement ? "Esci" : "Schermo intero";
    setTimeout(() => warmPages(currentLogicalPage()), 120);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") goPrev();
    if (event.key === "ArrowRight") goNext();
    if (event.key === "Home" && pageFlip) pageFlip.flip(0, "top");
    if (event.key === "End" && pageFlip) pageFlip.flip(numPages - 1, "top");
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => warmPages(currentLogicalPage()), 220);
  });

  init();
})();
