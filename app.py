import os
from threading import Lock
from flask import Flask, render_template, request, jsonify
from PIL import Image
from model import build_model, get_preprocess, predict_pil, CLASSES

# Serve file tĩnh trực tiếp từ thư mục hiện tại
app = Flask(__name__, static_url_path='', static_folder='.', template_folder='.')

DEVICE = os.environ.get('DEVICE', 'cpu')
WEIGHTS_PATH = 'knee_resnet18.pt' if os.path.exists('knee_resnet18.pt') else 'best_knee_resnet18.pt'
MODEL_NAME = 'ResNet18'
TEST_ACC = 0.678

# --- Lazy-load model để server bind port ngay ---
_preprocess = get_preprocess()
_model = None
_lock = Lock()

def get_model():
    global _model
    if _model is None:
        with _lock:
            if _model is None:
                _model = build_model(num_classes=len(CLASSES), weights_path=WEIGHTS_PATH, device=DEVICE)
    return _model

@app.get('/healthz')
def healthz():
    return 'ok', 200

@app.get('/')
def index():
    # nếu index.html dùng placeholder JS thì vẫn render bình thường
    return render_template('index.html', model_name=MODEL_NAME, test_acc=TEST_ACC)

@app.post('/predict')
def predict():
    if 'file' not in request.files:
        return jsonify({'ok': False, 'error': 'Không thấy file.'}), 400
    f = request.files['file']
    if f.filename == '':
        return jsonify({'ok': False, 'error': 'Chưa chọn file.'}), 400
    try:
        img = Image.open(f.stream)
        model = get_model()  # load khi cần
        idx, probs, ms = predict_pil(img, model, _preprocess, device=DEVICE)
        return jsonify({
            'ok': True,
            'class': CLASSES[idx],
            'confidence': float(probs[idx]),
            'probs': probs,
            'classes': CLASSES,
            'model': MODEL_NAME,
            'inference_ms': round(ms, 1),
            'test_acc': TEST_ACC
        })
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)}), 500

if __name__ == '__main__':
    # BẮT BUỘC trên Render: lấy PORT từ env để bind đúng cổng
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
