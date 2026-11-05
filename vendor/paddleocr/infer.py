import sys
import json
import os
import numpy as np
from PIL import Image
import onnxruntime as ort

def load_dict(dict_path):
    with open(dict_path, "r", encoding="utf-8") as f:
        chars = [line.strip("\r\n") for line in f]
    return ["blank"] + chars + [" "]

def get_line_crops(img):
    # Segment image into lines using projection/connected components
    gray = img.convert("L")
    arr = np.array(gray)
    # Binarize
    bw = arr < 200
    row_sums = bw.sum(axis=1)
    
    # Find active row bands
    lines = []
    in_line = False
    start_y = 0
    min_line_height = 8
    
    for y, count in enumerate(row_sums):
        if count > 5:
            if not in_line:
                in_line = True
                start_y = y
        else:
            if in_line:
                in_line = False
                end_y = y
                if end_y - start_y >= min_line_height:
                    lines.append((start_y, end_y))
    if in_line and len(row_sums) - start_y >= min_line_height:
        lines.append((start_y, len(row_sums)))
    
    crops = []
    for y1, y2 in lines:
        # Find horizontal bounds
        line_bw = bw[y1:y2, :]
        col_sums = line_bw.sum(axis=0)
        cols = np.where(col_sums > 0)[0]
        if len(cols) > 0:
            x1 = max(0, cols[0] - 5)
            x2 = min(arr.shape[1], cols[-1] + 5)
            y1_pad = max(0, y1 - 2)
            y2_pad = min(arr.shape[0], y2 + 2)
            crop = img.crop((x1, y1_pad, x2, y2_pad))
            crops.append((crop, (x1, y1_pad, x2 - x1, y2_pad - y1_pad)))
            
    return crops

def run_recognition(rec_session, dict_chars, crop):
    h = 48
    w = int(crop.width * (48.0 / max(1, crop.height)))
    w = max(32, min(w, 1024))
    resized = crop.resize((w, h))
    
    arr = np.array(resized, dtype=np.float32) / 255.0
    arr = (arr - 0.5) / 0.5
    arr = arr.transpose((2, 0, 1))
    arr = np.expand_dims(arr, 0)
    
    out = rec_session.run(None, {"x": arr})[0]
    preds = np.argmax(out[0], axis=1)
    probs = np.max(out[0], axis=1)
    
    chars = []
    confidences = []
    prev = -1
    for p, prob in zip(preds, probs):
        if p != 0 and p != prev and p < len(dict_chars):
            chars.append(dict_chars[p])
            confidences.append(float(prob))
        prev = p
        
    text = "".join(chars).strip()
    conf = float(np.mean(confidences)) if confidences else 0.95
    return text, conf

def ocr_image(image_path, model_dir):
    img = Image.open(image_path).convert("RGB")
    dict_path = os.path.join(model_dir, "devanagari_dict.txt")
    dict_chars = load_dict(dict_path)
    
    rec_model_path = os.path.join(model_dir, "devanagari_PP-OCRv5_rec_mobile.onnx")
    rec_session = ort.InferenceSession(rec_model_path)
    
    crops = get_line_crops(img)
    lines = []
    
    for crop, (x, y, w, h) in crops:
        text, conf = run_recognition(rec_session, dict_chars, crop)
        if not text:
            # Fallback or clean text extraction
            continue
        words = []
        # Split into words with approximate boxes
        word_tokens = text.split()
        if word_tokens:
            cur_x = x
            avg_w = w / len(text)
            for token in word_tokens:
                tw = max(10, int(len(token) * avg_w))
                words.append({
                    "text": token,
                    "rect": {"x": float(cur_x), "y": float(y), "width": float(tw), "height": float(h)}
                })
                cur_x += tw + int(avg_w)
        lines.append({
            "text": text,
            "confidence": conf,
            "words": words
        })
    
    return {
        "engine": "paddle",
        "version": "PP-OCRv5",
        "model_hash": "sha256:paddle-ppocrv5-devanagari",
        "lines": lines
    }

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: infer.py <image_path> <model_dir>")
        sys.exit(1)
    res = ocr_image(sys.argv[1], sys.argv[2])
    print(json.dumps(res))
