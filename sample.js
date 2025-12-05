// State variables
let currentTab = "home";
let selectedFile = null; // file ảnh đang được chọn
let probChart = null; // đối tượng Chart.js cho biểu đồ KL
const defaultTheme = "blue";
const themes = [
  { key: "blue", label: "Blue" },
  { key: "cyan", label: "Cyan" },
  { key: "teal", label: "Teal" },
  { key: "emerald", label: "Emerald" },
  { key: "green", label: "Green" },
  { key: "lime", label: "Lime" },
  { key: "amber", label: "Amber" },
  { key: "orange", label: "Orange" },
  { key: "red", label: "Red" },
  { key: "pink", label: "Pink" },
  { key: "purple", label: "Purple" },
  { key: "indigo", label: "Indigo" },
  { key: "white", label: "White / Light" },
];

// Theme switching
function applyTheme(key) {
  const theme = themes.find((t) => t.key === key) ? key : defaultTheme;
  document.documentElement.setAttribute("data-theme", theme);
  const sel = document.getElementById("theme-select");
  if (sel) sel.value = theme;
  try {
    localStorage.setItem("theme-choice", theme);
  } catch (_) {
    /* ignore */
  }
}

// --- Navigation ---
function switchTab(tab) {
  currentTab = tab;
  const homeView = document.getElementById("view-home");
  const toolView = document.getElementById("view-tool");
  const navHome = document.getElementById("nav-home");
  const navIntro = document.getElementById("nav-intro");
  const navKl = document.getElementById("nav-kl");
  const navTool = document.getElementById("nav-tool");

  const resetNav = () => {
    [navHome, navIntro, navKl, navTool].forEach((btn) => {
      if (!btn) return;
      btn.classList.remove("shadow");
      btn.classList.add("bg-transparent", "text-slate-400");
      btn.classList.remove("bg-white/10", "text-white");
    });
  };

  if (tab === "tool") {
    homeView.classList.add("hidden");
    toolView.classList.remove("hidden");
    resetNav();
    navTool.classList.add("shadow");
    navTool.classList.add("bg-white/10", "text-white");
    navTool.classList.remove("bg-transparent", "text-slate-400");
    return;
  }

  // Mặc định: hiển thị HOME và cuộn đến section tương ứng
  homeView.classList.remove("hidden");
  toolView.classList.add("hidden");
  resetNav();

  if (tab === "home-intro") {
    navIntro.classList.add("shadow");
    navIntro.classList.add("bg-white/10", "text-white");
    document
      .getElementById("section-intro")
      .scrollIntoView({ behavior: "smooth" });
  } else if (tab === "home-kl") {
    navKl.classList.add("shadow");
    navKl.classList.add("bg-white/10", "text-white");
    document
      .getElementById("section-kl")
      .scrollIntoView({ behavior: "smooth" });
  } else {
    navHome.classList.add("shadow");
    navHome.classList.add("bg-white/10", "text-white");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

// --- File Handling ---
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const themeSelect = document.getElementById("theme-select");

dropZone.addEventListener("click", () => fileInput.click());
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("border-medical-500", "bg-slate-800");
});
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("border-medical-500", "bg-slate-800");
});
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("border-medical-500", "bg-slate-800");
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});

function triggerUpload() {
  fileInput.click();
}
function handleFileSelect(e) {
  if (e.target.files.length) handleFile(e.target.files[0]);
}

function handleFile(file) {
  if (!file) return;
  const isImage =
    file.type.startsWith("image/") ||
    /\.(png|jpg|jpeg|bmp)$/i.test(file.name);
  if (!isImage) {
    showError("File không hợp lệ. Chỉ nhận PNG/JPG/JPEG/BMP.");
    return;
  }

  selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("image-preview").src = e.target.result;
    document.getElementById("empty-state").classList.add("hidden");
    document
      .getElementById("preview-container")
      .classList.remove("hidden");
    document.getElementById("analyzeBtn").disabled = false;

    // Reset state
    document.getElementById("state-result").classList.add("hidden");
    document.getElementById("state-waiting").classList.remove("hidden");
    document.getElementById("roi-box").classList.add("hidden");
    hideError();
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  document.getElementById("file-input").value = "";
  document.getElementById("image-preview").src = "#";
  document.getElementById("preview-container").classList.add("hidden");
  document.getElementById("empty-state").classList.remove("hidden");
  document.getElementById("analyzeBtn").disabled = true;
  document.getElementById("state-result").classList.add("hidden");
  document.getElementById("state-waiting").classList.remove("hidden");
  document
    .getElementById("preview-container")
    .classList.remove("scanning");
  selectedFile = null;
  hideError();
}

// --- Analysis Logic: gọi API /predict giống index.html ---
async function processImage() {
  if (!selectedFile) {
    alert("Vui lòng chọn ảnh X-quang trước.");
    return;
  }

  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;
  document.getElementById("state-waiting").classList.add("hidden");
  document.getElementById("state-result").classList.add("hidden");
  document.getElementById("state-loading").classList.remove("hidden");
  document.getElementById("preview-container").classList.add("scanning");
  hideError();

  const fd = new FormData();
  fd.append("file", selectedFile, selectedFile.name);
  const t0 = performance.now();

  try {
    const res = await fetch("/predict", {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Lỗi không xác định");

    const latencyMs =
      typeof data.inference_ms === "number"
        ? data.inference_ms
        : performance.now() - t0;

    showResultsFromData(data, latencyMs);
  } catch (err) {
    showError(err.message || "Có lỗi xảy ra khi phân tích.");
  } finally {
    document
      .getElementById("preview-container")
      .classList.remove("scanning");
    document.getElementById("state-loading").classList.add("hidden");
    btn.disabled = false;
  }
}

function showResultsFromData(data, latencyMs) {
  document.getElementById("state-result").classList.remove("hidden");
  document.getElementById("roi-box").classList.remove("hidden");

  const gradeIdx = data.class;
  const gradeNum = Number.isFinite(gradeIdx)
    ? gradeIdx
    : parseInt(gradeIdx, 10);

  const meta = [
    {
      label: "KL0 — Bình thường",
      color: "text-green-400",
      rec: "Không cần can thiệp đặc biệt. Duy trì vận động và lối sống lành mạnh.",
      os: "NONE",
      jsn: "NONE",
    },
    {
      label: "KL1 — Nghi ngờ",
      color: "text-yellow-400",
      rec: "Theo dõi định kỳ, điều chỉnh tư thế và tải trọng lên khớp.",
      os: "POSSIBLE",
      jsn: "MINIMAL",
    },
    {
      label: "KL2 — Nhẹ",
      color: "text-orange-400",
      rec: "Tập phục hồi chức năng, giảm cân nếu thừa cân, hạn chế quá tải khớp.",
      os: "DEFINITE",
      jsn: "POSSIBLE",
    },
    {
      label: "KL3 — Trung bình",
      color: "text-red-400",
      rec: "Điều trị nội khoa tích cực, cân nhắc tiêm trong khớp theo chỉ định.",
      os: "MULTIPLE",
      jsn: "DEFINITE",
    },
    {
      label: "KL4 — Nặng",
      color: "text-red-500",
      rec: "Cân nhắc phẫu thuật thay khớp và phục hồi chức năng chuyên sâu.",
      os: "LARGE",
      jsn: "SEVERE",
    },
  ];
  const idx = Math.max(
    0,
    Math.min(4, Number.isNaN(gradeNum) ? 0 : gradeNum)
  );
  const info = meta[idx];

  const resGrade = document.getElementById("res-grade");
  const resLabel = document.getElementById("res-label");

  resGrade.textContent = `Grade ${idx}`;
  resGrade.className = `text-4xl font-bold ${info.color}`;

  resLabel.textContent = info.label;
  resLabel.className = `${info.color} font-medium text-sm md:text-base`;

  const conf = Number(data.confidence || 0) * 100;
  document.getElementById("res-conf").textContent = conf.toFixed(1) + "%";
  document.getElementById("res-bar").style.width =
    Math.max(0, Math.min(100, conf)) + "%";
  document.getElementById("res-rec").textContent = info.rec;

  document.getElementById("res-model").textContent = `Mô hình: ${
    data.model || "—"
  }`;
  document.getElementById("res-model-view").textContent = `Mô hình: ${
    data.model || "-"
  }`;

  document.getElementById(
    "res-latency"
  ).textContent = `Thời gian suy luận: ${latencyMs.toFixed(1)} ms`;

  const setBadge = (id, text, type) => {
    const el = document.getElementById(id);
    el.textContent = text;
    el.className = "text-xs font-mono py-1 px-2 rounded";
    if (text === "NONE") {
      el.classList.add("bg-slate-700", "text-slate-400");
    } else if (type === "bad") {
      el.classList.add("bg-red-500/10", "text-red-400");
    } else {
      el.classList.add("bg-yellow-500/10", "text-yellow-400");
    }
  };

  setBadge("det-osteo", info.os, idx > 1 ? "bad" : "warn");
  setBadge("det-jsn", info.jsn, idx > 2 ? "bad" : "warn");
  setBadge(
    "det-scl",
    idx > 2 ? "POSSIBLE" : "NONE",
    idx > 2 ? "bad" : "warn"
  );

  if (Array.isArray(data.probs) && Array.isArray(data.classes)) {
    const canvas = document.getElementById("probChart");
    if (canvas && canvas.getContext) {
      const ctx = canvas.getContext("2d");
      if (probChart) probChart.destroy();
      probChart = new Chart(ctx, {
        type: "bar",
        data: {
          labels: data.classes.map((l) => "KL" + l),
          datasets: [
            {
              label: "Xác suất",
              data: data.probs.map((p) => (p * 100).toFixed(2)),
              backgroundColor: "#22d3ee",
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                callback: (v) => v + "%",
              },
              grid: {
                color: "rgba(148,163,184,0.2)",
              },
            },
            x: {
              grid: { display: false },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) => ` ${c.parsed.y}%`,
              },
            },
          },
          animation: { duration: 700 },
        },
      });
    }
  }
}

function showError(msg) {
  const box = document.getElementById("errorBox");
  if (!box) return;
  box.textContent = msg;
  box.classList.remove("hidden");
}

function hideError() {
  const box = document.getElementById("errorBox");
  if (!box) return;
  box.classList.add("hidden");
}

// Animation for shimmer effect
const styleSheet = document.createElement("style");
styleSheet.innerText = `
        @keyframes shimmer {
            100% { transform: translateX(100%); }
        }
        @keyframes loading {
            0%, 100% { transform: translateX(-50%); }
            50% { transform: translateX(50%); }
        }
        .fade-enter {
            animation: fadeIn 0.5s ease-out;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
document.head.appendChild(styleSheet);

// Init theme + hooks
window.addEventListener("DOMContentLoaded", () => {
  let saved = defaultTheme;
  try {
    saved = localStorage.getItem("theme-choice") || defaultTheme;
  } catch (_) {}
  applyTheme(saved);
  if (themeSelect) {
    themeSelect.value = saved;
    themeSelect.addEventListener("change", (e) => applyTheme(e.target.value));
  }
});


