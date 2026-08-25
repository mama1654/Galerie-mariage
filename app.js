// Build photos list by reading the `assets/` folder when possible.
// Fallback: use the previously generated naming scheme.
async function buildPhotoList() {
  // Try to fetch the directory listing first (works with simple static servers like python -m http.server)
  try {
    const resp = await fetch("assets/");
    if (resp.ok) {
      const text = await resp.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "text/html");
      const links = Array.from(doc.querySelectorAll("a"))
        .map((a) => a.getAttribute("href"))
        .filter((h) => h && /\.(jpe?g|png|webp)$/i.test(h));
      if (links.length) return links;
    }
  } catch (e) {
    // ignore
  }

  // Fallback: Try to load an optional manifest (assets/manifest.json should be a JSON array of filenames)
  try {
    const m = await fetch("assets/manifest.json");
    if (m.ok) {
      const list = await m.json();
      if (Array.isArray(list) && list.length) return list;
    }
  } catch (e) {
    // ignore
  }

  // Fallback to the generated naming pattern (keeps backward compatibility)
  const totalPhotos = 335;
  return [
    "hero-bg.jpg",
    ...Array.from({ length: totalPhotos }, (_, index) => `mariage éléna & arthur-${index + 1}.jpg`),
  ];
}

// photos will be populated at runtime by init()
let photos = [];


const gallery = document.getElementById("gallery");
const downloadAllButton = document.getElementById("download-all");

async function createDownloadLink(url, filename) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Impossible de télécharger ${url}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } catch (error) {
    console.error("Erreur lors du téléchargement de l’image.", error);
    const link = document.createElement("a");
    link.href = encodeURI(url);
    link.download = filename;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
}

let currentLightboxIndex = 0;

function openLightbox(index) {
  const photo = photos[index];
  if (!photo) return;
  currentLightboxIndex = index;

  const existing = document.querySelector(".lightbox");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "lightbox";
  overlay.innerHTML = `
    <div class="lightbox__backdrop"></div>
    <div class="lightbox__content">
      <button class="lightbox__close" aria-label="Fermer">×</button>
      <button class="lightbox__nav lightbox__nav--prev" aria-label="Image précédente">‹</button>
      <div class="lightbox__frame">
        <img src="${encodeURI(photo.src)}" alt="${photo.title}" />
        <div class="lightbox__actions">
          <button class="lightbox__download" data-index="${index}" aria-label="Télécharger l’image">Télécharger</button>
        </div>
        <p class="lightbox__caption">${photo.title}</p>
      </div>
      <button class="lightbox__nav lightbox__nav--next" aria-label="Image suivante">›</button>
    </div>
  `;

  overlay.addEventListener("click", (event) => {
    if (event.target === overlay || event.target.classList.contains("lightbox__close") || event.target.classList.contains("lightbox__backdrop")) {
      overlay.remove();
    }
  });

  overlay.querySelector(".lightbox__nav--prev").addEventListener("click", (event) => {
    event.stopPropagation();
    navigateLightbox(-1);
  });

  overlay.querySelector(".lightbox__nav--next").addEventListener("click", (event) => {
    event.stopPropagation();
    navigateLightbox(1);
  });

  overlay.querySelector(".lightbox__download").addEventListener("click", (event) => {
    event.stopPropagation();
    downloadSingle(index);
  });

  document.body.appendChild(overlay);
  document.addEventListener("keydown", onLightboxKeydown);
}

function navigateLightbox(direction) {
  const nextIndex = (currentLightboxIndex + direction + photos.length) % photos.length;
  openLightbox(nextIndex);
}

function onLightboxKeydown(event) {
  const lightbox = document.querySelector(".lightbox");
  if (!lightbox) return;
  if (event.key === "ArrowRight") {
    navigateLightbox(1);
  } else if (event.key === "ArrowLeft") {
    navigateLightbox(-1);
  } else if (event.key === "Escape") {
    lightbox.remove();
    document.removeEventListener("keydown", onLightboxKeydown);
  }
}

function renderGallery() {
  if (!gallery) return;
  gallery.innerHTML = "";

  photos.forEach((photo, index) => {
    const card = document.createElement("article");
    card.className = "card";

    const img = document.createElement("img");
    img.src = encodeURI(photo.src);
    img.alt = photo.title;
    img.dataset.index = index;

    const body = document.createElement("div");
    body.className = "card__body";

    const title = document.createElement("h3");
    title.className = "card__title";
    title.textContent = photo.title;

    const meta = document.createElement("p");
    meta.className = "card__meta";
    meta.textContent = photo.meta;

    const actions = document.createElement("div");
    actions.className = "card__actions";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn download-btn";
    btn.dataset.index = index;
    btn.textContent = "Télécharger";

    actions.appendChild(btn);
    body.appendChild(title);
    body.appendChild(meta);
    body.appendChild(actions);

    card.appendChild(img);
    card.appendChild(body);

    gallery.appendChild(card);
  });
}

function downloadSingle(index) {
  const photo = photos[index];
  if (!photo) return;

  const extension = photo.src.split(".").pop() || "jpg";
  const filename = `${photo.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}.${extension}`;

  createDownloadLink(photo.src, filename);
}

async function downloadAll() {
  if (typeof JSZip === "undefined") {
    photos.forEach((photo, index) => {
      setTimeout(() => downloadSingle(index), index * 180);
    });
    return;
  }

  const zip = new JSZip();
  const zipName = "mariage-elena-arthur.zip";

  try {
    await Promise.all(
      photos.map(async (photo, index) => {
        const response = await fetch(photo.src);
        if (!response.ok) {
          throw new Error(`Impossible de télécharger ${photo.src}`);
        }

        const blob = await response.blob();
        const extension = photo.src.split(".").pop() || "jpg";
        const baseName = photo.title
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "photo";

        zip.file(`${index + 1}-${baseName}.${extension}`, blob);
      })
    );

    const archive = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(archive);

    link.href = url;
    link.download = zipName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error("Erreur lors de la création du ZIP de la galerie.", error);
    photos.forEach((photo, index) => {
      setTimeout(() => downloadSingle(index), index * 180);
    });
  }
}

function makeLabel(name) {
  let label = name.replace(/\.(jpe?g|png|webp)$/i, "");
  label = label.replace(/[-_]+/g, " ");
  label = label.replace(/mariage éléna & arthur/i, "Mariage Élena & Arthur");
  return label;
}

async function init() {
  const fileNames = await buildPhotoList();

  photos = fileNames.map((name) => {
    const src = name.startsWith("assets/") ? name : `assets/${name}`;
    const bareName = name.replace(/^assets\//, "");
    return {
      src: src,
      title: makeLabel(bareName),
      meta: "Événement - 2026",
    };
  });

  renderGallery();

  if (downloadAllButton) {
    downloadAllButton.addEventListener("click", downloadAll);
  }

  if (gallery) {
    gallery.addEventListener("click", (event) => {
      const button = event.target.closest(".download-btn");
      if (button) {
        const index = Number(button.dataset.index);
        downloadSingle(index);
        return;
      }

      const image = event.target.closest(".card img");
      if (image) {
        const index = Number(image.dataset.index);
        openLightbox(index);
      }
    });
  }
}

init();



