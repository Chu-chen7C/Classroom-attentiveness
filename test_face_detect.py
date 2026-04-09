import cv2
import numpy as np
import base64
import requests
import json
import sys

# 1. 生成一张包含人脸的测试图像（使用OpenCV绘制模拟人脸）
img = np.ones((480, 640, 3), dtype=np.uint8) * 240  # 浅灰背景

# 绘制人脸轮廓（椭圆形）
face_center = (320, 240)
cv2.ellipse(img, face_center, (120, 150), 0, 0, 360, (210, 180, 160), -1)  # 脸部
cv2.ellipse(img, face_center, (120, 150), 0, 0, 360, (180, 140, 100), 2)   # 轮廓

# 眼睛
cv2.ellipse(img, (270, 180), (25, 15), 0, 0, 360, (255, 255, 255), -1)
cv2.ellipse(img, (370, 180), (25, 15), 0, 0, 360, (255, 255, 255), -1)
cv2.circle(img, (270, 180), 12, (60, 40, 20), -1)   # 左眼瞳孔
cv2.circle(img, (370, 180), 12, (60, 40, 20), -1)   # 右眼瞳孔

# 鼻子
pts_nose = np.array([[320, 220], [305, 270], [320, 260], [335, 270]], np.int32)
cv2.fillPoly(img, [pts_nose], (190, 150, 120))

# 嘴巴
cv2.ellipse(img, (320, 320), (40, 15), 0, 0, 180, (180, 80, 80), -1)

# 眉毛
cv2.line(img, (245, 155), (295, 160), (80, 50, 20), 4)
cv2.line(img, (345, 160), (395, 155), (80, 50, 20), 4)

# 头发（深色区域在上方）
cv2.ellipse(img, (320, 130), (140, 80), 0, 180, 360, (40, 30, 20), -1)

# 保存测试图片
test_path = r'd:\专注度\test_face.jpg'
cv2.imwrite(test_path, img)
print(f" 测试图片已保存: {test_path}")

# 2. 转换为base64
_, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 90])
base64_str = base64.b64encode(buffer).decode('utf-8')
data_uri = f"data:image/jpeg;base64,{base64_str}"
print(f" Base64编码完成，长度: {len(base64_str)}")

# 3. 调用后端API
login_resp = requests.post('http://localhost:5000/api/auth/login', 
    json={'username': 'admin', 'password': '123456'})
token = login_resp.json().get('token', '')
print(f" Token获取成功")

headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
api_resp = requests.post('http://localhost:5000/api/face/monitoring/analyze',
    json={'image': data_uri}, headers=headers)

result = api_resp.json()
print("\n" + "="*60)
print(" 人脸检测结果:")
print("="*60)
print(json.dumps(result, indent=2, ensure_ascii=False))
print("="*60)

if result.get('faces') and len(result['faces']) > 0:
    print(f"\n 检测到 {result['totalFaces']} 张人脸！")
    for i, face in enumerate(result['faces']):
        print(f"\n   人脸 #{i+1}:")
        print(f"     位置(bbox): {face.get('bbox')}")
        print(f"     置信度: {face.get('confidence', 0)*100:.1f}%")
        print(f"     专注度分数: {face.get('attention_score')}")
        print(f"     专注度等级: {face.get('attention_level')}")
        print(f"     表情类型: {face.get('expression_type')}")
        print(f"     姿态类型: {face.get('posture_type')}")
else:
    print("\n 未检测到人脸")

print(f"\n 统计信息:")
print(f"   平均专注度: {result.get('avgAttentionScore', 0)}")
print(f"   高专注率: {result.get('highAttentionRate', 0)}%")
print(f"   中专注率: {result.get('mediumAttentionRate', 0)}%")
print(f"   低专注率: {result.get('lowAttentionRate', 0)}%")
