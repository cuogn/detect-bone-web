import os
from threading import Lock
from typing import Dict, Any
import re
import requests
from flask import Flask, render_template, request, jsonify
from PIL import Image
from model import build_model, get_preprocess, predict_pil, CLASSES

# --------------------------------------------
#  CẤU HÌNH FLASK - CHO PHÉP LOAD FILE TĨNH
# --------------------------------------------
app = Flask(
    __name__,
    static_folder='static',      # thư mục static/
    template_folder='templates'
)

DEVICE = os.environ.get('DEVICE', 'cpu')
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', 'AIzaSyA9-po0MOhxKOXTDcXr4OACp0Nx3CYiftw')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')

# Tự chọn file trọng số đúng
WEIGHTS_PATH = (
    'knee_resnet18.pt'
    if os.path.exists('knee_resnet18.pt')
    else 'best_knee_resnet18.pt'
)

MODEL_NAME = 'ResNet18'
TEST_ACC = 0.678  # bạn có thể cập nhật giá trị test acc của bạn

# --------------------------------------------
#  LAZY LOAD MODEL (NHANH KHỞI ĐỘNG)
# --------------------------------------------
_preprocess = get_preprocess()
_model = None
_lock = Lock()


def get_model():
    """Load model 1 lần duy nhất (thread-safe)"""
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                print(">>> Loading model:", WEIGHTS_PATH)
                _model = build_model(
                    num_classes=len(CLASSES),
                    weights_path=WEIGHTS_PATH,
                    device=DEVICE
                )
    return _model


# --------------------------------------------
#  HEALTH CHECK
# --------------------------------------------
@app.get("/healthz")
def health():
    return "ok", 200


# --------------------------------------------
#  TRANG CHÍNH (có thể trỏ tới sample.html luôn)
# --------------------------------------------
@app.get("/")
def index():
    return render_template(
        "index.html",    # hoặc index.html nếu bạn muốn
        model_name=MODEL_NAME,
        test_acc=TEST_ACC
    )


# --------------------------------------------
#  API DỰ ĐOÁN
# --------------------------------------------
@app.post("/predict")
def predict():
    if "file" not in request.files:
        return jsonify({"ok": False, "error": "Không thấy file ảnh."}), 400

    f = request.files["file"]

    if f.filename == "":
        return jsonify({"ok": False, "error": "Chưa chọn file."}), 400

    try:
        img = Image.open(f.stream)

        model = get_model()
        idx, probs, ms = predict_pil(img, model, _preprocess, device=DEVICE)

        return jsonify({
            "ok": True,
            "class": CLASSES[idx],          # Nhãn KL
            "confidence": float(probs[idx]),
            "probs": probs,                # Danh sách xác suất: KL0..KL4
            "classes": CLASSES,
            "model": MODEL_NAME,
            "inference_ms": round(ms, 1),
            "test_acc": TEST_ACC
        })

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


def build_prompt(payload: Dict[str, Any]) -> str:
    grade = payload.get("class", "N/A")
    conf = float(payload.get("confidence", 0.0)) * 100
    model = payload.get("model", MODEL_NAME)
    test_acc = payload.get("test_acc", TEST_ACC)
    latency = payload.get("inference_ms", "N/A")
    probs = payload.get("probs", [])
    probs_text = ", ".join([f"KL{idx}: {p*100:.1f}%" for idx, p in enumerate(probs)]) if probs else "Chưa có"

    return (
        "Bạn là Giáo sư, bác sĩ chấn thương chỉnh hình với 50 năm kinh nghiệm về thoái hóa khớp gối. "
        "Hãy trả lời bằng tiếng Việt, văn phong trang nhã, ngắn gọn, súc tích, không dùng markdown hoặc ký tự đặc biệt (** *), "
        "không viết hoa toàn bộ từ. Định dạng phản hồi:\n"
        "- Tiêu đề: Khuyến nghị từ Giáo sư (dạng câu, không in hoa toàn bộ).\n"
        "- Mục 1: Tóm tắt AI: 1–2 câu ngắn nêu kết quả dự đoán.\n"
        "- Mục 2: Ý nghĩa lâm sàng: gạch đầu dòng 2–3 ý.\n"
        "- Mục 3: Hướng xử trí đề nghị: gạch đầu dòng 3–5 ý, ưu tiên cân nhắc các lựa chọn, nhấn mạnh bác sĩ chuyên khoa quyết định.\n"
        "- Kết thúc: Cần thăm khám trực tiếp và trao đổi với bác sĩ điều trị trước khi quyết định.\n"
        "Luôn nhấn mạnh phải đối chiếu lâm sàng và tư vấn bác sĩ điều trị.\n\n"
        f"Phân loại KL dự đoán: KL{grade}\n"
        f"Độ tin cậy: {conf:.1f}%\n"
        f"Phân bố xác suất: {probs_text}\n"
        f"Mô hình: {model}, Test Acc: {test_acc}, Thời gian suy luận: {latency} ms\n"
    )


def call_gemini(prompt: str) -> str:
    if not GEMINI_API_KEY:
        raise RuntimeError("Thiếu GEMINI_API_KEY")

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )
    body = {
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ]
    }

    resp = requests.post(url, json=body, timeout=20)
    if resp.status_code != 200:
        raise RuntimeError(f"Gemini API error: {resp.status_code} {resp.text}")

    data = resp.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        raise RuntimeError(f"Gemini response parse error: {e}")


def format_recommendation(raw: str) -> str:
    """Làm sạch và định dạng lời khuyên để gọn gàng, dễ đọc."""
    if not raw:
        return ""

    text = raw
    # Loại bỏ markdown cơ bản và tiêu đề thừa
    text = re.sub(r"[*_`#]+", "", text)
    text = text.replace("—", "-").replace("–", "-")
    text = re.sub(r"\s+-\s+", "\n- ", text)
    text = re.sub(r"\s*\n\s*\n+", "\n", text).strip()

    # Tách thành dòng và chuẩn hóa bullet
    lines = []
    for line in text.split("\n"):
        l = line.strip()
        if not l:
            continue
        if l.startswith("-"):
            l = "• " + l.lstrip("-").strip()
        lines.append(l)

    # Gom nhóm theo các tiêu đề kỳ vọng nếu có
    ordered_keys = [
        "Khuyến nghị từ Giáo sư",
        "Tóm tắt AI",
        "Ý nghĩa lâm sàng",
        "Hướng xử trí đề nghị",
        "Lưu ý",
    ]

    def starts_with_any(s: str, keys):
        lower = s.lower()
        for k in keys:
            if lower.startswith(k.lower()):
                return k
        return None

    buckets = {k: [] for k in ordered_keys}
    current = None
    for l in lines:
        hit = starts_with_any(l, ordered_keys)
        if hit:
            current = hit
            # lấy phần sau dấu ":" nếu có
            parts = l.split(":", 1)
            if len(parts) > 1 and parts[1].strip():
                buckets[hit].append(parts[1].strip())
            continue
        if current:
            buckets[current].append(l)
        else:
            buckets[ordered_keys[0]].append(l)

    out_lines = []
    for k in ordered_keys:
        if not buckets[k]:
            continue
        out_lines.append(k + ":")
        out_lines.extend(buckets[k])
        out_lines.append("")  # blank line

    return "\n".join(out_lines).strip()


@app.post("/recommend")
def recommend():
    try:
        payload = request.get_json(force=True)
    except Exception:
        return jsonify({"ok": False, "error": "JSON không hợp lệ"}), 400

    if not isinstance(payload, dict):
        return jsonify({"ok": False, "error": "Payload không hợp lệ"}), 400

    try:
        prompt = build_prompt(payload)
        text = call_gemini(prompt)
        formatted = format_recommendation(text)
        return jsonify({"ok": True, "advice": formatted, "raw": text})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


# --------------------------------------------
#  RUN SERVER
# --------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))  # bắt buộc cho Render/Railway
    print(f">>> Server chạy tại http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
