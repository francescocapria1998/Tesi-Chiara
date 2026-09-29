(() => {
  "use strict";

  const PDF_URL = "tesi.pdf";
  const KEEP_RADIUS = 4;

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const bookEl = document.getElementById("book");
  const loadingEl = document.getElementById("loading");

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
    img.src = "cover.png";
    img.alt = "Copertina della tesi";

    inner.appendChild(img);
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
    const viewer = document.getElementById("viewer");
    const portrait = window.matchMedia("(max-width: 760px)").matches;
    const visiblePages = portrait ? 1 : 2;
    const available = Math.max(320, viewer.clientWidth - 40);
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
      .catch(err => console.error(`Errore nel rendering della pagina ${pageNum}:`, err))
      .finally(() => renderJobs.delete(pageNum));

    renderJobs.set(pageNum, job);
    return job;
  }

  function currentPdfPage() {
    if (!pageFlip) return 1;
    const index = pageFlip.getCurrentPageIndex();
    return Math.max(1, Math.min(numPages, index));
  }

  function unloadFarPages(centerPage) {
    const pages = bookEl.querySelectorAll(".pdf-page");
    pages.forEach(el => {
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
      for (let i = 1; i <= numPages; i++) {
        fragment.appendChild(createPdfPageShell(i));
      }
      bookEl.appendChild(fragment);

      await warmPages(1);

      pageFlip = new St.PageFlip(bookEl, {
        width: 595,
        height: 842,
        size: "stretch",
        minWidth: 300,
        maxWidth: 720,
        minHeight: 425,
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
        const centerPage = Math.max(1, Math.min(numPages, Number(event.data)));
        await warmPages(centerPage);
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
