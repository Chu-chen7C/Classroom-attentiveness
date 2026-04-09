import cv2, numpy as np, base64, requests

img = np.ones((480, 640, 3), dtype=np.uint8) * 200
cv2.rectangle(img, (200, 120), (440, 400), (180, 140, 100), -1)
cv2.ellipse(img, (320, 220), (80, 100), 0, 0, 360, (220, 180, 150), -1)
cv2.ellipse(img, (290, 190), (15, 20), 0, 0, 360, (40, 30, 20), -1)
cv2.ellipse(img, (350, 190), (15, 20), 0, 0, 360, (40, 30, 20), -1)
cv2.ellipse(img, (320, 260), (25, 15), 0, 0, 360, (180, 120, 80), -1)
_, buf = cv2.imencode('.jpg', img)
b64 = base64.b64encode(buf).decode('utf-8')
with open(r'd:\专注度\test_photo.jpg', 'wb') as f:
    f.write(buf)

login = requests.post('http://localhost:5000/api/auth/login', json={'username': 'admin', 'password': '123456'})
token = login.json()['token']

res = requests.post(
    'http://localhost:5000/api/face/monitoring/analyze',
    headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
    json={'image': f'data:image/jpeg;base64,{b64}'}
)
data = res.json()
print(f"=== API验证结果 ===")
print(f"状态码: {res.status_code}")
print(f"检测人脸数: {data['totalFaces']}")
for i, face in enumerate(data['faces']):
    student = face.get('matched_student')
    name = student['name'] if student else '(未注册/无匹配学生)'
    print(f"  人脸#{i}:")
    print(f"    姓名: {name}")
    print(f"    专注度: {face['attention_level']} ({face['attention_score']}分)")
    print(f"    置信度: {face['confidence']:.2f}")
    print(f"    表情: {face['expression_type']}")
    print(f"    姿态: {face['posture_type']}")
    if student:
        print(f"    matched_student字段: {student}")
