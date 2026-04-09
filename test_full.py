import cv2
import numpy as np
import base64
import requests
import json
import urllib.request

print("=== 人脸识别API完整验证 ===\n")

# 1. 使用OpenCV内置的Lenna图或下载真实人脸图片
test_urls = [
    "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg",
]

img = None
for url in test_urls:
    try:
        print(f" 尝试下载测试图片: {url}")
        resp = urllib.request.urlopen(url, timeout=10)
        arr = np.asarray(bytearray(resp.read()), dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is not None:
            print(f"    图片加载成功: {img.shape}")
            break
    except Exception as e:
        print(f"    下载失败: {e}")
        continue

if img is None:
    # 备用：使用更真实的合成人脸（增加噪声和纹理）
    print("\n 使用增强版合成人脸...")
    img = np.ones((480, 640, 3), dtype=np.uint8) * 200
    
    # 添加背景噪声模拟真实照片
    noise = np.random.randint(-20, 20, (480, 640, 3), dtype=np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    
    # 脸部 - 使用渐变色模拟真实肤色
    for y in range(90, 390):
        for x in range(200, 440):
            dx, dy = x - 320, y - 240
            dist = (dx/120)**2 + (dy/150)**2
            if dist <= 1.0:
                # 肤色渐变
                base_r, base_g, base_b = 210, 175, 145
                variation = int(np.sin(x*0.05)*10 + np.cos(y*0.03)*8)
                r = min(255, max(0, base_r + variation))
                g = min(255, max(0, base_g + variation))
                b = min(255, max(0, base_b + variation))
                img[y, x] = [b, g, r]
    
    # 眼睛 - 更真实的阴影
    for eye_cx, eye_cy in [(270, 185), (370, 185)]:
        cv2.ellipse(img, (eye_cx, eye_cy), (28, 18), 0, 0, 360, (255, 255, 255), -1)
        cv2.ellipse(img, (eye_cx, eye_cy+2), (14, 12), 0, 0, 360, (40, 30, 15), -1)
        cv2.circle(img, (eye_cx, eye_cy), 5, (0, 0, 0), -1)  # 瞳孔
        cv2.circle(img, (eye_cx-5, eye_cy-3), 3, (255, 255, 255), -1)  # 高光
    
    # 鼻子阴影
    nose_pts = np.array([[320,215],[310,265],[320,255],[330,265]], np.int32)
    cv2.fillPoly(img, [nose_pts], (180, 140, 110))
    
    # 嘴唇
    cv2.ellipse(img, (320, 325), (45, 18), 0, 0, 180, (190, 90, 95), -1)
    cv2.ellipse(img, (320, 322), (35, 10), 0, 0, 180, (220, 130, 135), -1)
    
    # 眉毛
    cv2.line(img, (240, 155), (298, 162), (60, 40, 20), 5)
    cv2.line(img, (342, 162), (400, 155), (60, 40, 20), 5)
    
    # 头发
    hair_mask = np.zeros((480, 640), dtype=np.uint8)
    cv2.ellipse(hair_mask, (320, 120), (145, 90), 0, 180, 360, 255, -1)
    img[hair_mask > 0] = [35, 25, 15]
    
    # 添加轻微高斯模糊使图片更自然
    img = cv2.GaussianBlur(img, (3, 3), 0.5)

# 保存
cv2.imwrite(r'd:\专注度\test_face.jpg', img)
print(f" 测试图片已保存")

# 2. 先本地测试OpenCV检测
print("\n 本地OpenCV人脸检测测试:")
cascade_path = cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
cascade = cv2.CascadeClassifier(cascade_path)
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

# 多尺度检测
faces = cascade.detectMultiScale(
    gray,
    scaleFactor=1.08,
    minNeighbors=4,
    minSize=(30, 30),
    maxSize=(300, 300)
)
print(f"   检测到 {len(faces)} 张人脸")
for (x, y, w, h) in faces:
    print(f"   位置: ({x}, {y}, {w}, {h})")

# 在图片上画框
for (x, y, w, h) in faces:
    cv2.rectangle(img, (x, y), (x+w, y+h), (0, 255, 0), 3)
cv2.imwrite(r'd:\专注度\test_face_detected.jpg', img)
print(" 标注结果已保存: d:\\专注度\\test_face_detected.jpg")

# 3. 转base64并调用API
_, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 92])
b64 = base64.b64encode(buffer).decode('utf-8')
data_uri = f"data:image/jpeg;base64,{b64}"

login = requests.post('http://localhost:5000/api/auth/login',
    json={'username': 'admin', 'password': '123456'})
token = login.json().get('token', '')

headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
api_result = requests.post('http://localhost:5000/api/face/monitoring/analyze',
    json={'image': data_uri}, headers=headers).json()

print("\n" + "="*60)
print(" 后端API检测结果:")
print("="*60)
print(json.dumps(api_result, indent=2, ensure_ascii=False))

if api_result.get('faces'):
    print(f"\n 成功! API检测到 {api_result['totalFaces']} 张人脸!")
    for i, f in enumerate(api_result['faces']):
        print(f"\n   人脸 #{i+1}:")
        for k, v in f.items():
            print(f"     {k}: {v}")
else:
    print("\n API未检测到人脸，检查后端日志...")

print(f"\n 统计: 均分={api_result.get('avgAttentionScore')}, 高={api_result.get('highAttentionRate')}%, 中={api_result.get('mediumAttentionRate')}%, 低={api_result.get('lowAttentionRate')}%")
