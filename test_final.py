import cv2
import numpy as np
import base64
import requests
import json

print("=== 使用本地真实照片测试后端API ===\n")

# 使用已下载的Lenna图片或用户提供的测试图
img_path = r'd:\专注度\test_real_face.jpg'
if not __import__('os').path.exists(img_path):
    img_path = r'd:\专注度\test_face.jpg'

img = cv2.imread(img_path)
if img is None:
    # 最后备用：生成更真实的测试图
    print(" 无预存图片，生成增强版测试人脸...")
    img = np.ones((480, 640, 3), dtype=np.uint8) * 210
    noise = np.random.randint(-15, 15, (480, 640, 3), dtype=np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    
    # 脸部椭圆区域（肤色）
    mask = np.zeros((480, 640), dtype=np.uint8)
    cv2.ellipse(mask, (320, 240), (120, 150), 0, 0, 360, 255, -1)
    face_color = np.array([145, 175, 210])  # BGR肤色
    for c in range(3):
        img[:,:,c][mask > 0] = face_color[c]
    
    # 眼睛（白色+深色瞳孔）
    for cx, cy in [(270, 185), (370, 185)]:
        cv2.ellipse(img, (cx, cy), (26, 17), 0, 0, 360, (255, 250, 240), -1)
        cv2.ellipse(img, (cx, cy+2), (13, 11), 0, 0, 360, (30, 20, 10), -1)
        cv2.circle(img, (cx, cy), 5, (0, 0, 0), -1)
    
    cv2.ellipse(img, (320, 325), (42, 16), 0, 0, 180, (180, 85, 90), -1)  # 嘴
    
    hair_mask = np.zeros((480, 640), dtype=np.uint8)
    cv2.ellipse(hair_mask, (320, 115), (140, 85), 0, 180, 360, 255, -1)
    img[hair_mask > 0] = [30, 22, 12]
    
    img = cv2.GaussianBlur(img, (3, 3), 0.8)

print(f" 图片: {img.shape}")

# 转base64
_, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 95])
b64 = base64.b64encode(buffer).decode('utf-8')
data_uri = f"data:image/jpeg;base64,{b64}"
print(f" Base64: {len(b64)} bytes")

# 调用API
print("\n 调用后端API...")
login = requests.post('http://localhost:5000/api/auth/login',
    json={'username': 'admin', 'password': '123456'})
token = login.json().get('token', '')

headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
result = requests.post('http://localhost:5000/api/face/monitoring/analyze',
    json={'image': data_uri}, headers=headers, timeout=30).json()

print("\n" + "="*60)
print(" API检测结果:")
print("="*60)
print(json.dumps(result, indent=2, ensure_ascii=False))

faces = result.get('faces', [])
total = result.get('totalFaces', 0)
print(f"\n{'='*60}")
if total > 0:
    print(f" 成功检测到 {total} 张人脸！")
    for i, f in enumerate(faces):
        b = f.get('bbox', [])
        print(f"\n   人脸#{i+1}:")
        print(f"     bbox: [{b[0]}, {b[1]}, {b[2]}x{b[3]}]")
        print(f"     置信度: {f.get('confidence',0)*100:.0f}%")
        print(f"     专注分: {f.get('attention_score')} ({f.get('attention_level')})")
        print(f"     表情: {f.get('expression_type')}")
        print(f"     姿态: {f.get('posture_type')}")
    
    req_fields = ['bbox','confidence','attention_score','attention_level','expression_type','posture_type']
    ok = all(f in faces[0] for f in req_fields)
    print(f"\n{'='*60}")
    if ok:
        print(" 所有字段完整！前端可正常渲染姓名+状态标签")
    else:
        missing = [f for f in req_fields if f not in faces[0]]
        print(f" 缺少字段: {missing}")
else:
    print(" 未检测到人脸")
    if 'error' in result:
        print(f"   错误: {result['error']}")
print(f"{'='*60}")
