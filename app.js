(() => {
  "use strict";

  const PDF_URL = "tesi.pdf";
  const KEEP_RADIUS = 4;

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const viewer = document.getElementById("viewer");
  const bookEl = document.getElementById("book");
  const loadingEl = document.getElementById("loading");

  let pdfDoc = null;
  let pageFlip = null;
  let numPages = 0;

  const renderJobs = new Map();

  function isMobile() {
    return window.matchMedia("(max-width: 760px)").matches;
  }

  function createBlankPage() {
    const page = document.createElement("div");
    page.className = "page blank-page rendered";
    page.dataset.density = "soft";

    const inner = document.createElement("div");
    inner.className = "page-inner";
    inner.setAttribute("aria-hidden", "true");

    page.appendChild(inner);
    return page;
  }

  function createPdfPageShell(pageNum) {
    const page = document.createElement("div");
    page.className = "page pdf-page";
    page.dataset.page = String(pageNum);

    // Tutte le pagine, compresa la prima, devono comportarsi come carta.
    page.dataset.density = "soft";

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
    const visiblePages = isMobile() ? 1 : 2;
    const horizontalMargin = isMobile() ? 12 : 48;
    const available = Math.max(280, viewer.clientWidth - horizontalMargin);

    return Math.min(720, available / visiblePages);
  }

  async function renderPage(pageNum) {
    if (!pdfDoc || pageNum < 1 || pageNum > numPages) return;
    if (renderJobs.has(pageNum)) return renderJobs.get(pageNum);

    const el = bookEl.querySelector(`.pdf-page[data-page="${pageNum}"]`);

    if (!el || el.classList.contains("rendered")) return;

    const job = (async () => {
      const pdfPage = await pdfDoc.getPage(pageNum);
      const baseViewport = pdfPage.getViewport({ scale: 1 });

      const cssWidth = wantedCssPageWidth();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const targetWidth = Math.min(
        1500,
        Math.max(760, cssWidth * dpr * 1.15)
      );

      const scale = targetWidth / baseViewport.width;
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
        console.error(`Errore rendering pagina ${pageNum}:`, err);
      })
      .finally(() => {
        renderJobs.delete(pageNum);
      });

    renderJobs.set(pageNum, job);
    return job;
  }

  function currentPdfPage() {
    if (!pageFlip) return 1;

    // Su desktop c'è una pagina bianca iniziale solo per mantenere
    // la prima pagina del PDF sul lato destro del libro.
    const blankOffset = isMobile() ? 0 : 1;

    return Math.max(
      1,
      Math.min(
        numPages,
        pageFlip.getCurrentPageIndex() + 1 - blankOffset
      )
    );
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

    for (
      let n = centerPage - KEEP_RADIUS;
      n <= centerPage + KEEP_RADIUS;
      n++
    ) {
      if (n >= 1 && n <= numPages) {
        jobs.push(renderPage(n));
      }
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

      /*
       * Desktop: aggiungiamo una pagina bianca iniziale.
       * In questo modo la pagina 1 del PDF compare a destra, ma NON viene
       * trattata come copertina rigida.
       *
       * Mobile: nessuna pagina bianca; si parte direttamente da pagina 1.
       */
      if (!isMobile()) {
        fragment.appendChild(createBlankPage());
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

        minWidth: 270,
        maxWidth: 720,

        minHeight: 382,
        maxHeight: 1020,

        /*
         * IMPORTANTE:
         * showCover:true trasforma automaticamente prima e ultima pagina
         * in pagine "hard". Disattivandolo, la pagina 1 si piega come tutte
         * le altre.
         */
        showCover: false,

        usePortrait: true,
        autoSize: true,

        drawShadow: true,
        maxShadowOpacity: 0.32,

        mobileScrollSupport: false,
        flippingTime: 780,

        startPage: 0,
        startZIndex: 0
      });

      pageFlip.loadFromHTML(
        bookEl.querySelectorAll(".page")
      );

      pageFlip.on("flip", async event => {
        const blankOffset = isMobile() ? 0 : 1;

        const centerPage = Math.max(
          1,
          Math.min(
            numPages,
            Number(event.data) + 1 - blankOffset
          )
        );

        await warmPages(centerPage);
      });

      pageFlip.on("changeOrientation", async () => {
        await warmPages(currentPdfPage());
      });

      loadingEl.classList.add("hidden");
    } catch (error) {
      console.error(error);
      loadingEl.classList.add("hidden");
    }
  }

  let resizeTimer = null;

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(() => {
      warmPages(currentPdfPage());
    }, 220);
  });

  init();
})();