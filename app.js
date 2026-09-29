(() => {
  "use strict";

  const PDF_URL = "tesi.pdf";
  const KEEP_RADIUS = 4;

  const params = new URLSearchParams(window.location.search);
  const forceBook = params.get("mode") === "book";
  const isNarrowScreen = window.matchMedia("(max-width: 760px)").matches;
  // Su desktop inseriamo il retro interno della copertina come pagina bianca.
  // Su smartphone lo omettiamo, così dopo la cover si arriva subito alla prima pagina reale.
  const hasInsideCoverBlank = !isNarrowScreen;

  const mobileLauncher = document.getElementById("mobile-launcher");
  const openBook = document.getElementById("open-book");
  const viewer = document.getElementById("viewer");
  const bookEl = document.getElementById("book");
  const loadingEl = document.getElementById("loading");

  // Costruisce un URL robusto per aprire il flipbook dedicato.
  const dedicatedUrl = new URL(window.location.href);
  dedicatedUrl.searchParams.set("mode", "book");
  openBook.href = dedicatedUrl.toString();

  // Dentro Google Sites su telefono mostriamo solo copertina + pulsante.
  if (isNarrowScreen && !forceBook) {
    mobileLauncher.hidden = false;
    viewer.hidden = true;
    return;
  }

  // Desktop oppure apertura dedicata da smartphone: mostra il libro.
  document.body.classList.add("book-mode");
  mobileLauncher.hidden = true;
  viewer.hidden = false;

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  let pdfDoc = null;
  let pageFlip = null;
  let numPages = 0;
  const renderJobs = new Map();

  function createCoverPage() {
    const page = document.createElement("div");
    page.className = "page cover-page rendered";
    page.dataset.kind = "cover";

    const inner = document.createElement("div");
    inner.className = "page-inner";

    const img = document.createElement("img");
    img.className = "cover-image";
    img.src = "cover-generale.png";
    img.alt = "Copertina della tesi";

    inner.appendChild(img);
    page.appendChild(inner);
    return page;
  }


  function createInsideCoverBlankPage() {
    const page = document.createElement("div");
    page.className = "page inside-cover-blank rendered";
    page.dataset.kind = "inside-cover";

    const inner = document.createElement("div");
    inner.className = "page-inner";
    inner.setAttribute("aria-label", "Retro interno della copertina");

    page.appendChild(inner);
    return page;
  }

  function createPdfPageShell(pageNum) {
    const page = document.createElement("div");
    page.className = "page pdf-page";
    page.dataset.kind = "pdf";
    page.dataset.page = String(pageNum);

    const inner = document.createElement("div");
    inner.className = "page-inner";

    const canvas = document.createElement("canvas");
    canvas.className = "page-canvas";
    canvas.setAttribute("aria-label", `Pagina ${pageNum}`);

    const placeholder = document.createElement("div");
    placeholder.className = "page-placeholder";
    placeholder.textContent = `Pagina ${pageNum}`;

    inner.append(canvas, placeholder);
    page.append(inner);
    return page;
  }

  function wantedCssPageWidth() {
    const visiblePages = window.matchMedia("(max-width: 760px)").matches ? 1 : 2;
    const available = Math.max(300, viewer.clientWidth - (visiblePages === 1 ? 10 : 40));
    return Math.min(720, available / visiblePages);
  }

  async function renderPage(pageNum) {
    if (!pdfDoc || pageNum < 1 || pageNum > numPages) return;
    if (renderJobs.has(pageNum)) return renderJobs.get(pageNum);

    const el = bookEl.querySelector(`.pdf-page[data-page="${pageNum}"]`);
    if (!el || el.classList.contains("rendered")) return;

    const job = (async () => {
      const pdfPage = await pdfDoc.getPage(pageNum);
      const base = pdfPage.getViewport({ scale: 1 });

      const cssWidth = wantedCssPageWidth();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetWidth = Math.min(1350, Math.max(760, cssWidth * dpr * 1.10));
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
      .catch(err => console.error(`Errore pagina ${pageNum}:`, err))
      .finally(() => renderJobs.delete(pageNum));

    renderJobs.set(pageNum, job);
    return job;
  }

  function bookIndexToPdfPage(index) {
    // Desktop: 0 = cover, 1 = retro bianco, 2 = PDF 1.
    // Mobile:  0 = cover, 1 = PDF 1.
    const pdfPage = hasInsideCoverBlank ? index - 1 : index;
    return Math.max(1, Math.min(numPages, pdfPage));
  }

  function currentPdfPage() {
    if (!pageFlip) return 1;
    return bookIndexToPdfPage(pageFlip.getCurrentPageIndex());
  }

  function unloadFarPages(centerPage) {
    bookEl.querySelectorAll(".pdf-page").forEach(el => {
      const n = Number(el.dataset.page);
      if (Math.abs(n - centerPage) <= KEEP_RADIUS) return;

      const canvas = el.querySelector("canvas");
      if (canvas && (canvas.width || canvas.height)) {
        canvas.width = 0;
        canvas.height = 0;
        el.classList.remove("rendered");
      }
    });
  }

  async function warmPages(centerPage) {
    const jobs = [];
    for (let n = centerPage - KEEP_RADIUS; n <= centerPage + KEEP_RADIUS; n++) {
      if (n >= 1 && n <= numPages) jobs.push(renderPage(n));
    }
    await Promise.allSettled(jobs);
    unloadFarPages(centerPage);
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

      const fragment = document.createDocumentFragment();
      fragment.appendChild(createCoverPage());
      if (hasInsideCoverBlank) {
        fragment.appendChild(createInsideCoverBlankPage());
      }
      for (let i = 1; i <= numPages; i++) {
        fragment.appendChild(createPdfPageShell(i));
      }
      bookEl.appendChild(fragment);

      await warmPages(1);

      pageFlip = new St.PageFlip(bookEl, {
        width: 595,
        height: 842,
        size: "stretch",
        minWidth: 280,
        maxWidth: 720,
        minHeight: 397,
        maxHeight: 1020,
        showCover: true,
        usePortrait: true,
        autoSize: true,
        drawShadow: true,
        maxShadowOpacity: 0.35,
        mobileScrollSupport: false,
        flippingTime: 720,
        startZIndex: 0
      });

      pageFlip.loadFromHTML(bookEl.querySelectorAll(".page"));

      pageFlip.on("flip", async (event) => {
        await warmPages(bookIndexToPdfPage(Number(event.data)));
      });

      pageFlip.on("changeOrientation", async () => {
        await warmPages(currentPdfPage());
      });

      loadingEl.classList.add("hidden");
    } catch (err) {
      console.error(err);
      loadingEl.classList.add("hidden");
    }
  }

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => warmPages(currentPdfPage()), 220);
  });

  init();
})();
