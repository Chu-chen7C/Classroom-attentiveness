import cv2
import numpy as np
import base64
import requests
import json
import urllib.request

print("=== 使用真实照片(Lenna)测试后端API ===\n")

# 1. 下载Lenna图片（真实人脸照片）
url = "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/lena.jpg"
print(f" 下载测试图片...")
resp = urllib.request.urlopen(url, timeout=15)
arr = np.asarray(bytearray(resp.read()), dtype=np.uint8)
img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
print(f"    图片加载成功: {img.shape}")

cv2.imwrite(r'd:\专注度\test_real_face.jpg', img)

# 2. 转base64
_, buffer = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 95])
b64 = base64.b64encode(buffer).decode('utf-8')
data_uri = f"data:image/jpeg;base64,{b64}"
print(f"    Base64编码完成: {len(b64)} bytes")

# 3. 调用API
print("\n 调用后端人脸识别API...")
login = requests.post('http://localhost:5000/api/auth/login',
    json={'username': 'admin', 'password': '123456'})
token = login.json().get('token', '')

headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
api_resp = requests.post('http://localhost:5000/api/face/monitoring/analyze',
    json={'image': data_uri}, headers=headers, timeout=30)
result = api_resp.json()

print("\n" + "="*60)
print(" 完整检测结果:")
print("="*60)
print(json.dumps(result, indent=2, ensure_ascii=False))
print("="*60)

# 结果分析
faces = result.get('faces', [])
total = result.get('totalFaces', 0)
print(f"\n{'='*60}")
print(" 验证结果分析:")
print(f"{'='*60}")
print(f"  人脸数量: {total}")

if total > 0:
    print(f"   人脸检测: 成功!")
    for i, face in enumerate(faces):
        bbox = face.get('bbox', [])
        print(f"\n   人脸 #{i+1}:")
        print(f"      检测框(bbox): [{bbox[0]}, {bbox[1]}, {bbox[2]}, {bbox[3]}]")
        print(f"      置信度: {face.get('confidence', 0)*100:.1f}%")
        print(f"      专注度分数: {face.get('attention_score')}")
        print(f"      专注度等级: {face.get('attention_level')}")
        print(f"      表情类型: {face.get('expression_type')}")
        print(f"      姿态类型: {face.get('posture_type')}")
    
    print(f"\n   班级统计:")
    print(f"     平均专注度: {result.get('avgAttentionScore')}")
    print(f"     高专注率: {result.get('highAttentionRate')}%")
    print(f"     中专注率: {result.get('mediumAttentionRate')}%")
    print(f"     低专注率: {result.get('lowAttentionRate')}%")
    
    # 验证字段完整性
    required = ['bbox', 'confidence', 'attention_score', 'attention_level', 'expression_type', 'posture_type']
    missing = [f for f in required if f not in faces[0]]
    if missing:
        print(f"\n   缺少字段: {missing}")
    else:
        print(f"\n   所有必要字段齐全！前端可正常显示")
else:
    print(f"   未检测到人脸")

print(f"\n{'='*60}")
