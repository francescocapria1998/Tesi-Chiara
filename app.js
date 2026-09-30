(() => {
  "use strict";

  const PDF_URL = "tesi.pdf";
  const KEEP_RADIUS = 4;
  const BASE_W = 595;
  const BASE_H = 842;

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

  function getPageSize() {
    const mobile = isMobile();
    const sideGap = mobile ? 14 : 34;
    const topGap = mobile ? 14 : 24;

    const availableW = Math.max(260, viewer.clientWidth - sideGap * 2);
    const availableH = Math.max(360, viewer.clientHeight - topGap * 2);
    const visiblePages = mobile ? 1 : 2;

    const scale = Math.min(
      (availableW / visiblePages) / BASE_W,
      availableH / BASE_H
    );

    return {
      width: Math.max(240, Math.floor(BASE_W * scale)),
      height: Math.max(340, Math.floor(BASE_H * scale))
    };
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

  async function renderPage(pageNum) {
    if (!pdfDoc || pageNum < 1 || pageNum > numPages) return;
    if (renderJobs.has(pageNum)) return renderJobs.get(pageNum);

    const el = bookEl.querySelector(`.pdf-page[data-page="${pageNum}"]`);
    if (!el || el.classList.contains("rendered")) return;

    const job = (async () => {
      const pdfPage = await pdfDoc.getPage(pageNum);
      const baseViewport = pdfPage.getViewport({ scale: 1 });

      const cssWidth = getPageSize().width;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const targetWidth = Math.min(
        1600,
        Math.max(760, cssWidth * dpr * 1.2)
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
      .catch(err => console.error(`Errore rendering pagina ${pageNum}:`, err))
      .finally(() => renderJobs.delete(pageNum));

    renderJobs.set(pageNum, job);
    return job;
  }

  function currentPdfPage() {
    if (!pageFlip) return 1;
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
    for (let n = centerPage - KEEP_RADIUS; n <= centerPage + KEEP_RADIUS; n++) {
      if (n >= 1 && n <= numPages) jobs.push(renderPage(n));
    }

    await Promise.allSettled(jobs);
    unloadFarPages(centerPage);
  }

  async function init() {
    try {
      pdfDoc = await pdfjsLib.getDocument({
        url: PDF_URL,
        disableAutoFetch: false,
        disableStream: false,
        disableRange: false
      }).promise;

      numPages = pdfDoc.numPages;

      const fragment = document.createDocumentFragment();

      if (!isMobile()) {
        fragment.appendChild(createBlankPage());
      }

      for (let i = 1; i <= numPages; i++) {
        fragment.appendChild(createPdfPageShell(i));
      }

      bookEl.appendChild(fragment);

      await warmPages(1);

      const pageSize = getPageSize();

      pageFlip = new St.PageFlip(bookEl, {
        width: pageSize.width,
        height: pageSize.height,
        size: "fixed",

        showCover: false,
        usePortrait: true,
        autoSize: false,

        drawShadow: true,
        maxShadowOpacity: 0.32,

        mobileScrollSupport: false,
        flippingTime: 780,

        startPage: 0,
        startZIndex: 0
      });

      pageFlip.loadFromHTML(bookEl.querySelectorAll(".page"));

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

  let oldMobile = isMobile();
  let oldW = window.innerWidth;
  let oldH = window.innerHeight;
  let resizeTimer = null;

  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);

    resizeTimer = setTimeout(() => {
      const mobileChanged = isMobile() !== oldMobile;
      const widthChanged = Math.abs(window.innerWidth - oldW) > 120;
      const heightChanged = Math.abs(window.innerHeight - oldH) > 120;

      if (mobileChanged || widthChanged || heightChanged) {
        window.location.reload();
      }
    }, 280);
  });

  init();
})();