import os
from threading import Lock
from flask import Flask, render_template, request, jsonify
from PIL import Image
from model import build_model, get_preprocess, predict_pil, CLASSES

# --------------------------------------------
#  CẤU HÌNH FLASK - CHO PHÉP LOAD FILE TĨNH
# --------------------------------------------
app = Flask(
    __name__,
    static_folder='static',      # thư mục static/
    template_folder='templates'  # thư mục templates/
)

DEVICE = os.environ.get('DEVICE', 'cpu')

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
        "sample.html",    # hoặc index.html nếu bạn muốn
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


# --------------------------------------------
#  RUN SERVER
# --------------------------------------------
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))  # bắt buộc cho Render/Railway
    print(f">>> Server chạy tại http://0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=True)
