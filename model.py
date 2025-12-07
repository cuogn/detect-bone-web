import time
import torch, torch.nn as nn
from torchvision import models, transforms
from PIL import Image

# Nhãn KL
CLASSES = ['0','1','2','3','4']  # KL0..KL4

def get_preprocess():
    return transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.5, 0.5, 0.5], [0.5, 0.5, 0.5]),
    ])

def build_model(num_classes=5, weights_path=None, device='cpu'):
    m = models.resnet18(weights=None)  # cùng kiến trúc với lúc train
    m.fc = nn.Linear(m.fc.in_features, num_classes)
    sd = torch.load(weights_path, map_location=device)
    m.load_state_dict(sd)
    m.eval().to(device)
    return m

@torch.no_grad()
def predict_pil(img: Image.Image, model, preprocess, device='cpu'):
    if img.mode != 'RGB':
        img = img.convert('RGB')
    x = preprocess(img).unsqueeze(0).to(device)
    t0 = time.perf_counter()
    logits = model(x)
    dt_ms = (time.perf_counter() - t0) * 1000
    probs = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy().tolist()
    idx = int(torch.argmax(logits, dim=1).item())
    return idx, probs, dt_ms
